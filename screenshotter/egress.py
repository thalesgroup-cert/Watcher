"""
The only way out of the browser: a small HTTP proxy, in this process, that Chromium is told to use. Each connection it opens
goes to an address checked at that very moment (the name is resolved once, here, and the socket is opened on that address),
so a site that answers a public address to a first look and a private one to the browser (DNS rebinding) reaches nothing.
It also covers what the request filter of the browser does not see, such as WebSockets. HTTPS passes through untouched
(CONNECT): the proxy never reads it.
"""
import logging
import select
import socket
import socketserver
import threading
from urllib.parse import urlsplit

import guard

logger = logging.getLogger('screenshotter')

CONNECT_TIMEOUT = 15
IDLE_TIMEOUT = 60
MAX_HEADER_BYTES = 64 * 1024


def open_connection(host, port):
    """A socket to the host on one of its public addresses, or None when it has none (or none that answers)."""
    for address in guard.public_addresses(host):
        try:
            return socket.create_connection((address, port), timeout=CONNECT_TIMEOUT)
        except OSError:
            continue
    return None


def _pipe(first, second):
    """Copy the bytes both ways until one side closes or stays silent too long."""
    sockets = [first, second]
    while True:
        readable, _, failed = select.select(sockets, [], sockets, IDLE_TIMEOUT)
        if failed or not readable:
            return
        for source in readable:
            data = source.recv(65536)
            if not data:
                return
            (second if source is first else first).sendall(data)


def _read_head(connection):
    """The request line and the headers, and the bytes already read after them."""
    buffer = b''
    while b'\r\n\r\n' not in buffer:
        chunk = connection.recv(8192)
        if not chunk or len(buffer) > MAX_HEADER_BYTES:
            return None, b''
        buffer += chunk
    head, _, rest = buffer.partition(b'\r\n\r\n')
    return head.decode('latin-1').split('\r\n'), rest


class _Handler(socketserver.BaseRequestHandler):
    def _refuse(self, status):
        self.request.sendall(f'HTTP/1.1 {status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'.encode())

    def handle(self):
        self.request.settimeout(IDLE_TIMEOUT)
        try:
            lines, rest = _read_head(self.request)
            if not lines:
                return
            method, target, version = (lines[0].split(' ') + ['', '', ''])[:3]
            if method.upper() == 'CONNECT':
                host, _, port = target.rpartition(':')
                upstream = open_connection(host.strip('[]'), int(port or 443)) if host else None
                if upstream is None:
                    return self._refuse('403 Forbidden')
                with upstream:
                    self.request.sendall(b'HTTP/1.1 200 Connection established\r\n\r\n')
                    if rest:
                        upstream.sendall(rest)
                    _pipe(self.request, upstream)
                return
            parts = urlsplit(target)
            if parts.scheme != 'http' or not parts.hostname:
                return self._refuse('400 Bad Request')
            upstream = open_connection(parts.hostname, parts.port or 80)
            if upstream is None:
                return self._refuse('403 Forbidden')
            path = (parts.path or '/') + (f'?{parts.query}' if parts.query else '')
            headers = [line for line in lines[1:]
                       if line.split(':', 1)[0].strip().lower() not in ('proxy-connection', 'connection')]
            request = '\r\n'.join([f'{method} {path} {version}'] + headers + ['Connection: close', '', '']).encode('latin-1')
            with upstream:
                upstream.sendall(request + rest)
                _pipe(self.request, upstream)
        except (OSError, ValueError):
            return


class _Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def start():
    """Start the proxy on a free local port; returns its address for the browser (http://127.0.0.1:port)."""
    server = _Server(('127.0.0.1', 0), _Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f'http://127.0.0.1:{server.server_address[1]}'
