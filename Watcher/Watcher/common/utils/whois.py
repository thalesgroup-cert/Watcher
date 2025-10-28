import re
import requests
import time
import logging
from django.conf import settings
from django.utils import timezone

# Configure logger
logger = logging.getLogger('watcher.common')

class WhoisDiscovery:
    """
    A comprehensive WHOIS discovery client for domain analysis.
    
    This class handles WHOIS data extraction from external services,
    with support for multiple registrar patterns and date formats.
    """
    
    def __init__(self, domain):
        """
        Initialize the WHOIS discovery client.
        
        :param domain: The domain name to analyze
        :type domain: str
        """
        self.domain = domain
        self.response = None
        self.service_url = "http://www.whois-raynette.fr/whois/"
        
    def fetch_whois_data(self):
        """
        Fetch WHOIS data from the external WHOIS service.
        
        Sends a request to the configured WHOIS service and stores the response
        for further processing. Includes proper error handling and timeouts.
        
        :return: True if WHOIS data was successfully fetched, False otherwise
        :rtype: bool
        """
        try:
            url = f"{self.service_url}{self.domain}"
            
            self.response = requests.get(
                url,
                verify=False,
                timeout=30
            )
            
            return self.response.status_code == 200
            
        except requests.exceptions.RequestException as e:
            return False
    
    def get_registrar(self):
        """
        Extract registrar information from WHOIS response.
        
        Uses multiple regex patterns to identify registrar information
        from various WHOIS response formats. Automatically cleans and
        formats the registrar name for consistency.
        
        :return: Cleaned registrar name or empty string if not found
        :rtype: str
        """
        if not self.response or self.response.status_code != 200:
            return ""
            
        try:
            registrar_match = re.findall(r"Registrar URL: (.*?)<br>", self.response.text, re.IGNORECASE)
            if registrar_match:
                registrar_url = registrar_match[0].strip()
                
                registrar_name = registrar_url.split("//")[-1] 
                registrar_name = registrar_name.split("www.")[-1]
                registrar_name = registrar_name.split("/")[0]
                registrar_name = registrar_name.split(".")[0]
                
                return registrar_name.title()
            
            registrar_match = re.findall(r"Registrar: *(.*?)<br>", self.response.text, re.IGNORECASE)
            if registrar_match:
                return registrar_match[0].strip()
            
            alternative_patterns = [
                r"strar: *(.*?)<br>",
                r"Sponsoring Registrar: *(.*?)<br>",
                r"Registrar Name: *(.*?)<br>"
            ]
            
            for pattern in alternative_patterns:
                registrar_match = re.findall(pattern, self.response.text, re.IGNORECASE)
                if registrar_match:
                    return registrar_match[0].strip()
            
            return ""
            
        except Exception as e:
            return ""
    
    def get_expiration_date(self):
        """
        Extract expiration date from WHOIS response.
        
        Searches for expiration date information using multiple patterns
        to handle different WHOIS response formats. Returns standardized
        date format for consistent storage.
        
        :return: Expiration date in YYYY-MM-DD format or None if not found
        :rtype: str or None
        """
        if not self.response or self.response.status_code != 200:
            return None
            
        try:
            # Common expiration date patterns
            expiration_patterns = [
                r"Registry Expiry Date: *(\d{4}-\d{2}-\d{2})",
                r"Expiry Date: *(\d{4}-\d{2}-\d{2})",
                r"Expiration Date: *(\d{4}-\d{2}-\d{2})",
                r"Expires: *(\d{4}-\d{2}-\d{2})",
                r"expire: *(\d{4}-\d{2}-\d{2})",
            ]
            
            for pattern in expiration_patterns:
                match = re.search(pattern, self.response.text, re.IGNORECASE)
                if match:
                    return match.group(1)
            
            return None
            
        except Exception as e:
            return None


def get_domains_needing_whois():
    """
    Retrieve domains that require WHOIS lookup.
    
    Identifies domains in the database that lack registrar information
    and are therefore candidates for WHOIS discovery.
    
    :return: QuerySet of domains requiring WHOIS lookup
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
        logger.error(f"Error retrieving domains for WHOIS lookup: {str(e)}")
        from site_monitoring.models import Site
        return Site.objects.none()


def perform_single_whois_lookup(domain):
    """
    Perform WHOIS lookup for a single domain and update its information.
    
    Executes complete WHOIS discovery for a domain, including registrar
    and expiration date extraction. Automatically updates legitimacy status
    when domains transition from available/disabled to registered.
    
    :param domain: The domain object to update
    :type domain: Site
    :return: True if domain was successfully updated, False otherwise
    :rtype: bool
    """
    try:
        whois = WhoisDiscovery(domain.domain_name)
        
        if whois.fetch_whois_data():
            registrar = whois.get_registrar()
            expiration_date = whois.get_expiration_date()
            
            updated = False
            update_info = []
            old_legitimacy = domain.legitimacy
            
            # Process registrar information
            if registrar:
                domain.registrar = registrar
                updated = True
                update_info.append(f"registrar='{registrar}'")
                
                # Auto-update legitimacy based on registration status
                if domain.auto_update_legitimacy_on_registration():
                    update_info.append(f"legitimacy: {old_legitimacy} → {domain.legitimacy} (now registered)")
                    logger.info(f"Auto-updated legitimacy for {domain.domain_name}: available/disabled → registered")
            
            if expiration_date:
                domain.domain_expiry = expiration_date
                updated = True
                update_info.append(f"domain_expiry='{expiration_date}'")
            
            if updated:
                domain.save()
                logger.info(f"Successfully updated WHOIS data for {domain.domain_name}: {', '.join(update_info)}")
                return True
            else:
                logger.warning(f"No WHOIS data found for domain {domain.domain_name}")
                return False
        else:
            logger.error(f"Failed to fetch WHOIS data for domain {domain.domain_name}")
            return False
            
    except Exception as e:
        logger.error(f"Error processing WHOIS lookup for {domain.domain_name}: {str(e)}")
        return False


def update_domain_registrar_info():
    """
    Update registrar information for all domains requiring WHOIS lookup.
    
    Main function that orchestrates the WHOIS discovery process for all
    domains lacking registrar information. Includes rate limiting to
    prevent service overload and comprehensive logging.
    
    :return: None
    :rtype: None
    """
    
    # Retrieve domains requiring WHOIS lookup
    domains_to_update = get_domains_needing_whois()
    
    if not domains_to_update.exists():
        logger.info("No domains require WHOIS lookup at this time")
        return
    
    for domain in domains_to_update:
        logger.debug(f"Processing WHOIS for domain: {domain.domain_name}")
        
        success = perform_single_whois_lookup(domain)
        
        time.sleep(1)
    
    logger.info("WHOIS discovery process completed successfully")


def manual_whois_discovery():
    """
    Manually trigger WHOIS discovery process.
    
    Provides a manual entry point for triggering WHOIS discovery,
    useful for administrative operations or testing purposes.
    
    :return: True if process was initiated successfully, False otherwise
    :rtype: bool
    """
    try:
        logger.info("Manual WHOIS discovery initiated")
        update_domain_registrar_info()
        return True
    except Exception as e:
        logger.error(f"Error in manual WHOIS discovery: {str(e)}")
        return False


WHOIS_SERVICE_CONFIG = {
    'base_url': 'http://www.whois-raynette.fr/whois/',
    'timeout': 30,
    'rate_limit_delay': 1, 
    'max_retries': 3
}

# Legitimacy status mappings for automatic updates
LEGITIMACY_TRANSITIONS = {
    4: 3,
    6: 5,
}