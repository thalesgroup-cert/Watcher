import requests
import time
import tldextract
import logging
import threading

# Configure logger
logger = logging.getLogger('watcher.common')

# The IANA bootstrap file (RFC 9224) says which RDAP server answers for each extension. Watcher reads it instead of keeping its
# own list: an extension that is missing from a hand-written list never gets a date, and a list rots.
BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json'
BOOTSTRAP_TTL = 24 * 3600      # the file changes rarely: read it once a day
BOOTSTRAP_RETRY = 600          # after a failed read, try again in ten minutes (the last good copy is used meanwhile)
RDAP_TIMEOUT = (5, 15)         # connect, read: a registry that does not answer must not hold a job for half a minute
MAX_RETRY_AFTER = 5            # seconds a registry that says "slow down" is waited for, once

_bootstrap = {'servers': {}, 'next_read': 0.0}
_bootstrap_lock = threading.Lock()


def _read_bootstrap():
    """The bootstrap file as {extension: [base URL ending in '/', https first]}."""
    response = requests.get(BOOTSTRAP_URL, timeout=RDAP_TIMEOUT)
    response.raise_for_status()
    servers = {}
    for extensions, urls in response.json()['services']:
        ordered = sorted((u if u.endswith('/') else u + '/' for u in urls), key=lambda u: not u.startswith('https'))
        for extension in extensions:
            servers[extension.lower()] = ordered
    return servers


def _bootstrap_servers():
    with _bootstrap_lock:
        now = time.monotonic()
        if now >= _bootstrap['next_read']:
            try:
                _bootstrap['servers'] = _read_bootstrap()
                _bootstrap['next_read'] = now + BOOTSTRAP_TTL
            except Exception as exc:  # unreachable, not JSON, changed shape: keep the last good copy
                _bootstrap['next_read'] = now + BOOTSTRAP_RETRY
                logger.warning(f"Could not read the IANA RDAP bootstrap ({type(exc).__name__}: {str(exc)[:80]}); "
                               + ("the last copy is used" if _bootstrap['servers'] else "no RDAP lookup is possible until it is read"))
        return _bootstrap['servers']


def reset_bootstrap():
    """Forget the bootstrap that was read (the tests, and nothing else)."""
    with _bootstrap_lock:
        _bootstrap.update(servers={}, next_read=0.0)


def ascii_domain(domain):
    """The domain as a registry wants it: lowercase, no trailing dot, internationalised names in punycode."""
    domain = (domain or '').strip().strip('.').lower()
    try:
        return domain.encode('idna').decode('ascii')
    except UnicodeError:
        return domain


# The public suffix list that ships with tldextract (no download: a lookup must not depend on a site being reachable)
_suffixes = tldextract.TLDExtract(suffix_list_urls=())


def has_subdomain(domain):
    """
    The name has a part in front of its registrable domain ("en.wordpress.com", "zimbra.free.fr"). A registry only knows
    registrable domains, so its "does not exist" says nothing about such a name.
    """
    parts = _suffixes(ascii_domain(domain))
    return bool(parts.subdomain and parts.domain and parts.suffix)


def rdap_servers_for(domain):
    """The RDAP servers (base URLs ending in '/') that answer for the extension of `domain`; empty when none does."""
    name = ascii_domain(domain)
    if '.' not in name:
        return []
    return list(_bootstrap_servers().get(name.rsplit('.', 1)[-1], []))


