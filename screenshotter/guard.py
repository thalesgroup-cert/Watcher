"""
What the screenshot service may load. Every address the browser asks for, the page itself and each of its images, scripts
and redirects, goes through `allowed`: only http(s) towards public addresses. The browser runs the code of the pages it
visits, so it must not be a way to reach the network of the host.
"""
import ipaddress
import socket
from urllib.parse import urlparse

MAX_URL_LENGTH = 2000


def host_is_public(host):
    """True when every address the host resolves to is a public one."""
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(host, None)}
    except (socket.gaierror, UnicodeError):
        return False
    try:
        return bool(addresses) and all(ipaddress.ip_address(address.split('%')[0]).is_global for address in addresses)
    except ValueError:
        return False


def allowed(url):
    """True for an http(s) address whose host is public. Nothing else is ever loaded."""
    if not isinstance(url, str) or len(url) > MAX_URL_LENGTH:
        return False
    parsed = urlparse(url)
    return parsed.scheme in ('http', 'https') and bool(parsed.hostname) and host_is_public(parsed.hostname)
