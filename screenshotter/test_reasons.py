import unittest

from reasons import failure_reason


class FailureReasonTest(unittest.TestCase):
    def test_a_page_that_does_not_load_in_time_is_a_timeout(self):
        class TimeoutError(Exception):  # the name of the error of the browser library
            pass

        self.assertEqual(failure_reason(TimeoutError('Page.goto: Timeout 30000ms exceeded.')), 'timeout')
        self.assertEqual(failure_reason(Exception('Page.goto: net::ERR_CONNECTION_TIMED_OUT at https://x.example/')), 'timeout')

    def test_each_network_failure_has_its_word(self):
        cases = {
            'net::ERR_NAME_NOT_RESOLVED': 'dns',
            'net::ERR_CONNECTION_REFUSED': 'refused',
            'net::ERR_CONNECTION_RESET': 'reset',
            'net::ERR_EMPTY_RESPONSE': 'reset',
            'net::ERR_CERT_DATE_INVALID': 'tls',
            'net::ERR_SSL_PROTOCOL_ERROR': 'tls',
            'net::ERR_BLOCKED_BY_CLIENT': 'blocked',
            'net::ERR_TOO_MANY_REDIRECTS': 'redirects',
        }
        for code, word in cases.items():
            with self.subTest(code=code):
                self.assertEqual(failure_reason(Exception(f'Page.goto: {code} at https://x.example/')), word)

    def test_through_the_proxy_an_unreachable_address_only_says_the_tunnel_failed(self):
        self.assertEqual(failure_reason(Exception('Page.goto: net::ERR_TUNNEL_CONNECTION_FAILED at https://x.example/')), 'unreachable')

    def test_an_unknown_message_is_other(self):
        self.assertEqual(failure_reason(Exception('something else')), 'other')


if __name__ == '__main__':
    unittest.main()
