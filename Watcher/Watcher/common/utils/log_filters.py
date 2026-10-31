"""Filters of the log. Kept free of Django imports: the logging configuration loads them while the settings load."""
import logging

_LOOPBACK = ('127.0.0.1', '::1', '::ffff:127.0.0.1')


class HealthCheckFilter(logging.Filter):
    """
    Drops the line of the web server for `GET /` when it comes from the container itself: that is the health check
    of Docker, every 30 seconds. A request from anywhere else (a browser, the host through the published port) is
    kept, and so is any other request from the container.
    """

    def filter(self, record):
        message = record.getMessage()
        if not message.startswith('"GET / HTTP/'):
            return True
        try:
            return record.request.getpeername()[0] not in _LOOPBACK
        except Exception:
            # The peer cannot be told: keep the line rather than hide a request
            return True
