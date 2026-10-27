import logging
import litellm

from llm_gateway.exceptions import (
    LLMAuthenticationError, 
    LLMConnectionError, 
    LLMQuotaExceededError, 
    LLMGatewayError
)

from connectors.models import ConnectorOverride

from llm_gateway.utils.prompt_builder import PromptBuilder
from llm_gateway.utils.log_pruner import LogPruner
from llm_gateway.utils.token_manager import TokenManager
from django.conf import settings


logger = logging.getLogger(__name__)

class SecurityAnalyzerService:

    def _get_llm_config(self, connector_id: str):
        """Fetches the connector configuration from the database."""
        try:
            override = ConnectorOverride.objects.get(connector_id=connector_id)
            return override.overrides or {}
        except ConnectorOverride.DoesNotExist:
            return None

    def _call_local_fallback(self, prompt: str) -> str:
        """Fallback mechanism using a local FLAN-T5 model."""
        logger.warning("Falling back to the local FLAN-T5 model...")
        from transformers import pipeline
        summarizer = pipeline("text-generation", model="google/flan-t5-base")
        response = summarizer(prompt, max_new_tokens=250, do_sample=False)
        return response[0]['generated_text']

    def analyze(self, raw_logs: list, active_connector_id: str) -> dict:
        """Main method called by the views or the router."""
        
        safe_logs_string = LogPruner.compress_logs(raw_logs)

        safe_logs_string = TokenManager.truncate_logs(safe_logs_string, max_tokens=4000)
        
        prompt = PromptBuilder.build_security_analysis_prompt(safe_logs_string)

        try:
            response_text = self._call_remote_llm(prompt, connector_id=active_connector_id)
            return {"status": "success", "analysis": response_text, "source": active_connector_id}
            
        except Exception as e:
            logger.error(f"Connector {active_connector_id} failed: {e}. Triggering fallback.")
            try:
                fallback_text = self._call_local_fallback(prompt)
                return {"status": "degraded", "analysis": fallback_text, "source": "local_fallback"}
            except Exception as fallback_error:
                return {"status": "error", "message": "All analysis models are currently unavailable."}

    def _decrypt_api_key(self, api_key: str) -> str:
        """Decrypts the API key if it's encrypted with Fernet (starts with gAAA)."""
        if not api_key or not api_key.startswith('gAAA'):
            return api_key
            
        try:
            from cryptography.fernet import Fernet
            
            fernet_key = settings.CONNECTORS_ENCRYPTION_KEY
            cipher_suite = Fernet(fernet_key)
            
            return cipher_suite.decrypt(api_key.encode('utf-8')).decode('utf-8')
            
        except Exception as e:
            logger.warning(f"Could not decrypt API key ({type(e).__name__})")
            return api_key

    def _call_remote_llm(self, prompt: str, connector_id: str) -> str:
        """Universal call via LiteLLM with custom exception handling."""
        config = self._get_llm_config(connector_id)
        
        if not config:
            raise LLMGatewayError(f"Connector '{connector_id}' is not configured.")

        model = config.get('MODEL_NAME')
        api_key = self._decrypt_api_key(config.get('API_KEY'))
        base_url = config.get('BASE_URL')

        if not model:
            raise LLMGatewayError(f"MODEL_NAME is missing for {connector_id}.")

        kwargs = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "timeout": 15
        }
        
        if api_key:
            kwargs["api_key"] = api_key
        if base_url:
            kwargs["api_base"] = base_url

        try:
            response = litellm.completion(**kwargs)
            return response.choices[0].message.content
            
        except litellm.AuthenticationError as e:
            raise LLMAuthenticationError(f"Authentication error ({connector_id}): {str(e)}")
            
        except litellm.APIConnectionError as e:
            raise LLMConnectionError(f"Failed to reach API ({connector_id}): {str(e)}")
            
        except litellm.RateLimitError as e:
            raise LLMQuotaExceededError(f"Quota or rate limit exceeded ({connector_id}): {str(e)}")
            
        except Exception as e:
            raise LLMGatewayError(f"Unexpected error with {connector_id}: {str(e)}")