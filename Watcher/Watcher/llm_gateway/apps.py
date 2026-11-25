from django.apps import AppConfig

class LlmGatewayConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'llm_gateway'

    def ready(self):
        pass