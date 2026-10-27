import os
import litellm

ssl_env = os.environ.get('LITELLM_VERIFY_SSL', 'True').lower()
litellm.ssl_verify = ssl_env in ('true', '1', 't', 'yes')

def common_health_check(plain, definition):
    """
    Universal health_check function for LiteLLM connectors.
    """
    api_key = plain('API_KEY') or "dummy-key-for-local"
    model = plain('MODEL_NAME')
    base_url = plain('BASE_URL')

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
        
        if base_url:
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