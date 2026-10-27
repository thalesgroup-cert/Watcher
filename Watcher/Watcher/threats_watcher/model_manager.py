import logging
import os
from django.conf import settings
from transformers import pipeline, AutoTokenizer, AutoModelForCausalLM

logger = logging.getLogger('watcher.threats_watcher')

# Global model cache to prevent redundant loading
_ner_pipeline = None
_summarizer_tokenizer = None
_summarizer_model = None

# Retrieve the local CausalLM model from environment settings for offline fallback
LOCAL_MODEL_NAME = getattr(settings, 'HF_LOCAL_MODEL', 'Qwen/Qwen2.5-0.5B-Instruct')

def get_ner_pipeline():
    """
    Load and return the Named Entity Recognition (NER) pipeline.
    
    This lightweight model (dslim/bert-base-NER) is explicitly maintained to perform
    fast and efficient entity extraction (PER, ORG, LOC, MISC) across large volumes 
    of RSS feed titles, avoiding the overhead of generating these entities via LLMs.
    
    Returns:
        transformers.pipelines.Pipeline: The initialized NER pipeline, or None if loading fails.
    """
    global _ner_pipeline
    if _ner_pipeline is None:
        try:
            _ner_pipeline = pipeline(
                "ner",
                model="dslim/bert-base-NER",
                aggregation_strategy="simple"
            )
            logger.info("NER model (dslim/bert-base-NER) loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load NER model: {e}")
            return None
    return _ner_pipeline

def get_summarizer_tokenizer():
    """
    Load and return the tokenizer associated with the local fallback LLM.
    
    Returns:
        transformers.PreTrainedTokenizer: The initialized tokenizer, or None if loading fails.
    """
    global _summarizer_tokenizer
    if _summarizer_tokenizer is None:
        try:
            _summarizer_tokenizer = AutoTokenizer.from_pretrained(LOCAL_MODEL_NAME)
        except Exception as e:
            logger.error(f"Failed to load tokenizer for {LOCAL_MODEL_NAME}: {e}")
            return None
    return _summarizer_tokenizer

def get_summarizer_model():
    """
    Load and return the local fallback language model (CausalLM) and its tokenizer.
    
    This model serves as the offline failover mechanism for threat intelligence 
    summarization and clustering when primary LLM API gateways (e.g., OpenAI, Gemini) 
    are unavailable or unconfigured.
    
    Returns:
        tuple: (model, tokenizer) if successful, otherwise (None, None).
    """
    global _summarizer_model, _summarizer_tokenizer
    if _summarizer_model is None or _summarizer_tokenizer is None:
        try:
            _summarizer_tokenizer = AutoTokenizer.from_pretrained(LOCAL_MODEL_NAME)
            _summarizer_model = AutoModelForCausalLM.from_pretrained(LOCAL_MODEL_NAME)
            logger.info(f"Fallback Model ({LOCAL_MODEL_NAME}) loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load Fallback Model ({LOCAL_MODEL_NAME}): {e}")
            return None, None
    return _summarizer_model, _summarizer_tokenizer