from connectors.contrib.common_llm import common_health_check

DEFINITION = {
    'id': 'ollama',
    'name': 'Ollama Local',
    'logo': '🦙',
    'category': 'Artificial Intelligence',
    'description': 'Connection to the local Ollama instance via LiteLLM.',
    'readonly': False,
    'version': '1.0.0',
    'author': 'Thales CERT',
    'fields': [
        {'name': 'API_KEY', 'label': 'API Key (Optional)', 'type': 'password', 'settings_key': 'OLLAMA_API_KEY', 'required': False},
        {'name': 'BASE_URL', 'label': 'Base URL', 'type': 'text', 'settings_key': 'OLLAMA_API_URL', 'required': True},
        {'name': 'MODEL_NAME', 'label': 'Model Name', 'type': 'text', 'settings_key': 'OLLAMA_MODEL', 'required': True},
    ],
}

def health_check(plain):
    return common_health_check(plain, DEFINITION)