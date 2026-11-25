from django.test import TestCase
from unittest.mock import patch

from llm_gateway.router import LLMRouter
from llm_gateway.router import LLMConnectionError
from connectors.core import connector_encrypt


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
    """The router reads the LLM connector fields through connectors.core, like the Connectors page."""

    def setUp(self):
        import connectors.core as core_mod
        core_mod._REGISTRY = {}
        core_mod._connectors_seeded = False

    def test_generic_llm_provider_falls_back_to_generic_settings(self):
        with self.settings(GENERIC_LLM_MODEL='m', GENERIC_LLM_KEY='k', GENERIC_LLM_URL='http://u'):
            config = LLMRouter()._get_llm_config('generic_llm_provider')
        self.assertEqual(config, {'model': 'm', 'api_key': 'k', 'base_url': 'http://u'})

    def test_database_override_takes_precedence_over_settings(self):
        from connectors.models import ConnectorOverride
        ConnectorOverride.objects.create(connector_id='generic_llm_provider', overrides={'GENERIC_LLM_MODEL': 'db-model'})
        with self.settings(GENERIC_LLM_MODEL='settings-model'):
            config = LLMRouter()._get_llm_config('generic_llm_provider')
        self.assertEqual(config['model'], 'db-model')

    def test_encrypted_api_key_is_decrypted(self):
        from connectors.models import ConnectorOverride
        ConnectorOverride.objects.create(connector_id='openai', overrides={'OPENAI_API_KEY': connector_encrypt('sk-secret')})
        config = LLMRouter()._get_llm_config('openai')
        self.assertEqual(config['api_key'], 'sk-secret')

    def test_unknown_connector_returns_empty_config(self):
        self.assertEqual(LLMRouter()._get_llm_config('smtp'), {})