from connectors.contrib.common_llm import common_health_check
from django.conf import settings
import litellm

DEFINITION = {
    'id': 'generic_llm_provider',
    'name': 'Generic LLM Provider',
    'logo': '🏢',
    'category': 'Artificial Intelligence',
    'description': 'Connection to the enterprise LLM via LiteLLM.',
    'readonly': False,
    'version': '1.0.0',
    'author': 'Thales CERT',
    'fields': [
        {'name': 'GENERIC_LLM_KEY', 'label': 'API Key', 'type': 'password', 'settings_key': 'GENERIC_LLM_KEY', 'required': True, 'placeholder': 'your-api-key'},
        {'name': 'GENERIC_LLM_MODEL', 'label': 'Model Name', 'type': 'text', 'settings_key': 'GENERIC_LLM_MODEL', 'required': True, 'placeholder': 'provider/your-model-name'},
        {'name': 'GENERIC_LLM_URL', 'label': 'Base URL', 'type': 'text', 'settings_key': 'GENERIC_LLM_URL', 'required': True, 'placeholder': 'https://llm.example.com/v1'},
    ],
}

def health_check(plain):
    ssl_setting = str(getattr(settings, 'LITELLM_VERIFY_SSL', 'True')).strip().lower()

    if ssl_setting == 'false':
        litellm.ssl_verify = False
    else:
        litellm.ssl_verify = True

    return common_health_check(plain, DEFINITION)