from connectors.contrib.common_llm import common_health_check

DEFINITION = {
    'id': 'anthropic',
    'name': 'Anthropic',
    'logo': '🧠',
    'category': 'Artificial Intelligence',
    'description': 'Connection to Anthropic API via LiteLLM.',
    'readonly': False,
    'version': '1.0.0',
    'author': 'Thales CERT',
    'fields': [
        {'name': 'ANTHROPIC_API_KEY', 'label': 'API Key', 'type': 'password', 'settings_key': 'ANTHROPIC_API_KEY', 'required': True, 'placeholder': 'sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxx'},
        {'name': 'ANTHROPIC_MODEL', 'label': 'Model Name', 'type': 'text', 'settings_key': 'ANTHROPIC_MODEL', 'required': True, 'placeholder': 'anthropic/claude-sonnet-4-5'},
        {'name': 'ANTHROPIC_BASE_URL', 'label': 'Base URL (Optional)', 'type': 'text', 'settings_key': 'ANTHROPIC_BASE_URL', 'required': False, 'litellm_provider': 'anthropic', 'placeholder': 'https://your-custom-base_url.com/v1/messages'},
    ],
}

def health_check(plain):
    return common_health_check(plain, DEFINITION)