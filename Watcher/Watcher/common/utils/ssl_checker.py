import ssl
import socket
import logging
from datetime import datetime
from urllib.parse import urlparse

# Configure logger
logger = logging.getLogger('watcher.common')


class SSLCertificateChecker:
    """
    A comprehensive SSL certificate checker for domain analysis.
    
    This class handles SSL certificate data extraction for domains,
    including expiration date and certificate validation.
    """
    
    def __init__(self, domain, port=443, timeout=10):
        """
        Initialize SSL certificate checker.
        
        :param domain: Domain name to check
        :type domain: str
        :param port: Port to connect to (default: 443)
        :type port: int
        :param timeout: Connection timeout in seconds
        :type timeout: int
        """
        self.domain = self._clean_domain(domain)
        self.port = port
        self.timeout = timeout
        self.cert_data = None
    
    def _clean_domain(self, domain):
        """
        Clean domain name by removing protocol and path.
        
        :param domain: Domain name to clean
        :type domain: str
        :return: Cleaned domain name
        :rtype: str
        """
        # Remove protocol if present
        if '://' in domain:
            parsed = urlparse(domain)
            domain = parsed.netloc or parsed.path
        
        # Remove port if present
        domain = domain.split(':')[0]
        
        # Remove path
        domain = domain.split('/')[0]
        
        return domain.strip()
    
    def fetch_certificate(self):
        """
        Fetch SSL certificate information from the domain.
        
        :return: True if certificate was successfully fetched, False otherwise
        :rtype: bool
        """
        try:
            # Create SSL context and enforce TLS 1.2 minimum
            context = ssl.create_default_context()
            context.minimum_version = ssl.TLSVersion.TLSv1_2
            
            # Connect to the server and get certificate
            with socket.create_connection((self.domain, self.port), timeout=self.timeout) as sock:
                with context.wrap_socket(sock, server_hostname=self.domain) as ssock:
                    self.cert_data = ssock.getpeercert()
                    
            logger.debug(f"Successfully fetched SSL certificate for {self.domain}")
            return True
            
        except ssl.SSLError as e:
            logger.debug(f"SSL error fetching certificate for {self.domain}: {str(e)}")
            return False
        except socket.gaierror as e:
            logger.debug(f"DNS resolution failed for {self.domain}: {str(e)}")
            return False
        except socket.timeout as e:
            logger.debug(f"Connection timeout for {self.domain}: {str(e)}")
            return False
        except ConnectionRefusedError as e:
            logger.debug(f"Connection refused for {self.domain}: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error fetching certificate for {self.domain}: {str(e)}")
            return False
    
    def get_expiration_date(self):
        """
        Extract expiration date from SSL certificate.
        
        :return: Expiration date in YYYY-MM-DD format or None if not found
        :rtype: str or None
        """
        if not self.cert_data:
            return None
        
        try:
            # Get notAfter field from certificate
            not_after = self.cert_data.get('notAfter')
            
            if not not_after:
                return None
            
            # Parse date from format: 'Jan 1 12:00:00 2026 GMT'
            expiry_date = datetime.strptime(not_after, '%b %d %H:%M:%S %Y %Z')
            
            # Return in YYYY-MM-DD format
            return expiry_date.strftime('%Y-%m-%d')
            
        except ValueError as e:
            logger.error(f"Error parsing SSL expiration date for {self.domain}: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error extracting SSL expiration date for {self.domain}: {str(e)}")
            return None
    
    def get_issue_date(self):
        """
        Extract issue date from SSL certificate.
        
        :return: Issue date in YYYY-MM-DD format or None if not found
        :rtype: str or None
        """
        if not self.cert_data:
            return None
        
        try:
            # Get notBefore field from certificate
            not_before = self.cert_data.get('notBefore')
            
            if not not_before:
                return None
            
            # Parse date from format: 'Jan 1 12:00:00 2025 GMT'
            issue_date = datetime.strptime(not_before, '%b %d %H:%M:%S %Y %Z')
            
            # Return in YYYY-MM-DD format
            return issue_date.strftime('%Y-%m-%d')
            
        except ValueError as e:
            logger.error(f"Error parsing SSL issue date for {self.domain}: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error extracting SSL issue date for {self.domain}: {str(e)}")
            return None
    
    def get_issuer(self):
        """
        Extract issuer information from SSL certificate.
        
        :return: Issuer name or None if not found
        :rtype: str or None
        """
        if not self.cert_data:
            return None
        
        try:
            issuer = self.cert_data.get('issuer', ())
            
            # Extract organization name from issuer tuple
            for item in issuer:
                for key, value in item:
                    if key == 'organizationName':
                        return value
            
            return None
            
        except Exception as e:
            logger.error(f"Error extracting SSL issuer for {self.domain}: {str(e)}")
            return None
    
    def get_subject_alt_names(self):
        """
        Extract Subject Alternative Names (SANs) from SSL certificate.
        
        :return: List of alternative names or empty list
        :rtype: list
        """
        if not self.cert_data:
            return []
        
        try:
            san = self.cert_data.get('subjectAltName', ())
            return [value for type_, value in san if type_ == 'DNS']
            
        except Exception as e:
            logger.error(f"Error extracting SANs for {self.domain}: {str(e)}")
            return []


