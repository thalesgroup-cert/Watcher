"""
The small icon of the sites an article comes from, for the list of articles of a word.

The browser never asks the sites: Watcher fetches the icon once, from its own network, and serves it. Only a site that
holds an article or a source of Watcher is fetched (the address is never taken from the request), through the same
download as the web pages of Site Monitoring: public addresses only, each redirect checked, the connection opened on the
address that was checked. The answer is a small image of a known kind, kept in memory (Watcher runs one worker).
"""
import logging
import re
import time
from collections import OrderedDict
from urllib.parse import urljoin, urlparse

import requests
from django.http import HttpResponse
from rest_framework import permissions
from rest_framework.views import APIView

from common.api import WatcherThrottle
from site_monitoring.core import PAGE_USER_AGENT, PageError, is_public, page_session
from .models import PostUrl, Source

logger = logging.getLogger('watcher.threats_watcher')

ICON_TIMEOUT = (3, 5)
MAX_ICON_BYTES = 64 * 1024
MAX_PAGE_BYTES = 200 * 1024
MAX_REDIRECTS = 3
KEEP_FOUND = 7 * 86400
KEEP_MISSING = 3600
MAX_ENTRIES = 500
HOST = re.compile(r'^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$')

# host -> (valid until, (content type, bytes) or None when the site has no usable icon)
_cache = OrderedDict()


def sniff(body):
    """The kind of image these bytes are, among those shown as they are; None for anything else (a page, a vector image)."""
    if body[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    if body[:4] == b'\x00\x00\x01\x00':
        return 'image/x-icon'
    if body[:4] == b'GIF8':
        return 'image/gif'
    if body[:3] == b'\xff\xd8\xff':
        return 'image/jpeg'
    if body[:4] == b'RIFF' and body[8:12] == b'WEBP':
        return 'image/webp'
    return None


def known_host(host):
    """The address an article or a source of Watcher is read at on this site (with or without www), else None."""
    for candidate in (host, f'www.{host}'):
        for scheme in ('https', 'http'):
            prefix = f'{scheme}://{candidate}/'
            if PostUrl.objects.filter(url__istartswith=prefix).exists() or Source.objects.filter(url__istartswith=prefix).exists():
                return candidate
    return None


def _download(session, url, limit, truncate=False):
    """The bytes at this address, or None: not public, not answering, not a 200, or longer than `limit` (cut when `truncate`)."""
    headers = {'User-Agent': PAGE_USER_AGENT, 'Accept': 'image/*,text/html;q=0.8,*/*;q=0.5'}
    for _ in range(MAX_REDIRECTS + 1):
        parsed = urlparse(url)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or not is_public(parsed.hostname):
            return None
        try:
            response = session.get(url, headers=headers, timeout=ICON_TIMEOUT, allow_redirects=False, stream=True)
        except (PageError, requests.exceptions.RequestException):
            return None
        try:
            if response.is_redirect and response.headers.get('Location'):
                url = urljoin(url, response.headers['Location'])
                continue
            if response.status_code != 200:
                return None
            body = b''
            for chunk in response.iter_content(8192):
                body += chunk
                if len(body) > limit:
                    return body[:limit] if truncate else None
            return body
        except requests.exceptions.RequestException:
            return None
        finally:
            response.close()
    return None


_TAG = re.compile(r'<link\b[^>]*>', re.I)
_REL = re.compile(r'rel\s*=\s*["\']([^"\']+)["\']', re.I)
_HREF = re.compile(r'href\s*=\s*["\']([^"\']+)["\']', re.I)


def icon_link(html, base):
    """The address of the icon a page declares (<link rel="icon" href=...>), else None."""
    for tag in _TAG.findall(html):
        rel, href = _REL.search(tag), _HREF.search(tag)
        if rel and href and 'icon' in rel.group(1).lower() and 'mask' not in rel.group(1).lower():
            return urljoin(base, href.group(1))
    return None


def fetch_icon(host):
    """(content type, bytes) of the icon of this site: /favicon.ico, else the one its home page declares. None when there is none."""
    session = page_session()
    base = f'https://{host}/'
    body = _download(session, base + 'favicon.ico', MAX_ICON_BYTES)
    kind = sniff(body) if body else None
    if kind:
        return kind, body
    page = _download(session, base, MAX_PAGE_BYTES, truncate=True)
    link = icon_link(page.decode('utf-8', 'ignore'), base) if page else None
    body = _download(session, link, MAX_ICON_BYTES) if link else None
    kind = sniff(body) if body else None
    return (kind, body) if kind else None


def icon_for(host):
    """The icon of a known site, from the memory when it was fetched lately (a missing icon is remembered for an hour)."""
    now = time.time()
    held = _cache.get(host)
    if held and held[0] > now:
        _cache.move_to_end(host)
        return held[1]
    real = known_host(host)
    if not real:
        return None  # not a site of Watcher: nothing is fetched, nothing is remembered
    try:
        found = fetch_icon(real)
    except Exception:  # an icon is never worth an error
        logger.debug('Favicon of %s: failed', host, exc_info=True)
        found = None
    _cache[host] = (now + (KEEP_FOUND if found else KEEP_MISSING), found)
    while len(_cache) > MAX_ENTRIES:
        _cache.popitem(last=False)
    return found


class FaviconThrottle(WatcherThrottle):
    scope = 'favicon'


class FaviconView(APIView):
    """`?host=cert.example`: the small icon of that site, 404 when there is none. Public, like the articles it goes with."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [FaviconThrottle]

    def get(self, request):
        host = request.query_params.get('host', '').strip().lower()
        icon = icon_for(host) if HOST.match(host) and len(host) <= 253 else None
        if not icon:
            missing = HttpResponse(status=404)
            missing['Cache-Control'] = 'public, max-age=3600'
            return missing
        kind, body = icon
        response = HttpResponse(body, content_type=kind)
        response['Cache-Control'] = 'public, max-age=86400'
        response['X-Content-Type-Options'] = 'nosniff'
        return response
