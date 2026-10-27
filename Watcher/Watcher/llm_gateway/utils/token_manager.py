import logging

logger = logging.getLogger(__name__)

try:
    import tiktoken
except ImportError:
    tiktoken = None
    logger.warning("tiktoken library not found. Falling back to character-based approximation (1 token ~= 4 chars).")

class TokenManager:
    """Utility to count tokens and preventively truncate data to avoid LLM limits."""
    
    ENCODING_NAME = "cl100k_base"

    @classmethod
    def count_tokens(cls, text: str) -> int:
        """Returns the estimated number of tokens in a text string."""
        if not text:
            return 0
            
        if tiktoken:
            try:
                encoding = tiktoken.get_encoding(cls.ENCODING_NAME)
                return len(encoding.encode(text))
            except Exception as e:
                logger.error(f"Token counting error: {str(e)}")
        
        return len(text) // 4

    @classmethod
    def truncate_logs(cls, compressed_logs: str, max_tokens: int = 4000) -> str:
        """
        Truncates a large string of logs to fit within the max_tokens limit.
        It removes lines from the end to avoid splitting a JSON object in half.
        """
        if cls.count_tokens(compressed_logs) <= max_tokens:
            return compressed_logs

        lines = compressed_logs.split('\n')
        truncated_lines = []
        current_tokens = 0
        
        for line in lines:
            line_tokens = cls.count_tokens(line) + 1 
            
            if current_tokens + line_tokens > max_tokens:
                truncated_lines.append("\n... [WARNING: Remaining logs truncated to stay within token limits] ...")
                break
                
            truncated_lines.append(line)
            current_tokens += line_tokens
            
        return "\n".join(truncated_lines)