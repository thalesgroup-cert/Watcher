# coding=utf-8
"""
Dangling DNS Detection Module

This module handles detection of dangling DNS (subdomain takeover vulnerabilities).
Inspired by Subsnipe: https://github.com/dub-flow/subsnipe
"""

import os
import json
import logging
import dns.resolver
import requests
import urllib3
from typing import Dict, Tuple, Optional
from django.utils import timezone
from django.conf import settings
from .models import DnsTwisted

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Configure logger
logger = logging.getLogger('watcher.dns_finder.dangling')

# Dangling DNS Constants
FINGERPRINTS_FILE = os.path.join(os.path.dirname(__file__), 'data', 'fingerprints.json')
FINGERPRINTS_URL = 'https://raw.githubusercontent.com/EdOverflow/can-i-take-over-xyz/master/fingerprints.json'


def update_dangling_fingerprints():
    """
    Download and update fingerprints for dangling DNS detection.
    Called automatically by scheduler once per day.
    """
    try:
        logger.info('Updating dangling DNS fingerprints...')
        
        # Create data directory if necessary
        data_dir = os.path.join(os.path.dirname(__file__), 'data')
        os.makedirs(data_dir, exist_ok=True)
        
        # Download with proxy if configured
        proxies = {}
        if settings.HTTP_PROXY:
            proxies['http'] = settings.HTTP_PROXY
        if settings.HTTPS_PROXY:
            proxies['https'] = settings.HTTPS_PROXY
            
        response = requests.get(FINGERPRINTS_URL, proxies=proxies, timeout=30, verify=False)
        response.raise_for_status()
        
        # Save
        with open(FINGERPRINTS_FILE, 'w') as f:
            json.dump(response.json(), f, indent=2)
        
        logger.info('Fingerprints updated successfully')
        return True
    except Exception as e:
        logger.error(f'Failed to update fingerprints: {str(e)}')
        return False


def load_fingerprints() -> Dict:
    """Load fingerprints from file."""
    try:
        if not os.path.exists(FINGERPRINTS_FILE):
            logger.warning('Fingerprints file not found, attempting download...')
            update_dangling_fingerprints()
        
        with open(FINGERPRINTS_FILE, 'r') as f:
            fingerprints_list = json.load(f)
        
        # Index by CNAME and service for fast lookup
        fingerprint_map = {}
        for fp in fingerprints_list:
            if 'cname' in fp:
                for cname in fp['cname']:
                    fingerprint_map[cname.lower()] = fp
            if 'service' in fp:
                fingerprint_map[fp['service'].lower()] = fp
        
        logger.debug(f'Loaded {len(fingerprint_map)} fingerprints')
        return fingerprint_map
    except Exception as e:
        logger.error(f'Error loading fingerprints: {str(e)}')
        return {}


def get_cname_record(domain: str) -> Optional[str]:
    """Query CNAME record of a domain."""
    try:
        resolver = dns.resolver.Resolver()
        resolver.timeout = 5
        resolver.lifetime = 5
        
        answers = resolver.resolve(domain, 'CNAME')
        if answers:
            cname = str(answers[0].target).rstrip('.')
            logger.debug(f'CNAME found for {domain}: {cname}')
            return cname
    except dns.resolver.NoAnswer:
        logger.debug(f'No CNAME record for {domain}')
    except dns.resolver.NXDOMAIN:
        logger.debug(f'Domain does not exist: {domain}')
    except Exception as e:
        logger.debug(f'Error querying CNAME for {domain}: {str(e)}')
    
    return None


def extract_service_name(domain: str) -> str:
    """Extract SLD (second-level domain)."""
    parts = domain.split('.')
    if len(parts) >= 3:
        return parts[-2]  # azurewebsites from xxx.azurewebsites.net
    return ""


def is_vulnerable_cname(cname: str, fingerprints: Dict) -> Tuple[bool, bool, str, bool]:
    """Check if a CNAME is vulnerable."""
    cname = cname.lower().rstrip('.')
    
    for pattern, fp in fingerprints.items():
        if cname.endswith(pattern):
            return (
                True,
                fp.get('vulnerable', False),
                fp.get('fingerprint', ''),
                fp.get('nxdomain', False)
            )
    
    return False, False, "", False


def check_takeover_dns(cname: str) -> bool:
    """Check takeover via DNS (NXDOMAIN)."""
    try:
        resolver = dns.resolver.Resolver()
        resolver.timeout = 5
        resolver.lifetime = 5
        resolver.resolve(cname, 'A')
        return False
    except dns.resolver.NXDOMAIN:
        logger.info(f'NXDOMAIN for {cname} - Takeover possible!')
        return True
    except:
        return False


