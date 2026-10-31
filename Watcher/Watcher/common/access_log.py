"""
The access log of Watcher: who did what, in its own file (logs/access.log), apart from the application log.

One line per request that says something:
- INFO  an action that changes something (POST, PUT, PATCH, DELETE) or a successful login;
- WARNING a refused action, a failed login, an access denied (401, 403);
- ERROR a request that ended in a server error;
- DEBUG every other read of the API (a dashboard makes more than twenty at each refresh).
The files of the interface (/static/) and the health check of Docker are not logged.

`user ip METHOD /path status duration`, for example: `alice 172.21.0.1 PATCH /api/connectors/thehive/ 200 84ms`.
The query string is left out: it can carry what a person searched for.
"""
import logging
import time

logger = logging.getLogger('watcher.access')

_READS = ('GET', 'HEAD', 'OPTIONS')
_LOOPBACK = ('127.0.0.1', '::1', '::ffff:127.0.0.1')
_LOGIN_PATHS = ('/api/auth/login', '/api/auth/oidc/callback/')


class AccessLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        started = time.monotonic()
        response = self.get_response(request)
        try:
            self._log(request, response, time.monotonic() - started)
        except Exception:  # a line of log must never break a request
            pass
        return response

    @staticmethod
    def _level(request, status):
        if status >= 500:
            return logging.ERROR
        if status in (401, 403):
            return logging.WARNING
        if request.path in _LOGIN_PATHS and request.method == 'POST':
            return logging.INFO if status < 400 else logging.WARNING
        if request.method not in _READS:
            return logging.INFO if status < 400 else logging.WARNING
        return logging.DEBUG

    def _log(self, request, response, duration):
        path = request.path
        address = request.META.get('REMOTE_ADDR', '-')
        if path.startswith('/static/') or (path == '/' and address in _LOOPBACK):
            return
        status = response.status_code
        level = self._level(request, status)
        if not logger.isEnabledFor(level):
            return

        user = getattr(request, 'user', None)
        name = user.get_username() if user is not None and user.is_authenticated else '-'
        forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
        # The address of the proxy is what the server sees; the one it forwards is only what the client claims
        origin = f"{address} (forwarded for {forwarded})" if forwarded else address
        logger.log(level, f"{name} {origin} {request.method} {path} {status} {duration * 1000:.0f}ms")
