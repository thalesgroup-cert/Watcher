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
            # Create SSL context
            context = ssl.create_default_context()
            
            # Connect to the server and get certificate
            with socket.create_connection((self.domain, self.port), timeout=self.timeout) as sock:
                with context.wrap_socket(sock, server_hostname=self.domain) as ssock:
                    self.cert_data = ssock.getpeercert()
                    
            logger.debug(f"Successfully fetched SSL certificate for {self.domain}")
            return True
            
        except ssl.SSLError as e:
            logger.warning(f"SSL error fetching certificate for {self.domain}: {str(e)}")
            return False
        except socket.gaierror as e:
            logger.warning(f"DNS resolution failed for {self.domain}: {str(e)}")
            return False
        except socket.timeout as e:
            logger.warning(f"Connection timeout for {self.domain}: {str(e)}")
            return False
        except ConnectionRefusedError as e:
            logger.warning(f"Connection refused for {self.domain}: {str(e)}")
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
            logger.warning(f"Failed to fetch SSL certificate for {site.domain_name}")
            return False
            
    except Exception as e:
        logger.error(f"Error performing SSL check for {site.domain_name}: {str(e)}")
        return False


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
