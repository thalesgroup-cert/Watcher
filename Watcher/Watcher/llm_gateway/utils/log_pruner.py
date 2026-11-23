import json
from collections import Counter
from typing import List, Union, Dict, Any

NOISY_FIELDS = {
    "user_agent", "cookie", "session_id", "trace_id", 
    "request_id", "x_forwarded_for", "authorization", "referer"
}

class LogPruner:
    """Utility to clean and compress logs before sending them to the LLM."""

    @staticmethod
    def clean_log_entry(log: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively removes noisy or useless keys from a log dictionary."""
        cleaned = {}
        for key, value in log.items():
            if key.lower() not in NOISY_FIELDS:
                if isinstance(value, dict):
                    cleaned[key] = LogPruner.clean_log_entry(value)
                else:
                    cleaned[key] = value
        return cleaned

    @staticmethod
    def compress_logs(logs: List[Union[Dict, str]]) -> str:
        """Cleans and deduplicates a list of logs to maximize token savings."""
        if not logs:
            return ""

        processed_logs = []
        
        for log in logs:
            if isinstance(log, dict):
                clean_dict = LogPruner.clean_log_entry(log)
                processed_logs.append(json.dumps(clean_dict, sort_keys=True))
            else:
                processed_logs.append(str(log).strip())
                
        counts = Counter(processed_logs)
        
        final_output = []
        for log_str, count in counts.items():
            if count > 1:
                final_output.append(f"[x{count} occurrences] {log_str}")
            else:
                final_output.append(log_str)    
        return "\n".join(final_output)