"""
Why a capture failed, as one word Watcher can turn into a sentence. The browser reports its failures as English messages with
a code (`net::ERR_NAME_NOT_RESOLVED`) or as a timeout; this maps them to a short set of words.

The browser leaves through the `egress` proxy: for an address it cannot reach (name not found, connection refused, an
address that is not public) it only says that the tunnel failed, so those cases share the word `unreachable`.
"""

# (word, fragments of the message of the browser), the first match wins
_REASONS = (
    ('timeout', ('TimeoutError', 'Timeout ', 'ERR_TIMED_OUT', 'ERR_CONNECTION_TIMED_OUT')),
    ('dns', ('ERR_NAME_NOT_RESOLVED', 'ERR_NAME_RESOLUTION_FAILED')),
    ('refused', ('ERR_CONNECTION_REFUSED',)),
    ('reset', ('ERR_CONNECTION_RESET', 'ERR_CONNECTION_CLOSED', 'ERR_CONNECTION_ABORTED', 'ERR_EMPTY_RESPONSE')),
    ('tls', ('ERR_CERT', 'ERR_SSL', 'ERR_BAD_SSL')),
    ('blocked', ('ERR_BLOCKED_BY_CLIENT',)),
    ('redirects', ('ERR_TOO_MANY_REDIRECTS',)),
    ('unreachable', ('ERR_TUNNEL_CONNECTION_FAILED', 'ERR_PROXY_CONNECTION_FAILED', 'ERR_ADDRESS_UNREACHABLE',
                     'ERR_INTERNET_DISCONNECTED', 'ERR_NETWORK_CHANGED')),
)


def failure_reason(exc):
    """The word for the failure of a capture; `other` when the message is not one we know."""
    text = f'{type(exc).__name__} {exc}'
    for word, fragments in _REASONS:
        if any(fragment in text for fragment in fragments):
            return word
    return 'other'
