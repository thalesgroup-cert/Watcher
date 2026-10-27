class LLMGatewayError(Exception):
    """Base class for all LLM Gateway exceptions."""
    pass

class LLMConnectionError(LLMGatewayError):
    """Raised when an LLM provider is unreachable (timeout, network issues, etc.)."""
    pass

class LLMAuthenticationError(LLMGatewayError):
    """Raised when there is an authentication issue (invalid API key, missing permissions)."""
    pass

class LLMQuotaExceededError(LLMGatewayError):
    """Raised when the provider's API rate limit or billing quota has been exceeded."""
    pass