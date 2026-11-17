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
        {'name': 'OPENAI_API_KEY', 'label': 'API Key', 'type': 'password', 'settings_key': 'OPENAI_API_KEY', 'required': True, 'placeholder': 'sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx'},
        {'name': 'OPENAI_MODEL', 'label': 'Model Name', 'type': 'text', 'settings_key': 'OPENAI_MODEL', 'required': True, 'placeholder': 'openai/gpt-4o-mini'},
        {'name': 'OPENAI_BASE_URL', 'label': 'Base URL (Optional)', 'type': 'text', 'settings_key': 'OPENAI_BASE_URL', 'required': False, 'litellm_provider': 'openai', 'placeholder': 'Enter the custom base URL with this mention: https://your-custom-base_url.com/v1'},
    ],
}

def health_check(plain):
    return common_health_check(plain, DEFINITION)