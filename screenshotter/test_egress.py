"""`python -m unittest test_egress` from this folder: the proxy only connects to public addresses, checked when it connects."""
import socket
import threading
import unittest
from unittest.mock import patch

import egress


def _ask(proxy, payload):
    host, port = proxy.replace('http://', '').split(':')
    # Connects without resolving anything: the tests replace getaddrinfo, which is the one of the whole process
    with socket.socket() as client:
        client.settimeout(5)
        client.connect((host, int(port)))
        client.sendall(payload)
        client.settimeout(5)
        data = b''
        try:
            while chunk := client.recv(4096):
                data += chunk
        except socket.timeout:
            pass
        return data


def _echo_server():
    """A local server that answers every request with 'pong' (stands for a site that is reached)."""
    server = socket.socket()
    server.bind(('127.0.0.1', 0))
    server.listen(5)

    def run():
        while True:
            try:
                connection, _ = server.accept()
            except OSError:
                return
            with connection:
                connection.recv(4096)
                connection.sendall(b'HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\npong')

    threading.Thread(target=run, daemon=True).start()
    return server


class EgressTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.proxy = egress.start()

    def test_a_private_address_is_refused_for_https(self):
        with patch('guard.socket.getaddrinfo', return_value=[(2, 1, 6, '', ('10.0.0.5', 0))]):
            answer = _ask(self.proxy, b'CONNECT internal.example:443 HTTP/1.1\r\nHost: internal.example:443\r\n\r\n')
        self.assertTrue(answer.startswith(b'HTTP/1.1 403'), answer)

    def test_a_private_address_is_refused_for_http(self):
        with patch('guard.socket.getaddrinfo', return_value=[(2, 1, 6, '', ('127.0.0.1', 0))]):
            answer = _ask(self.proxy, b'GET http://internal.example/ HTTP/1.1\r\nHost: internal.example\r\n\r\n')
        self.assertTrue(answer.startswith(b'HTTP/1.1 403'), answer)

    def test_the_address_is_checked_at_each_connection(self):
        """A name that is public the first time and private the second one is refused the second time."""
        answers = iter([[(2, 1, 6, '', ('93.184.216.34', 0))], [(2, 1, 6, '', ('127.0.0.1', 0))]])
        with patch('guard.socket.getaddrinfo', side_effect=lambda *a, **k: next(answers)):
            self.assertEqual(egress.guard.public_addresses('rebind.example'), ['93.184.216.34'])
            self.assertIsNone(egress.open_connection('rebind.example', 80))

    def test_only_http_targets_are_forwarded(self):
        answer = _ask(self.proxy, b'GET ftp://example.org/ HTTP/1.1\r\nHost: example.org\r\n\r\n')
        self.assertTrue(answer.startswith(b'HTTP/1.1 400'), answer)

    def test_a_public_address_is_reached_with_http_and_https_tunnels(self):
        site = _echo_server()
        port = site.getsockname()[1]
        try:
            with patch('egress.guard.public_addresses', return_value=['127.0.0.1']):
                answer = _ask(self.proxy, f'GET http://site.example:{port}/x?y=1 HTTP/1.1\r\nHost: site.example\r\n\r\n'.encode())
                self.assertTrue(answer.endswith(b'pong'), answer)
                tunnel = _ask(self.proxy, f'CONNECT site.example:{port} HTTP/1.1\r\n\r\nPING'.encode())
                self.assertTrue(tunnel.startswith(b'HTTP/1.1 200 Connection established'), tunnel)
        finally:
            site.close()


if __name__ == '__main__':
    unittest.main()
