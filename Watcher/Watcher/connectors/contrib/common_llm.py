import os
import litellm

from connectors.core import litellm_default_api_base

ssl_env = os.environ.get('LITELLM_VERIFY_SSL', 'True').lower()
litellm.ssl_verify = ssl_env in ('true', '1', 't', 'yes')

LLM_FIELDS = {
    'openai': {'api_key': 'OPENAI_API_KEY', 'model': 'OPENAI_MODEL', 'base_url': 'OPENAI_BASE_URL'},
    'anthropic': {'api_key': 'ANTHROPIC_API_KEY', 'model': 'ANTHROPIC_MODEL', 'base_url': 'ANTHROPIC_BASE_URL'},
    'gemini': {'api_key': 'GEMINI_API_KEY', 'model': 'GEMINI_MODEL', 'base_url': 'GEMINI_BASE_URL'},
    'ollama': {'api_key': 'OLLAMA_API_KEY', 'model': 'OLLAMA_MODEL', 'base_url': 'OLLAMA_API_URL'},
    'generic_llm_provider': {'api_key': 'GENERIC_LLM_KEY', 'model': 'GENERIC_LLM_MODEL', 'base_url': 'GENERIC_LLM_URL'},
}


def common_health_check(plain, definition):
    """
    Universal health_check function for LiteLLM connectors.
    """
    fields = LLM_FIELDS[definition['id']]
    api_key = plain(fields['api_key']) or "dummy-key-for-local"
    model = plain(fields['model'])
    base_url = plain(fields['base_url'])

    for field in definition.get('fields', []):
        if field.get('required'):
            if not plain(field['name']):
                return {'success': False, 'message': f"The field {field['label']} is required."}

    try:
        kwargs = {
            "model": model,
            "messages": [{"role": "user", "content": "ping"}],
            "timeout": 10,
            "max_tokens": 1,
            "api_key": api_key,
        }

        if base_url and base_url != litellm_default_api_base(definition['id']):
            kwargs["api_base"] = base_url

        response = litellm.completion(**kwargs)

        if response:
            provider_name = definition.get('name', 'this provider')
            return {'success': True, 'message': f"Successfully connected to {provider_name} model '{model}'!"}

        return {'success': False, 'message': 'Empty response received.'}

    except litellm.AuthenticationError:
        return {'success': False, 'message': 'Authentication failed: Invalid API Key.'}
    except litellm.APIConnectionError:
        return {'success': False, 'message': 'Connection error: Check the network or Base URL.'}
    except Exception as exc:
        return {'success': False, 'message': f"Connection Error: {str(exc)}"}