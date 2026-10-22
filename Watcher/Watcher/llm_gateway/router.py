import logging
import litellm
from django.conf import settings
from .exceptions import LLMConnectionError, LLMAuthenticationError, LLMQuotaExceededError, LLMGatewayError
logger = logging.getLogger(__name__)

class LLMRouter:
    """Central router that dispatches requests via LiteLLM based on active Watcher connectors."""
    
    def _get_llm_config(self, connector_id: str):
        """Fetches the configuration dynamically from Watcher's database or fallbacks to Django settings (.env)."""
        from connectors.models import ConnectorOverride 
        config = {}
        
        try:
            override = ConnectorOverride.objects.get(connector_id=connector_id)
            if override.overrides:
                config = override.overrides
        except ConnectorOverride.DoesNotExist:
            pass

        if not config:
            if connector_id == 'generic_llm_provider':
                config = {
                    'MODEL_NAME': getattr(settings, 'GENERIC_LLM_MODEL', ''),
                    'API_KEY': getattr(settings, 'GENERIC_LLM_KEY', ''),
                    'BASE_URL': getattr(settings, 'GENERIC_LLM_URL', '')
                }
            elif connector_id == 'ollama':
                config = {
                    'MODEL_NAME': getattr(settings, 'OLLAMA_MODEL', ''),
                    'API_KEY': getattr(settings, 'OLLAMA_API_KEY', 'ollama'),
                    'BASE_URL': getattr(settings, 'OLLAMA_BASE_URL', '')
                }
            elif connector_id == 'openai':
                config = {
                    'MODEL_NAME': getattr(settings, 'OPENAI_MODEL', ''),
                    'API_KEY': getattr(settings, 'OPENAI_API_KEY', ''),
                    'BASE_URL': getattr(settings, 'OPENAI_BASE_URL', '')
                }
            elif connector_id == 'anthropic':
                config = {
                    'MODEL_NAME': getattr(settings, 'ANTHROPIC_MODEL', ''),
                    'API_KEY': getattr(settings, 'ANTHROPIC_API_KEY', ''),
                    'BASE_URL': getattr(settings, 'ANTHROPIC_BASE_URL', '')
                }
            elif connector_id == 'gemini':
                config = {
                    'MODEL_NAME': getattr(settings, 'GEMINI_MODEL', ''),
                    'API_KEY': getattr(settings, 'GEMINI_API_KEY', ''),
                    'BASE_URL': getattr(settings, 'GEMINI_BASE_URL', '')
                }
                
        return config

    def _decrypt_api_key(self, api_key: str) -> str:
        """Decrypts the API key if it's encrypted with Fernet (starts with gAAA)."""
        if not api_key or not api_key.startswith('gAAA'):
            return api_key
            
        try:
            from cryptography.fernet import Fernet
            
            fernet_key = settings.CONNECTORS_ENCRYPTION_KEY
            cipher_suite = Fernet(fernet_key)
            
            decrypted_text = cipher_suite.decrypt(api_key.encode('utf-8')).decode('utf-8')
            return decrypted_text
            
        except Exception as e:
            logger.warning(f"Could not decrypt API key: {e}")
            return api_key

    def _call_litellm(self, prompt: str, connector_id: str, **kwargs) -> str:
        """Prepares and executes the request to any LLM via LiteLLM."""
        config = self._get_llm_config(connector_id)
        
        if not config:
            raise LLMGatewayError(f"Connector '{connector_id}' is not configured in Watcher.")

        model = config.get('MODEL_NAME')
        self.model_used = model
        api_key = self._decrypt_api_key(config.get('API_KEY'))
        base_url = config.get('BASE_URL')

        if not model:
            raise LLMGatewayError(f"The MODEL_NAME field is missing for {connector_id}.")

        call_kwargs = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "timeout": kwargs.get("timeout", 120)
        }
        
        if api_key:
            call_kwargs["api_key"] = api_key
        if base_url:
            call_kwargs["api_base"] = base_url

        import os
        import httpx
        from urllib.parse import urlparse
        
        is_local = False
        if base_url:
            hostname = urlparse(base_url).hostname
            if hostname in ['127.0.0.1', 'localhost', '0.0.0.0', '172.17.0.1'] or str(hostname).startswith('10.') or str(hostname).startswith('192.168.'):
                is_local = True
        elif connector_id == 'ollama':
            is_local = True

        cert_path = getattr(settings, 'CA_PATH', os.environ.get('CA_PATH', ''))
        ssl_setting = str(getattr(settings, 'LITELLM_VERIFY_SSL', 'True')).strip().lower()

        if cert_path and os.path.exists(cert_path):
            verify = cert_path
        elif ssl_setting == 'false':
            verify = False
        else:
            verify = True

        if is_local:
            logger.info(f"Local destination detected for '{connector_id}'. Bypassing corporate proxy.")
            litellm.client_session = httpx.Client(verify=verify, trust_env=False)
        elif verify is False:
            litellm.client_session = httpx.Client(verify=False)
        else:
            litellm.client_session = None
        litellm.ssl_verify = verify

        try:
            response = litellm.completion(**call_kwargs)
            return response.choices[0].message.content
            
        except litellm.APIConnectionError as e:
            raise LLMConnectionError(f"Unable to reach API ({connector_id}): {str(e)}")
        except litellm.AuthenticationError as e:
            raise LLMAuthenticationError(f"Authentication error ({connector_id}): {str(e)}")
        except litellm.RateLimitError as e:
            raise LLMQuotaExceededError(f"Quota or rate limit exceeded ({connector_id}): {str(e)}")
        except Exception as e:
            raise LLMGatewayError(f"Unexpected error with {connector_id}: {str(e)}")

    def generate_text(self, prompt: str, provider_name: str = None, **kwargs) -> str:
        """Generates text, delegating local fallback handling to the caller if all APIs fail."""

        if not provider_name:
            try:
                from connectors.models import ConnectorOverride
                default_override = ConnectorOverride.objects.filter(is_default_llm=True).first()
                
                if default_override:
                    connector_id = default_override.connector_id
                else:
                    connector_id = getattr(settings, 'DEFAULT_LLM_PROVIDER', 'None')
            except Exception as e:
                logger.warning(f"Failed to fetch default LLM from DB: {str(e)}")
                connector_id = getattr(settings, 'DEFAULT_LLM_PROVIDER', 'None')
        else:
            connector_id = provider_name
        
        try:
            return self._call_litellm(prompt, connector_id, **kwargs)
            
        except (LLMConnectionError, LLMGatewayError) as e:
            fallback_name = getattr(settings, 'FALLBACK_LLM_PROVIDER', 'huggingface_local')
            
            logger.warning(f"Main connector '{connector_id}' failed. Reason: {str(e)}")
            
            if fallback_name == 'huggingface_local':
                # Routeur is for APIs only. Local fallback is handled by the caller (summary_manager).
                logger.info("Delegating execution to local fallback engine.")
                return None
            else:
                logger.warning(f"Attempting to switch to fallback connector: '{fallback_name}'.")
                try:
                    self.model_used = fallback_name
                    return self._call_litellm(prompt, fallback_name, **kwargs)
                except Exception as fallback_e:
                    logger.error(f"Fallback connector also failed: {str(fallback_e)}")
                    return None

    def summarize(self, text: str, provider_name: str = None, **kwargs) -> str:
        """Summarizes text, automatically switching to fallback if the main provider fails."""
        prompt = f"Please summarize the following text comprehensively:\n\n{text}"
        return self.generate_text(prompt, provider_name, **kwargs)

llm_router = LLMRouter()