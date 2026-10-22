import logging
import os
from django.apps import AppConfig

logger = logging.getLogger('watcher.connectors')


class ConnectorsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'connectors'

    def ready(self):
        from .core import _get_registry
        import litellm

        ssl_env = os.environ.get('LITELLM_VERIFY_SSL', 'True').lower()
        litellm.ssl_verify = ssl_env in ('true', '1', 't', 'yes')

        try:
            _get_registry()
        except Exception as exc:
            logger.warning("Connectors ready() could not count plugins: %s", exc)