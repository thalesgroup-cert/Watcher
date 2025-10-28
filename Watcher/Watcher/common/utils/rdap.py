import requests
import json
import time
import logging
from django.conf import settings
from django.utils import timezone
from .whois import WhoisDiscovery, perform_single_whois_lookup

# Configure logger
logger = logging.getLogger('watcher.common')

class RDAPDiscovery:
    """
    A comprehensive RDAP (Registration Data Access Protocol) discovery client for domain analysis.
    
    This class handles RDAP data extraction from various registries,
    with automatic fallback to WHOIS when RDAP data is unavailable.
    """
    
    def __init__(self, domain):
        """
        Initialize the RDAP discovery client.
        
        :param domain: The domain name to analyze
        :type domain: str
        """
        self.domain = domain
        self.response = None
        self.rdap_data = None
        
        # Common RDAP endpoints - can be extended
        self.rdap_endpoints = [
            "https://rdap.verisign.com/com/v1/domain/",
            "https://rdap.verisign.com/net/v1/domain/",
            "https://rdap.org.ua/domain/",
            "https://rdap.centralnic.com/domain/",
            "https://rdap.nic.fr/domain/",
        ]
    
    def get_rdap_endpoint_for_tld(self, domain):
        """
        Get the appropriate RDAP endpoint for a given domain's TLD.
        
        :param domain: The domain name
        :type domain: str
        :return: RDAP endpoint URL or None
        :rtype: str or None
        """
        tld = domain.split('.')[-1].lower()
        
        # TLD to RDAP endpoint mapping
        tld_mappings = {
            'com': 'https://rdap.verisign.com/com/v1/domain/',
            'net': 'https://rdap.verisign.com/net/v1/domain/',
            'org': 'https://rdap.publicinterestregistry.org/rdap/domain/',
            'fr': 'https://rdap.nic.fr/domain/',
            'uk': 'https://rdap.nominet.uk/uk/domain/',
            'de': 'https://rdap.denic.de/domain/',
            'nl': 'https://rdap.sidn.nl/domain/',
        }
        
        return tld_mappings.get(tld)
    
    def fetch_rdap_data(self):
        """
        Fetch RDAP data from appropriate registry endpoints.
        
        Tries the specific TLD endpoint first, then falls back to generic endpoints.
        
        :return: True if RDAP data was successfully fetched, False otherwise
        :rtype: bool
        """
        endpoints_to_try = []
        
        tld_endpoint = self.get_rdap_endpoint_for_tld(self.domain)
        if tld_endpoint:
            endpoints_to_try.append(tld_endpoint)
        
        endpoints_to_try.extend(self.rdap_endpoints)
        
        for endpoint in endpoints_to_try:
            try:
                url = f"{endpoint}{self.domain}"
                
                self.response = requests.get(
                    url,
                    headers={
                        'Accept': 'application/rdap+json',
                        'User-Agent': 'Watcher-RDAP-Client/1.0'
                    },
                    timeout=30
                )
                
                if self.response.status_code == 200:
                    self.rdap_data = self.response.json()
                    return True
                    
            except (requests.exceptions.RequestException, json.JSONDecodeError):
                continue
        
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


def perform_single_rdap_lookup(domain):
    """
    Perform RDAP lookup for a single domain with WHOIS fallback.
    
    Executes RDAP discovery first, and if no data is found, falls back to WHOIS.
    Automatically updates legitimacy status when domains transition from 
    available/disabled to registered.
    
    :param domain: The domain object to update
    :type domain: Site
    :return: True if domain was successfully updated, False otherwise
    :rtype: bool
    """
    try:
        rdap = RDAPDiscovery(domain.domain_name)
        
        if rdap.fetch_rdap_data():
            registrar = rdap.get_registrar()
            expiration_date = rdap.get_expiration_date()
            
            updated = False
            update_info = []
            old_legitimacy = domain.legitimacy
            
            # Process registrar information
            if registrar:
                domain.registrar = registrar
                updated = True
                update_info.append(f"registrar='{registrar}' (RDAP)")
                
                # Auto-update legitimacy based on registration status
                if domain.auto_update_legitimacy_on_registration():
                    update_info.append(f"legitimacy: {old_legitimacy} → {domain.legitimacy} (now registered)")
                    logger.info(f"Auto-updated legitimacy for {domain.domain_name}: available/disabled → registered")
            
            if expiration_date:
                domain.domain_expiry = expiration_date
                updated = True
                update_info.append(f"domain_expiry='{expiration_date}' (RDAP)")
            
            if updated:
                domain.save()
                logger.info(f"Successfully updated RDAP data for {domain.domain_name}: {', '.join(update_info)}")
                return True
            else:
                logger.info(f"No RDAP data found for domain {domain.domain_name}, falling back to WHOIS")
                return perform_single_whois_lookup(domain)
        else:
            logger.info(f"RDAP lookup failed for domain {domain.domain_name}, falling back to WHOIS")
            return perform_single_whois_lookup(domain)
            
    except Exception as e:
        logger.error(f"Error processing RDAP lookup for {domain.domain_name}: {str(e)}, falling back to WHOIS")
        return perform_single_whois_lookup(domain)


def get_domains_needing_lookup():
    """
    Retrieve domains that require RDAP/WHOIS lookup.
    
    Identifies domains in the database that lack registrar information
    and are therefore candidates for domain discovery.
    
    :return: QuerySet of domains requiring lookup
    :rtype: django.db.models.QuerySet
    """
    try:
        from site_monitoring.models import Site
        
        domains_to_update = Site.objects.filter(
            registrar__isnull=True
        ) | Site.objects.filter(
            registrar__exact=""
        )
        
        return domains_to_update
        
    except Exception as e:
        logger.error(f"Error retrieving domains for lookup: {str(e)}")
        from site_monitoring.models import Site
        return Site.objects.none()


def update_domain_registrar_info():
    """
    Update registrar information for all domains requiring RDAP/WHOIS lookup.
    
    Main function that orchestrates the domain discovery process for all
    domains lacking registrar information. Tries RDAP first, then falls back
    to WHOIS. Includes rate limiting and comprehensive logging.
    
    :return: None
    :rtype: None
    """
    logger.info("Starting RDAP/WHOIS discovery process...")
    
    domains_to_update = get_domains_needing_lookup()
    
    if not domains_to_update.exists():
        logger.info("No domains require RDAP/WHOIS lookup at this time")
        return
    
    for domain in domains_to_update:
        logger.info(f"Processing lookup for domain: {domain.domain_name}")
        
        success = perform_single_rdap_lookup(domain)
        
        if success:
            pass
        
        time.sleep(1)
    
    logger.info("RDAP/WHOIS discovery process completed successfully")


def manual_rdap_discovery():
    """
    Manually trigger RDAP/WHOIS discovery process.
    
    Provides a manual entry point for triggering domain discovery,
    useful for administrative operations or testing purposes.
    
    :return: True if process was initiated successfully, False otherwise
    :rtype: bool
    """
    try:
        logger.info("Manual RDAP/WHOIS discovery initiated")
        update_domain_registrar_info()
        return True
    except Exception as e:
        logger.error(f"Error in manual RDAP/WHOIS discovery: {str(e)}")
        return False


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