class RDAPDiscovery:
    """
    RDAP (Registration Data Access Protocol) lookup of one domain, on the server the IANA bootstrap names for its extension.

    After `fetch_rdap_data()`, `status` says what happened, so that the caller can tell a domain that does not exist from a
    server that did not answer:
      - 'ok'           the registry answered with the record of the domain;
      - 'not_found'    the registry answered that the domain does not exist (an answer, not a failure);
      - 'unsupported'  the extension has no RDAP server;
      - 'rate_limited' the registry said to slow down, twice;
      - 'error'        no usable answer (timeout, refused, not JSON).
    """

    def __init__(self, domain):
        """
        :param domain: The domain name to analyze
        :type domain: str
        """
        self.domain = domain
        self.response = None
        self.rdap_data = None
        self.status = None
        self.detail = None  # when status is not ok: the HTTP code or the kind of error, to say what went wrong

    def fetch_rdap_data(self):
        """
        Fetch the RDAP record of the domain from the registry of its extension.

        :return: True if RDAP data was successfully fetched, False otherwise (see `status` for why)
        :rtype: bool
        """
        servers = rdap_servers_for(self.domain)
        if not servers:
            self.status = 'unsupported'
            return False

        name = ascii_domain(self.domain)
        outcome = 'error'
        for base in servers:
            for attempt in (1, 2):
                try:
                    self.response = requests.get(
                        f"{base}domain/{name}",
                        headers={'Accept': 'application/rdap+json', 'User-Agent': 'Watcher-RDAP-Client/1.0'},
                        timeout=RDAP_TIMEOUT,
                    )
                except requests.exceptions.RequestException as exc:
                    # A timeout or a reset connection is often passing: one more try, a second later
                    outcome, self.detail = 'error', type(exc).__name__
                    if attempt == 1:
                        time.sleep(1)
                        continue
                    break
                code = self.response.status_code
                if code == 200:
                    try:
                        self.rdap_data = self.response.json()
                    except ValueError:
                        outcome, self.detail = 'error', 'not JSON'
                        break
                    self.status, self.detail = 'ok', None
                    return True
                if code == 404:
                    # The server of the extension is the one that knows: it says the domain does not exist
                    self.status, self.detail = 'not_found', None
                    return False
                if code == 429:
                    outcome, self.detail = 'rate_limited', 'HTTP 429'
                    try:
                        wait = float(self.response.headers.get('Retry-After', '1'))
                    except ValueError:
                        wait = 1.0
                    if attempt == 1 and wait <= MAX_RETRY_AFTER:
                        time.sleep(wait)
                        continue
                    break
                outcome, self.detail = 'error', f'HTTP {code}'
                if code >= 500 and attempt == 1:  # the registry is struggling: one more try
                    time.sleep(1)
                    continue
                break
        self.status = outcome
        return False

    def get_registrar(self):
        """
        Extract registrar information from RDAP response.
        
        :return: Registrar name or empty string if not found
        :rtype: str
        """
        if not self.rdap_data:
            return ""
        
        try:
            entities = self.rdap_data.get('entities', [])
            for entity in entities:
                roles = entity.get('roles', [])
                if 'registrar' in roles:
                    vcard_array = entity.get('vcardArray', [])
                    if len(vcard_array) > 1:
                        for vcard_entry in vcard_array[1]:
                            if isinstance(vcard_entry, list) and len(vcard_entry) >= 4:
                                if vcard_entry[0] == 'fn':  # Full name
                                    return vcard_entry[3].strip()
                    
                    public_ids = entity.get('publicIds', [])
                    for public_id in public_ids:
                        if public_id.get('type') == 'IANA Registrar ID':
                            return f"Registrar ID: {public_id.get('identifier', '')}"
                    
                    return entity.get('handle', '').strip()
            
            return ""
            
        except Exception as e:
            logger.error(f"Error parsing RDAP registrar data: {str(e)}")
            return ""
    
    def get_expiration_date(self):
        """
        Extract expiration date from RDAP response.
        
        :return: Expiration date in YYYY-MM-DD format or None if not found
        :rtype: str or None
        """
        if not self.rdap_data:
            return None
        
        try:
            events = self.rdap_data.get('events', [])
            for event in events:
                if event.get('eventAction') == 'expiration':
                    event_date = event.get('eventDate')
                    if event_date:
                        return event_date.split('T')[0]
            
            return None
            
        except Exception as e:
            logger.error(f"Error parsing RDAP expiration date: {str(e)}")
            return None

    def get_registration_date(self):
        """
        Extract registration date from RDAP response.
        
        :return: Registration date in YYYY-MM-DD format or None if not found
        :rtype: str or None
        """
        if not self.rdap_data:
            return None
        
        try:
            events = self.rdap_data.get('events', [])
            for event in events:
                if event.get('eventAction') == 'registration':
                    event_date = event.get('eventDate')
                    if event_date:
                        return event_date.split('T')[0]
            
            return None
            
        except Exception as e:
            logger.error(f"Error parsing RDAP registration date: {str(e)}")
            return None


# Configuration constants
RDAP_SERVICE_CONFIG = {
    'timeout': 30,
    'rate_limit_delay': 1,
    'max_retries': 3,
    'user_agent': 'Watcher-RDAP-Client/1.0'
}

# Common RDAP endpoints for various TLDs
RDAP_ENDPOINTS = {
    'generic': [
        'https://rdap.verisign.com/com/v1/domain/',
        'https://rdap.verisign.com/net/v1/domain/',
        'https://rdap.org.ua/domain/',
        'https://rdap.centralnic.com/domain/',
    ],
    'tld_specific': {
        'com': 'https://rdap.verisign.com/com/v1/domain/',
        'net': 'https://rdap.verisign.com/net/v1/domain/',
        'org': 'https://rdap.publicinterestregistry.org/rdap/domain/',
        'fr': 'https://rdap.nic.fr/domain/',
        'uk': 'https://rdap.nominet.uk/uk/domain/',
        'de': 'https://rdap.denic.de/domain/',
        'nl': 'https://rdap.sidn.nl/domain/',
    }
}