def get_ssl_expiration_date(domain):
    """
    Quick helper function to get SSL expiration date for a domain.
    
    :param domain: Domain name to check
    :type domain: str
    :return: SSL expiration date in YYYY-MM-DD format or None
    :rtype: str or None
    """
    checker = SSLCertificateChecker(domain)
    
    if checker.fetch_certificate():
        return checker.get_expiration_date()
    
    return None


def perform_single_ssl_check(site):
    """
    Perform SSL certificate check for a single site and update its information.
    
    :param site: The site object to update
    :type site: Site
    :return: True if site was successfully updated, False otherwise
    :rtype: bool
    """
    try:
        checker = SSLCertificateChecker(site.domain_name)
        
        if checker.fetch_certificate():
            ssl_expiry = checker.get_expiration_date()
            
            if ssl_expiry:
                old_ssl_expiry = site.ssl_expiry
                
                # Only update if different
                if str(old_ssl_expiry) != ssl_expiry:
                    site.ssl_expiry = ssl_expiry
                    site.save()
                    
                    logger.info(f"Updated SSL expiry for {site.domain_name}: {old_ssl_expiry} → {ssl_expiry}")
                    
                    # Create alert if SSL expiry changed
                    if old_ssl_expiry is not None:
                        from site_monitoring.models import Alert
                        Alert.objects.create(
                            site=site,
                            type="SSL Certificate Expiry Changed",
                            old_ssl_expiry=old_ssl_expiry,
                            new_ssl_expiry=ssl_expiry
                        )
                        logger.info(f"Created SSL expiry change alert for {site.domain_name}")
                    
                    return True
                else:
                    logger.debug(f"SSL expiry unchanged for {site.domain_name}: {ssl_expiry}")
                    return True
            else:
                logger.warning(f"Could not extract SSL expiry date for {site.domain_name}")
                return False
        else:
            logger.debug(f"Failed to fetch SSL certificate for {site.domain_name}")
            return False
            
    except Exception as e:
        logger.error(f"Error performing SSL check for {site.domain_name}: {str(e)}")
        return False


# Connections opened at the same time to read the certificates of the legitimate domains (each waits for a server)
SSL_WORKERS = 12


def _certificate_expiry(domain_name):
    """The expiry date of the certificate of a domain ('YYYY-MM-DD'), None when it cannot be read. No database here."""
    try:
        checker = SSLCertificateChecker(domain_name)
        return checker.get_expiration_date() if checker.fetch_certificate() else None
    except Exception as e:
        logger.debug(f"No certificate for {domain_name}: {type(e).__name__}")
        return None


def update_legitimate_domains_ssl_certificates(workers=SSL_WORKERS):
    """
    Read the certificate of every legitimate domain the registry knows and keep its expiry date. The reads wait for the
    servers, so they run side by side; the database is only written from here. A domain whose certificate cannot be read
    keeps the date it had.

    :return: (domains whose certificate was read, domains whose date changed)
    :rtype: tuple
    """
    from concurrent.futures import ThreadPoolExecutor
    from django.db import close_old_connections
    from common.models import LegitimateDomain

    close_old_connections()
    domains = list(LegitimateDomain.objects.exclude(expiry_check='not_registered').values_list('pk', 'domain_name', 'ssl_expiry'))
    if not domains:
        return 0, 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        expiries = list(pool.map(_certificate_expiry, [name for _, name, _ in domains]))
    checked = updated = 0
    for (pk, name, old), expiry in zip(domains, expiries):
        if not expiry:
            continue
        checked += 1
        if str(old) != expiry:
            # A queryset update: a save would write a timeline event for every domain at every pass
            LegitimateDomain.objects.filter(pk=pk).update(ssl_expiry=expiry)
            updated += 1
            logger.info(f"Updated SSL expiry for {name}: {old} -> {expiry}")
    return checked, updated


def update_all_sites_ssl_certificates():
    """
    Update SSL certificate information for all monitored sites.
    
    :return: Number of sites successfully updated
    :rtype: int
    """
    from site_monitoring.models import Site
    from django.db import close_old_connections
    
    close_old_connections()
    
    # Get all monitored sites with valid domain names
    sites = Site.objects.filter(monitored=True).exclude(domain_name__isnull=True).exclude(domain_name__exact='')
    
    if not sites.exists():
        logger.info("No monitored sites found for SSL certificate check")
        return 0
    
    success_count = 0
    
    for site in sites:
        logger.debug(f"Checking SSL certificate for: {site.domain_name}")
        
        if perform_single_ssl_check(site):
            success_count += 1
    
    logger.info(f"SSL certificate check completed: {success_count}/{sites.count()} sites updated successfully")
    
    return success_count
