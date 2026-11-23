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
        {'name': 'OLLAMA_API_KEY', 'label': 'API Key (Optional)', 'type': 'password', 'settings_key': 'OLLAMA_API_KEY', 'required': False, 'placeholder': 'your-api-key'},
        {'name': 'OLLAMA_MODEL', 'label': 'Model Name', 'type': 'text', 'settings_key': 'OLLAMA_MODEL', 'required': True, 'placeholder': 'ollama/llama3.1'},
        {'name': 'OLLAMA_API_URL', 'label': 'Base URL', 'type': 'text', 'settings_key': 'OLLAMA_API_URL', 'required': True, 'placeholder': 'http://host.docker.internal:11434'},
    ],
}

def health_check(plain):
    return common_health_check(plain, DEFINITION)