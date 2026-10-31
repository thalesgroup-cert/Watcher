"""`python -m unittest test_guard` from this folder: what the screenshot service may load."""
import unittest
from unittest.mock import patch

import guard


def _resolves_to(*addresses):
    return patch('guard.socket.getaddrinfo', return_value=[(2, 1, 6, '', (a, 0)) for a in addresses])


class GuardTest(unittest.TestCase):
    def test_a_public_address_is_allowed(self):
        with _resolves_to('93.184.216.34'):
            self.assertTrue(guard.allowed('https://blog.example.org/post'))

    def test_private_loopback_and_link_local_addresses_are_refused(self):
        for address in ('10.0.0.5', '172.16.3.4', '192.168.1.1', '127.0.0.1', '169.254.169.254', '::1', 'fe80::1', 'fd00::1'):
            with self.subTest(address=address), _resolves_to(address):
                self.assertFalse(guard.allowed('http://internal.example/'))

    def test_one_private_address_among_public_ones_is_enough_to_refuse(self):
        with _resolves_to('93.184.216.34', '10.0.0.5'):
            self.assertFalse(guard.allowed('https://rebinding.example/'))

    def test_only_http_and_https_are_loaded(self):
        for url in ('file:///etc/passwd', 'ftp://example.org/', 'javascript:alert(1)', 'data:text/html,hi', 'chrome://version'):
            with self.subTest(url=url), _resolves_to('93.184.216.34'):
                self.assertFalse(guard.allowed(url))

    def test_an_address_that_does_not_resolve_is_refused(self):
        with patch('guard.socket.getaddrinfo', side_effect=guard.socket.gaierror):
            self.assertFalse(guard.allowed('https://nowhere.invalid/'))

    def test_junk_is_refused(self):
        for url in (None, 42, '', 'not a url', 'https://', 'http://' + 'a' * 3000):
            with self.subTest(url=url), _resolves_to('93.184.216.34'):
                self.assertFalse(guard.allowed(url))


if __name__ == '__main__':
    unittest.main()
