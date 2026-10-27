from connectors.contrib.common_llm import common_health_check

DEFINITION = {
    'id': 'gemini',
    'name': 'Google Gemini',
    'logo': '✨',
    'category': 'Artificial Intelligence',
    'description': 'Connection to Google Gemini API via LiteLLM.',
    'readonly': False,
    'version': '1.0.0',
    'author': 'Thales CERT',
    'fields': [
        {'name': 'API_KEY', 'label': 'API Key', 'type': 'password', 'settings_key': 'GEMINI_API_KEY', 'required': True},
        {'name': 'MODEL_NAME', 'label': 'Model Name (e.g. gemini/gemini-1.5-pro)', 'type': 'text', 'settings_key': 'GEMINI_MODEL', 'required': True},
        {'name': 'BASE_URL', 'label': 'Custom Base URL (Optional)', 'type': 'text', 'settings_key': 'GEMINI_BASE_URL', 'required': False},
    ],
}

def health_check(plain):
    return common_health_check(plain, DEFINITION)