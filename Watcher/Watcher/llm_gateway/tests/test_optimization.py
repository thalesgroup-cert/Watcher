import json
from django.test import TestCase
from unittest.mock import patch

from llm_gateway.utils.log_pruner import LogPruner
from llm_gateway.utils.token_manager import TokenManager
from llm_gateway.utils.prompt_builder import PromptBuilder
from llm_gateway.services.analyzer import SecurityAnalyzerService
from llm_gateway.router import LLMRouter
from llm_gateway.exceptions import LLMConnectionError
from connectors.core import connector_encrypt

class OptimizationTests(TestCase):
    
    def test_log_pruner_cleans_noisy_fields(self):
        """Test that noisy/useless fields are properly removed."""
        raw_log = {
            "ip": "192.168.1.10",
            "event": "login_failed",
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
            "session_id": "ABC123XYZ",
            "nested_data": {
                "cookie": "secret_value",
                "valid_field": "keep_this"
            }
        }
        
        cleaned_log = LogPruner.clean_log_entry(raw_log)
        
        self.assertIn("ip", cleaned_log)
        self.assertIn("event", cleaned_log)
        self.assertNotIn("user_agent", cleaned_log)
        self.assertNotIn("session_id", cleaned_log)
        self.assertNotIn("cookie", cleaned_log["nested_data"])
        self.assertIn("valid_field", cleaned_log["nested_data"])

    def test_log_pruner_compresses_duplicates(self):
        """Test that identical logs are properly grouped and compressed."""
        logs = [
            {"ip": "1.1.1.1", "status": 404},
            {"ip": "1.1.1.1", "status": 404},
            {"ip": "2.2.2.2", "status": 200}
        ]
        
        compressed = LogPruner.compress_logs(logs)
        
        self.assertIn("[x2 occurrences]", compressed)
        self.assertIn("1.1.1.1", compressed)
        self.assertIn("2.2.2.2", compressed)

    def test_token_manager_truncation(self):
        """Test that truncation properly cuts logs that exceed the limit."""
        long_text = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5"
        
        truncated = TokenManager.truncate_logs(long_text, max_tokens=10)
        
        self.assertIn("WARNING: Remaining logs truncated", truncated)
        self.assertNotIn("Line 5", truncated)

    def test_prompt_builder_format(self):
        """Test that the prompt builder correctly formats logs with strict system instructions."""
        safe_logs_string = '{"ip": "192.168.1.100", "event": "brute_force_attempt"}'
        
        prompt = PromptBuilder.build_security_analysis_prompt(safe_logs_string)
        
        self.assertIsInstance(prompt, str)
        
        self.assertIn("You are a strict cybersecurity AI", prompt)
        self.assertIn("EXPECTED OUTPUT FORMAT", prompt)
        self.assertIn('"threat_detected": boolean', prompt)
        
        self.assertIn("192.168.1.100", prompt)
        self.assertIn("brute_force_attempt", prompt)


    @patch('llm_gateway.services.analyzer.SecurityAnalyzerService._call_remote_llm')
    def test_analyzer_successful_remote_analysis(self, mock_call_remote):
        """Test that the analysis via the remote connector succeeds."""
        mock_call_remote.return_value = "Analysis complete: No threat detected."
        
        service = SecurityAnalyzerService()
        result = service.analyze([{"event": "normal_login"}], active_connector_id="openai_llm")
        
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["source"], "openai_llm")
        self.assertEqual(result["analysis"], "Analysis complete: No threat detected.")
        mock_call_remote.assert_called_once()

    @patch('llm_gateway.services.analyzer.SecurityAnalyzerService._call_local_fallback')
    @patch('llm_gateway.services.analyzer.SecurityAnalyzerService._call_remote_llm')
    def test_analyzer_triggers_fallback_on_failure(self, mock_call_remote, mock_call_fallback):
        """Test that the system falls back to the local model if the remote API fails."""
        mock_call_remote.side_effect = Exception("API Down or Invalid Key")
        mock_call_fallback.return_value = "Local fallback analysis."
        
        service = SecurityAnalyzerService()
        result = service.analyze([{"event": "login_failed"}], active_connector_id="broken_llm")
        
        self.assertEqual(result["status"], "degraded")
        self.assertEqual(result["source"], "local_fallback")
        self.assertEqual(result["analysis"], "Local fallback analysis.")
        mock_call_remote.assert_called_once()
        mock_call_fallback.assert_called_once()


