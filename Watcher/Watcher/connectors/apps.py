import logging
from django.apps import AppConfig

logger = logging.getLogger('watcher.connectors')


class ConnectorsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'connectors'

    def ready(self):
        from .core import _get_registry
        try:
            _get_registry()
        except Exception as exc:
            logger.warning("Connectors ready() could not count plugins: %s", exc)