def check_takeover_http(cname: str, fingerprint_text: str) -> bool:
    """Check takeover via HTTP (fingerprint)."""
    try:
        proxies = {}
        if settings.HTTP_PROXY:
            proxies['http'] = settings.HTTP_PROXY
        if settings.HTTPS_PROXY:
            proxies['https'] = settings.HTTPS_PROXY
        
        url = f'http://{cname}'
        response = requests.get(url, proxies=proxies, timeout=10, verify=False, allow_redirects=True)
        
        if fingerprint_text and fingerprint_text in response.text:
            logger.info(f'Fingerprint matched for {cname} - Takeover possible!')
            return True
        return False
    except:
        return False


def detect_dangling_dns(domain: str) -> Dict:
    """
    Main function: detect dangling DNS
    
    Returns:
        {
            'status': 'safe' | 'exploitable' | 'takeover_possible' | 'unknown',
            'cname': 'xxx.service.com' or None,
            'info': 'Detailed description',
            'vulnerable': True/False
        }
    """
    result = {
        'status': 'unknown',
        'cname': None,
        'info': None,
        'vulnerable': False,
    }
    
    try:
        # 1. Load fingerprints
        fingerprints = load_fingerprints()
        if not fingerprints:
            return result
        
        # 2. Get CNAME
        cname = get_cname_record(domain)
        if not cname:
            result['status'] = 'safe'
            result['info'] = 'No CNAME record found'
            return result
        
        result['cname'] = cname
        
        # 3. Check direct match
        direct_match, vulnerable, fingerprint_text, has_nxdomain = is_vulnerable_cname(cname, fingerprints)
        
        if direct_match:
            if vulnerable:
                # Check if takeover is really possible
                takeover_check = check_takeover_dns(cname) if has_nxdomain else check_takeover_http(cname, fingerprint_text)
                
                if takeover_check:
                    result['status'] = 'takeover_possible'
                    result['info'] = f'CNAME → {cname} (Takeover Likely Possible!)'
                    result['vulnerable'] = True
                else:
                    result['status'] = 'exploitable'
                    result['info'] = f'CNAME → {cname} (vulnerable)'
                    result['vulnerable'] = True
            else:
                result['status'] = 'safe'
                result['info'] = f'CNAME → {cname} (safe)'
        else:
            # 4. Try service match
            service_name = extract_service_name(cname)
            if service_name and service_name in fingerprints:
                fp = fingerprints[service_name]
                if fp.get('vulnerable'):
                    result['status'] = 'exploitable'
                    result['info'] = f'CNAME → {cname} (service: {service_name} - potentially vulnerable)'
                    result['vulnerable'] = True
                else:
                    result['status'] = 'safe'
                    result['info'] = f'CNAME → {cname} (service: {service_name} - safe)'
            else:
                result['status'] = 'unknown'
                result['info'] = f'CNAME → {cname} (exploitability unknown)'
        
        logger.info(f'Dangling detection for {domain}: {result["status"]}')
        
    except Exception as e:
        logger.error(f'Error detecting dangling for {domain}: {str(e)}')
        result['info'] = f'Error: {str(e)}'
    
    return result


def check_all_dangling_dns():
    """
    Check all DnsTwisted for dangling DNS.
    Called automatically by scheduler every 6 hours.
    """
    logger.info('=== Starting automatic dangling DNS check ===')
    
    twisted_domains = DnsTwisted.objects.all()
    checked_count = 0
    vulnerable_count = 0
    
    for twisted in twisted_domains:
        try:
            result = detect_dangling_dns(twisted.domain_name)
            
            twisted.dangling_status = result['status']
            twisted.dangling_cname = result['cname']
            twisted.dangling_info = result['info']
            twisted.dangling_checked_at = timezone.now()
            twisted.save(update_fields=['dangling_status', 'dangling_cname', 'dangling_info', 'dangling_checked_at'])
            
            checked_count += 1
            if result['vulnerable']:
                vulnerable_count += 1
                logger.warning(f'Vulnerable domain detected: {twisted.domain_name} -> {result["cname"]}')
                
        except Exception as e:
            logger.error(f'Error checking {twisted.domain_name}: {str(e)}')
    
    logger.info(f'=== Dangling DNS check completed: {checked_count} domains, {vulnerable_count} vulnerable ===')
    return checked_count, vulnerable_count