class RouterApiKeyDecryptionTests(TestCase):
    """Test the Fernet decryption of API keys in the router and the analyzer."""

    def test_router_decrypts_fernet_key(self):
        encrypted = connector_encrypt("sk-secret")
        self.assertTrue(encrypted.startswith("gAAA"))
        self.assertEqual(LLMRouter()._decrypt_api_key(encrypted), "sk-secret")

    def test_router_keeps_plain_key(self):
        self.assertEqual(LLMRouter()._decrypt_api_key("sk-plain"), "sk-plain")

    def test_router_handles_empty_key(self):
        self.assertEqual(LLMRouter()._decrypt_api_key(""), "")
        self.assertIsNone(LLMRouter()._decrypt_api_key(None))

    def test_router_returns_raw_value_when_decryption_fails(self):
        self.assertEqual(LLMRouter()._decrypt_api_key("gAAA-not-a-valid-token"), "gAAA-not-a-valid-token")

    def test_analyzer_decrypts_fernet_key(self):
        encrypted = connector_encrypt("sk-secret")
        self.assertEqual(SecurityAnalyzerService()._decrypt_api_key(encrypted), "sk-secret")

    def test_analyzer_keeps_plain_key_and_handles_invalid_token(self):
        service = SecurityAnalyzerService()
        self.assertEqual(service._decrypt_api_key("sk-plain"), "sk-plain")
        self.assertEqual(service._decrypt_api_key("gAAA-invalid"), "gAAA-invalid")


class RouterGenerateTextTests(TestCase):
    """Test generate_text: the router is APIs-only and returns None instead of raising."""

    @patch('llm_gateway.router.LLMRouter._call_litellm')
    def test_success_returns_the_text(self, mock_call):
        mock_call.return_value = "generated"
        self.assertEqual(LLMRouter().generate_text("prompt", provider_name="openai"), "generated")
        mock_call.assert_called_once()

    @patch('llm_gateway.router.LLMRouter._call_litellm')
    def test_failure_with_local_fallback_returns_none(self, mock_call):
        """With huggingface_local as fallback the caller handles the local model."""
        mock_call.side_effect = LLMConnectionError("down")
        with self.settings(FALLBACK_LLM_PROVIDER='huggingface_local'):
            self.assertIsNone(LLMRouter().generate_text("prompt", provider_name="openai"))
        mock_call.assert_called_once()

    @patch('llm_gateway.router.LLMRouter._call_litellm')
    def test_failure_switches_to_fallback_connector(self, mock_call):
        mock_call.side_effect = [LLMConnectionError("down"), "from fallback"]
        router = LLMRouter()
        with self.settings(FALLBACK_LLM_PROVIDER='gemini'):
            result = router.generate_text("prompt", provider_name="openai")
        self.assertEqual(result, "from fallback")
        self.assertEqual(mock_call.call_args_list[1].args[1], 'gemini')
        self.assertEqual(router.model_used, 'gemini')

    @patch('llm_gateway.router.LLMRouter._call_litellm')
    def test_failing_fallback_connector_returns_none(self, mock_call):
        mock_call.side_effect = [LLMConnectionError("down"), LLMConnectionError("also down")]
        with self.settings(FALLBACK_LLM_PROVIDER='gemini'):
            self.assertIsNone(LLMRouter().generate_text("prompt", provider_name="openai"))

    @patch('llm_gateway.router.LLMRouter._call_litellm')
    def test_default_provider_comes_from_the_default_llm_override(self, mock_call):
        from connectors.models import ConnectorOverride
        ConnectorOverride.objects.create(connector_id='anthropic', is_default_llm=True)
        mock_call.return_value = "ok"
        LLMRouter().generate_text("prompt")
        self.assertEqual(mock_call.call_args.args[1], 'anthropic')


class RouterConfigTests(TestCase):
    """Test the connector configuration lookup, including the generic_llm_provider rename."""

    def test_generic_llm_provider_falls_back_to_generic_settings(self):
        with self.settings(GENERIC_LLM_MODEL='m', GENERIC_LLM_KEY='k', GENERIC_LLM_URL='http://u'):
            config = LLMRouter()._get_llm_config('generic_llm_provider')
        self.assertEqual(config, {'MODEL_NAME': 'm', 'API_KEY': 'k', 'BASE_URL': 'http://u'})

    def test_database_override_takes_precedence_over_settings(self):
        from connectors.models import ConnectorOverride
        ConnectorOverride.objects.create(connector_id='generic_llm_provider', overrides={'MODEL_NAME': 'db-model'})
        with self.settings(GENERIC_LLM_MODEL='settings-model'):
            config = LLMRouter()._get_llm_config('generic_llm_provider')
        self.assertEqual(config['MODEL_NAME'], 'db-model')