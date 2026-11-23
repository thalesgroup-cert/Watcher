class PromptBuilder:
    """Utility to generate strict, token-optimized prompts for the LLM."""

    @staticmethod
    def build_security_analysis_prompt(safe_logs: str) -> str:
        """
        Builds a zero-shot prompt forcing the LLM to output ONLY a JSON object.
        This saves output tokens and makes the response programmatically parsable.
        """
        
        system_instruction = (
            "You are a strict cybersecurity AI. Your ONLY job is to analyze logs and detect threats. "
            "You MUST respond with a raw, valid JSON object ONLY. "
            "Do NOT include greetings, explanations, or markdown blocks (no ```json). "
            "If no logs are provided, return a JSON with threat_detected: false."
        )

        json_schema = """
{
    "threat_detected": boolean,
    "severity": "none|low|medium|high|critical",
    "attack_type": "string (or null if none)",
    "summary": "1 short sentence explaining the situation",
    "recommended_action": "string"
}
"""

        prompt = f"""{system_instruction}

EXPECTED OUTPUT FORMAT:
{json_schema}

LOGS TO ANALYZE:
{safe_logs}
"""
        return prompt