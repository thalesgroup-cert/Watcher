"""
Screenshot service of Watcher: `POST /screenshot {"url": "https://..."}` answers with a JPEG of the page, `GET /health`
with "ok". It runs in its own container, on a network that only Watcher shares, and does one capture at a time.

Each capture uses a new browser and a new context, thrown away afterwards: no cookie, cache or storage survives from a
page to the next. Downloads are refused, dialogs are dismissed, service workers are blocked, and every request the page
makes is checked by `guard.allowed` (public http(s) addresses only).
"""
import json
import logging
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import sync_playwright

import guard

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s | screenshotter: %(message)s',
                    datefmt='%d/%b/%Y %H:%M:%S')
logger = logging.getLogger('screenshotter')

PORT = 8080  # also the one of the HEALTHCHECK of the image
# The browser looks like an ordinary one: nothing in it tells that a Thales tool visits the page
USER_AGENT = os.environ.get('SCREENSHOT_USER_AGENT') or (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36')
# Optional proxy for the browser, to leave from another address: http://host:port
PROXY = os.environ.get('SCREENSHOT_PROXY', '')
WIDTH = 1280
VIEWPORT_HEIGHT = 800
MAX_HEIGHT = int(os.environ.get('SCREENSHOT_MAX_HEIGHT', '6000'))
LOAD_TIMEOUT_MS = int(os.environ.get('SCREENSHOT_LOAD_TIMEOUT', '30')) * 1000
SETTLE_MS = 1500
QUALITY = 70

_one_at_a_time = threading.Lock()


def capture(url):
    """The JPEG of a page (its first MAX_HEIGHT pixels). Raises on a page that does not load."""
    launch = {'args': ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']}
    if PROXY:
        launch['proxy'] = {'server': PROXY}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(**launch)
        try:
            context = browser.new_context(
                viewport={'width': WIDTH, 'height': VIEWPORT_HEIGHT}, user_agent=USER_AGENT, accept_downloads=False,
                service_workers='block', locale='en-US')

            def check(route):
                if guard.allowed(route.request.url):
                    route.continue_()
                else:
                    route.abort('blockedbyclient')

            context.route('**/*', check)
            page = context.new_page()
            page.set_default_timeout(LOAD_TIMEOUT_MS)
            page.on('dialog', lambda dialog: dialog.dismiss())
            page.goto(url, wait_until='load')
            page.wait_for_timeout(SETTLE_MS)
            height = page.evaluate('Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)')
            clip = {'x': 0, 'y': 0, 'width': WIDTH, 'height': max(VIEWPORT_HEIGHT, min(int(height), MAX_HEIGHT))}
            return page.screenshot(type='jpeg', quality=QUALITY, full_page=True, clip=clip)
        finally:
            browser.close()


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body=b'', content_type='text/plain'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/health':
            self._send(200, b'ok')
        else:
            self._send(404, b'not found')

    def do_POST(self):
        if self.path != '/screenshot':
            return self._send(404, b'not found')
        try:
            size = int(self.headers.get('Content-Length', '0'))
            url = json.loads(self.rfile.read(min(size, 10_000)) or b'{}').get('url')
        except (ValueError, AttributeError):
            return self._send(400, b'invalid request')
        if not guard.allowed(url):
            logger.warning('refused: not a public http(s) address')
            return self._send(400, b'address not allowed')
        with _one_at_a_time:
            try:
                image = capture(url)
            except Exception as exc:  # the page did not load, or took too long
                logger.warning(f'capture failed ({type(exc).__name__}): {str(exc).splitlines()[0][:150]}')
                return self._send(502, b'capture failed')
        logger.info(f'captured {len(image) // 1024} KB')
        self._send(200, image, 'image/jpeg')

    def log_message(self, format, *args):  # the access lines are not needed: Watcher logs each capture
        pass


if __name__ == '__main__':
    logger.info(f'listening on {PORT}' + (' (through a proxy)' if PROXY else ''))
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
