"""
What the screenshot service may load. Every address the browser asks for, the page itself and each of its images, scripts
and redirects, goes through `allowed`: only http(s) towards public addresses. The browser runs the code of the pages it
visits, so it must not be a way to reach the network of the host. The connections themselves are opened by `egress`, on
an address checked when it is used.
"""
import ipaddress
import socket
from urllib.parse import urlparse

MAX_URL_LENGTH = 2000


def _resolve(host):
    """The addresses of the host; an empty list when it does not resolve."""
    try:
        return sorted({info[4][0] for info in socket.getaddrinfo(host, None)})
    except (socket.gaierror, UnicodeError):
        return []


def public_addresses(host):
    """The addresses of the host, when it resolves and every one of them is public; otherwise an empty list."""
    addresses = _resolve(host)
    try:
        if addresses and all(ipaddress.ip_address(address.split('%')[0]).is_global for address in addresses):
            return addresses
    except ValueError:
        pass
    return []


def host_is_public(host):
    """True when every address the host resolves to is a public one."""
    return bool(public_addresses(host))


def refusal(url):
    """
    Why a page is not loaded, as one word: None when it is allowed, `address` (not an http(s) address), `dns` (the host does
    not resolve) or `private` (it resolves to an address that is not public).
    """
    if not isinstance(url, str) or len(url) > MAX_URL_LENGTH:
        return 'address'
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname:
        return 'address'
    if not _resolve(parsed.hostname):
        return 'dns'
    return None if host_is_public(parsed.hostname) else 'private'


def allowed(url):
    """True for an http(s) address whose host is public. Nothing else is ever loaded."""
    return refusal(url) is None
