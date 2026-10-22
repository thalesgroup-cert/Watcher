from connectors.contrib.common_llm import common_health_check

DEFINITION = {
    'id': 'openai',
    'name': 'OpenAI',
    'logo': '🪄',
    'category': 'Artificial Intelligence',
    'description': 'Connection to OpenAI API via LiteLLM.',
    'readonly': False,
    'version': '1.0.0',
    'author': 'Thales CERT',
    'fields': [
        {'name': 'API_KEY', 'label': 'API Key', 'type': 'password', 'settings_key': 'OPENAI_API_KEY', 'required': True},
        {'name': 'MODEL_NAME', 'label': 'Model Name', 'type': 'text', 'settings_key': 'OPENAI_MODEL', 'required': True},
        {'name': 'BASE_URL', 'label': 'Custom Base URL (Optional)', 'type': 'text', 'settings_key': 'OPENAI_BASE_URL', 'required': False},
    ],
}

def health_check(plain):
    return common_health_check(plain, DEFINITION)