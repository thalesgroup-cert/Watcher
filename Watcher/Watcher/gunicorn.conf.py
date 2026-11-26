"""
Gunicorn settings for Watcher. Gunicorn reads this file from its working directory (/app/Watcher), so the image starts
with a plain `gunicorn watcher.wsgi:application`.
"""
import importlib
import os

bind = '0.0.0.0:9002'

# ONE worker, on purpose. The scheduled jobs (APScheduler: detections, RDAP/WHOIS, notifications…) start inside the web
# process, so every extra worker would run every job again and send every notification twice. The concurrency of the
# web interface comes from the threads. Do not use --preload either: the schedulers are threads, and a fork drops them.
workers = 1
worker_class = 'gthread'
threads = int(os.environ.get('GUNICORN_THREADS', '16'))

# Bulk actions and exports can take a while
timeout = int(os.environ.get('GUNICORN_TIMEOUT', '120'))
graceful_timeout = 30
keepalive = 5

# Two logs, kept apart:
#  - the application log (what Watcher detects, sends, schedules) is the `watcher.*` loggers of Django's LOGGING;
#  - the access log is written by Watcher itself (common/access_log.py) in logs/access.log, because only Django knows
#    the user. Gunicorn's own access log is therefore off.
# What is left for Gunicorn is the life of the server itself (start, stop, a worker that dies), on the console.
accesslog = None
errorlog = '-'
loglevel = os.environ.get('GUNICORN_LOG_LEVEL', 'info')
_DATE_FORMAT = '%d/%b/%Y %H:%M:%S'
logconfig_dict = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'server': {'format': '[%(asctime)s] %(levelname)s | gunicorn: %(message)s', 'datefmt': _DATE_FORMAT},
        'app': {'format': '[%(asctime)s] %(levelname)s | %(message)s', 'datefmt': _DATE_FORMAT},
    },
    'handlers': {
        'server_console': {'class': 'logging.StreamHandler', 'formatter': 'server', 'stream': 'ext://sys.stderr'},
        # Gunicorn sends the root logger to a handler named `console`: the libraries that log without a logger of
        # Watcher (APScheduler, requests…) go there. Same format as the application log, not marked as the server.
        'console': {'class': 'logging.StreamHandler', 'formatter': 'app', 'stream': 'ext://sys.stderr'},
    },
    'loggers': {
        'gunicorn.error': {'level': loglevel.upper(), 'handlers': ['server_console'], 'propagate': False},
        # Gunicorn writes its access lines whenever a log configuration is given, `accesslog = None` or not: silence them
        'gunicorn.access': {'level': 'CRITICAL', 'handlers': [], 'propagate': False},
    },
    # Warnings and errors of the libraries only: APScheduler tells when a job was missed, not each job it adds
    'root': {'level': 'WARNING', 'handlers': ['console']},
}

# Development only (docker-compose.override.yml): restart the worker when a file changes
reload = os.environ.get('GUNICORN_RELOAD', '') == '1'


def post_worker_init(worker):
    """
    `runserver` loads the URL configuration when it starts; Gunicorn waits for the first request. The schedulers start
    when the URL configuration is imported, so import it now rather than at the first visit.
    """
    from django.conf import settings
    importlib.import_module(settings.ROOT_URLCONF)
