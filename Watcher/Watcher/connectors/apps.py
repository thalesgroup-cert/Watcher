import logging
from django.apps import AppConfig

logger = logging.getLogger('watcher.connectors')


class ConnectorsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'connectors'

    def ready(self):
        from .core import _get_registry
        try:
            count = len(_get_registry())
            logger.info("Connectors module loaded — %d plugin(s) available.", count)
        except Exception as exc:
            logger.warning("Connectors ready() could not count plugins: %s", exc)
