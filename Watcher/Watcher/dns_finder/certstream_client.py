# coding=utf-8
"""
CertStream WebSocket Client with Enterprise Proxy Support

This module provides a WebSocket client for connecting to certstream-server-go
with automatic proxy detection and internal network bypass.

Compatible with Docker networking and enterprise proxy configurations.
"""

import os
import json
import time
import logging
import threading
from urllib.parse import urlparse
import websocket
from django.conf import settings

logger = logging.getLogger('watcher.dns_finder')


class CertStreamClient:
    """
    WebSocket client for CertStream with proxy support and automatic reconnection.
    
    Features:
    - Automatic proxy detection and bypass for internal URLs
    - Periodic ping to keep connection alive
    - Automatic reconnection on failures
    - Thread-safe operation
    """
    
    def __init__(self, url=None, callback=None, ping_interval=30, reconnect_delay=5):
        """
        Initialize CertStream client.
        
        :param url: WebSocket URL (default: from settings.CERT_STREAM_URL)
        :param callback: Callback function to handle messages
        :param ping_interval: Seconds between ping messages (0 to disable)
        :param reconnect_delay: Seconds to wait before reconnection attempt
        """
        self.url = url or getattr(settings, 'CERT_STREAM_URL', 'ws://certstream:8080')
        self.callback = callback
        self.ping_interval = ping_interval
        self.reconnect_delay = reconnect_delay
        self.ws = None
        self.should_reconnect = True
        self.connection_thread = None
        
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
        else:
            # Use environment proxy settings for external URLs
            self.http_proxy = os.environ.get('HTTP_PROXY') or os.environ.get('http_proxy')
            self.https_proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
            if self.http_proxy or self.https_proxy:
                logger.info(f"Using proxy for external CertStream connection")
    
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
        
        # Check for common internal patterns
        internal_patterns = [
            'localhost',
            '127.',
            '10.',
            '172.16.',
            '172.17.',
            '172.18.',
            '172.19.',
            '172.20.',
            '172.21.',
            '172.22.',
            '172.23.',
            '172.24.',
            '172.25.',
            '172.26.',
            '172.27.',
            '172.28.',
            '172.29.',
            '172.30.',
            '172.31.',
            '192.168.',
            'certstream',  # Docker service name
        ]
        
        for pattern in internal_patterns:
            if hostname.startswith(pattern):
                return True
        
        return False
    
    def _on_message(self, ws, message):
        """Handle incoming WebSocket messages."""
        try:
            data = json.loads(message)
            if self.callback and data.get('message_type') == 'certificate_update':
                self.callback(data, None)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode CertStream message: {e}")
        except Exception as e:
            logger.error(f"Error in CertStream callback: {e}")
    
    def _on_error(self, ws, error):
        """Handle WebSocket errors."""
        logger.error(f"CertStream WebSocket error: {error}")
    
    def _on_close(self, ws, close_status_code, close_msg):
        """Handle WebSocket connection close."""
        logger.warning(f"CertStream connection closed: {close_status_code} - {close_msg}")
        if self.should_reconnect:
            logger.info(f"Reconnecting in {self.reconnect_delay} seconds...")
            time.sleep(self.reconnect_delay)
            self._connect()
    
    def _on_open(self, ws):
        """Handle WebSocket connection open."""
        logger.info(f"CertStream connection established to {self.url}")
        
        # Start ping thread if enabled
        if self.ping_interval > 0:
            def ping_loop():
                while self.ws and self.ws.sock and self.ws.sock.connected:
                    try:
                        self.ws.ping()
                        time.sleep(self.ping_interval)
                    except Exception as e:
                        logger.debug(f"Ping failed: {e}")
                        break
            
            ping_thread = threading.Thread(target=ping_loop, daemon=True)
            ping_thread.start()
    
    def _connect(self):
        """Establish WebSocket connection with proxy support."""
        try:
            # Prepare proxy configuration
            proxy_kwargs = {}
            if not self.is_internal_url(self.url):
                if self.http_proxy:
                    proxy_kwargs['http_proxy_host'] = urlparse(self.http_proxy).hostname
                    proxy_kwargs['http_proxy_port'] = urlparse(self.http_proxy).port or 8080
            
            # Create WebSocket connection
            self.ws = websocket.WebSocketApp(
                self.url,
                on_message=self._on_message,
                on_error=self._on_error,
                on_close=self._on_close,
                on_open=self._on_open
            )
            
            # Run WebSocket connection (blocking)
            self.ws.run_forever(**proxy_kwargs)
            
        except Exception as e:
            logger.error(f"Failed to connect to CertStream: {e}")
            if self.should_reconnect:
                time.sleep(self.reconnect_delay)
                self._connect()
    
    def start(self):
        """Start CertStream client in background thread."""
        if self.connection_thread and self.connection_thread.is_alive():
            logger.warning("CertStream client already running")
            return
        
        self.should_reconnect = True
        self.connection_thread = threading.Thread(target=self._connect, daemon=True)
        self.connection_thread.start()
        logger.info("CertStream client started in background")
    
    def stop(self):
        """Stop CertStream client."""
        self.should_reconnect = False
        if self.ws:
            self.ws.close()
        logger.info("CertStream client stopped")


def listen_for_events(callback, url=None):
    """
    Listen for CertStream events (blocking function).
    
    This is a compatibility function that matches the certstream library API.
    
    :param callback: Function to call for each certificate event
    :param url: WebSocket URL (default: from settings.CERT_STREAM_URL)
    """
    client = CertStreamClient(url=url, callback=callback)
    
    # Configure NO_PROXY environment to ensure internal connections work
    no_proxy = os.environ.get('NO_PROXY', '')
    if 'certstream' not in no_proxy:
        os.environ['NO_PROXY'] = f"{no_proxy},certstream,10.10.10.7" if no_proxy else "certstream,10.10.10.7"
        logger.info(f"Updated NO_PROXY: {os.environ['NO_PROXY']}")
    
    logger.info(f"Starting CertStream listener on {client.url}")
    
    # Start client (blocking call)
    client._connect()
