# coding=utf-8
"""
CertStream WebSocket Client with Enterprise Proxy Support

This module provides a WebSocket client for connecting to certstream-server-go
with automatic proxy detection and internal network bypass.

Compatible with Docker networking and enterprise proxy configurations.
"""

import ipaddress
import os
import json
import socket
import time
import logging
import threading
from urllib.parse import urlparse
import websocket
from connectors.core import get_certstream_config

logger = logging.getLogger('watcher.dns_finder')


class CertStreamClient:
    """
    WebSocket client for CertStream with proxy support and automatic reconnection.

    Features:
    - Automatic proxy detection and bypass for internal URLs
    - Keepalive pings handled by websocket-client
    - Automatic reconnection on failures (iterative: the call stack never grows)
    - Reset of a connection that stopped delivering certificates
    - Periodic statistics, so a dead stream is visible in the logs
    - Thread-safe operation
    """

    def __init__(self, url=None, callback=None, ping_interval=30, reconnect_delay=5,
                 idle_timeout=600, stats_interval=300):
        """
        Initialize CertStream client.

        :param url: WebSocket URL (default: from the CertStream connector configuration)
        :param callback: Callback function to handle messages
        :param ping_interval: Seconds between ping messages (0 to disable)
        :param reconnect_delay: Seconds to wait before reconnection attempt
        :param idle_timeout: Seconds without any message before the connection is reset (0 to disable)
        :param stats_interval: Seconds between two statistics log lines (0 to disable)
        """
        self.url = url or get_certstream_config()['url']
        self.callback = callback
        self.ping_interval = ping_interval
        self.reconnect_delay = reconnect_delay
        self.idle_timeout = idle_timeout
        self.stats_interval = stats_interval
        self.ws = None
        self.should_reconnect = True
        self.connection_thread = None
        self._stop_event = threading.Event()
        self._last_message_at = time.monotonic()
        self._messages_received = 0

        # Configure proxy settings
        self._setup_proxy()

    def _setup_proxy(self):
        """
        Configure proxy settings based on environment and URL.
        Internal URLs bypass proxy automatically.
        """
        # Check if URL is internal (no proxy needed)
        if self.is_internal_url(self.url):
            logger.info(f"CertStream URL {self.url} is internal - bypassing proxy")
            self.http_proxy = None
            self.https_proxy = None
            self._bypass_proxy_env(urlparse(self.url).hostname)
        else:
            # Use environment proxy settings for external URLs
            self.http_proxy = os.environ.get('HTTP_PROXY') or os.environ.get('http_proxy')
            self.https_proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
            if self.http_proxy or self.https_proxy:
                logger.info(f"Using proxy for external CertStream connection")

    @staticmethod
    def _bypass_proxy_env(hostname):
        """
        Make websocket-client connect to ``hostname`` directly.
        """
        if not hostname:
            return
        base = os.environ.get('no_proxy') or os.environ.get('NO_PROXY') or ''
        for name in ('no_proxy', 'NO_PROXY'):
            entries = [entry.strip() for entry in (os.environ.get(name) or base).split(',') if entry.strip()]
            if hostname not in entries:
                entries.append(hostname)
            os.environ[name] = ','.join(entries)

    def is_internal_url(self, url):
        """
        Check if URL is internal (Docker service or local network).

        :param url: URL to check
        :return: True if internal, False otherwise
        """
        parsed = urlparse(url)
        hostname = parsed.hostname or parsed.netloc.split(':')[0]

        # Check NO_PROXY environment variable
        no_proxy = os.environ.get('NO_PROXY', '') or os.environ.get('no_proxy', '')
        no_proxy_list = [h.strip() for h in no_proxy.split(',') if h.strip()]

        # Check if hostname matches NO_PROXY entries
        for no_proxy_host in no_proxy_list:
            if hostname == no_proxy_host:
                return True
            # Check for domain suffix match (e.g., .docker.internal)
            if no_proxy_host.startswith('.') and hostname.endswith(no_proxy_host):
                return True

        if not hostname:
            return False
        if hostname == 'localhost':
            return True

        try:
            address = ipaddress.ip_address(hostname)
        except ValueError:
            # A name without any dot cannot be a public DNS name: it is a Docker or Kubernetes
            # service name (certstream, <release>-certstream...). Anything else, such as the
            # public certstream.calidog.io, is external unless NO_PROXY lists it.
            return '.' not in hostname
        return address.is_private

    def _on_message(self, ws, message):
        """Handle incoming WebSocket messages."""
        self._last_message_at = time.monotonic()
        try:
            data = json.loads(message)
            if data.get('message_type') == 'certificate_update':
                self._messages_received += 1
                if self.callback:
                    self.callback(data, None)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode CertStream message: {e}")
        except Exception as e:
            logger.error(f"Error in CertStream callback: {e}")

    def _on_error(self, ws, error):
        """Handle WebSocket errors."""
        logger.error(f"CertStream WebSocket error: {error}")

    def _on_close(self, ws, close_status_code, close_msg):
        """Handle WebSocket connection close (reconnection is up to the _connect loop)."""
        logger.warning(f"CertStream connection closed: {close_status_code} - {close_msg}")

    def _on_open(self, ws):
        """Handle WebSocket connection open."""
        self._last_message_at = time.monotonic()
        logger.info(f"CertStream connection established to {self.url}")

    def _run_kwargs(self):
        """Keyword arguments of WebSocketApp.run_forever (keepalive, explicit external proxy)."""
        kwargs = {}
        if self.ping_interval > 0:
            kwargs['ping_interval'] = self.ping_interval
            kwargs['ping_timeout'] = min(10, self.ping_interval / 2)
        if not self.is_internal_url(self.url) and self.http_proxy:
            kwargs['http_proxy_host'] = urlparse(self.http_proxy).hostname
            kwargs['http_proxy_port'] = urlparse(self.http_proxy).port or 8080
        return kwargs

    @staticmethod
    def _interrupt(ws):
        """
        Make ``ws.run_forever()`` return, from another thread.

        WebSocketApp.close() reads the server's close frame itself, which can leave the
        reader thread blocked in select() until the next ping timeout. Shutting the TCP
        connection down wakes the reader immediately, and a clean teardown follows.
        """
        ws.keep_running = False
        raw_socket = getattr(getattr(ws, 'sock', None), 'sock', None)
        if raw_socket is not None:
            try:
                raw_socket.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass

    def _monitor(self, ws, finished):
        """
        Per-connection watchdog: log how many certificates were received and reset a
        connection that stays connected but stopped delivering (silent upstream).
        """
        interval = 5.0
        if self.idle_timeout > 0:
            interval = min(interval, self.idle_timeout / 4)
        if self.stats_interval > 0:
            interval = min(interval, self.stats_interval)
        window_start, window_count = time.monotonic(), self._messages_received

        while not finished.wait(interval):
            now = time.monotonic()
            if self.stats_interval > 0 and now - window_start >= self.stats_interval:
                received = self._messages_received - window_count
                logger.info(f"CertStream stats: {received} certificates in the last {now - window_start:.0f}s")
                window_start, window_count = now, self._messages_received
            if self.idle_timeout > 0 and now - self._last_message_at > self.idle_timeout:
                logger.warning(f"No CertStream message for {self.idle_timeout:g}s - resetting the connection")
                self._interrupt(ws)
                return

    def _run_once(self):
        """Run one connection: block in run_forever() until it ends."""
        self._last_message_at = time.monotonic()
        ws = self.ws = websocket.WebSocketApp(
            self.url,
            on_message=self._on_message,
            on_error=self._on_error,
            on_close=self._on_close,
            on_open=self._on_open
        )
        if self._stop_event.is_set():
            return
        finished = threading.Event()
        if self.idle_timeout > 0 or self.stats_interval > 0:
            threading.Thread(target=self._monitor, args=(ws, finished), daemon=True).start()
        try:
            ws.run_forever(**self._run_kwargs())
        finally:
            finished.set()

    def _connect(self):
        """
        Connect and keep reconnecting until stop() is called (blocking).

        Reconnection is a loop, not a call from on_close: every drop used to nest one more
        run_forever() on the stack and the listener died silently after ~140 reconnections.
        """
        while self.should_reconnect and not self._stop_event.is_set():
            try:
                self._run_once()
            except Exception as e:
                logger.error(f"Failed to connect to CertStream: {e}")
            if not self.should_reconnect or self._stop_event.is_set():
                break
            logger.info(f"Reconnecting in {self.reconnect_delay} seconds...")
            self._stop_event.wait(self.reconnect_delay)

    def start(self):
        """Start CertStream client in background thread."""
        if self.connection_thread and self.connection_thread.is_alive():
            logger.warning("CertStream client already running")
            return

        self.should_reconnect = True
        self._stop_event.clear()
        self.connection_thread = threading.Thread(target=self._connect, daemon=True)
        self.connection_thread.start()
        logger.info("CertStream client started in background")

    def stop(self):
        """Stop CertStream client."""
        self.should_reconnect = False
        self._stop_event.set()
        if self.ws:
            self._interrupt(self.ws)
        logger.info("CertStream client stopped")


def listen_for_events(callback, url=None):
    """
    Listen for CertStream events (blocking function).

    This is a compatibility function that matches the certstream library API.

    :param callback: Function to call for each certificate event
    :param url: WebSocket URL (default: from the CertStream connector configuration)
    """
    client = CertStreamClient(url=url, callback=callback)

    logger.info(f"Starting CertStream listener on {client.url}")

    # Start client (blocking call)
    client._connect()
