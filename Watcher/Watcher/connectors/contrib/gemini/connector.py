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
        {'name': 'GEMINI_API_KEY', 'label': 'API Key', 'type': 'password', 'settings_key': 'GEMINI_API_KEY', 'required': True, 'placeholder': 'AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'},
        {'name': 'GEMINI_MODEL', 'label': 'Model Name', 'type': 'text', 'settings_key': 'GEMINI_MODEL', 'required': True, 'placeholder': 'gemini/gemini-2.5-flash'},
        {'name': 'GEMINI_BASE_URL', 'label': 'Base URL (Optional)', 'type': 'text', 'settings_key': 'GEMINI_BASE_URL', 'required': False, 'litellm_provider': 'gemini', 'placeholder': 'https://your-custom-base_url.com/v1beta'},
    ],
}

def health_check(plain):
    return common_health_check(plain, DEFINITION)