

import logging
from transformers import pipeline, AutoTokenizer, AutoModelForSeq2SeqLM

logger = logging.getLogger('watcher.threats_watcher')

# Global model cache
_ner_pipeline = None
_summarizer_pipeline = None
_summarizer_tokenizer = None
_summarizer_model = None


def get_ner_pipeline():
    """
    Load and return Named Entity Recognition pipeline.
    
    Uses dslim/bert-base-NER with grouped entities for:
        - Person names (PER)
        - Organizations (ORG)
        - Locations (LOC)
        - Miscellaneous entities (MISC)
    """
    global _ner_pipeline
    if _ner_pipeline is None:
        try:
            _ner_pipeline = pipeline(
                "ner",
                model="dslim/bert-base-NER",
                grouped_entities=True
            )
            logger.info("NER model (dslim/bert-base-NER) loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load NER model: {e}")
            return None
    return _ner_pipeline


def get_summarizer_pipeline():
    """
    Load and return text generation pipeline (legacy compatibility).
    
    Uses google/flan-t5-base for text-to-text generation tasks.
    Kept for backward compatibility with breaking news generation.
    
    For full control over generation parameters, use get_summarizer_model() instead.
    """
    global _summarizer_pipeline
    if _summarizer_pipeline is None:
        try:
            _summarizer_pipeline = pipeline(
                "text2text-generation",
                model="google/flan-t5-base"
            )
            logger.info("FLAN-T5 summarizer pipeline loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load FLAN-T5 summarizer pipeline: {e}")
            return None
    return _summarizer_pipeline


def get_summarizer_tokenizer():
    """
    Load and return FLAN-T5 tokenizer.
    """
    global _summarizer_tokenizer
    if _summarizer_tokenizer is None:
        try:
            _summarizer_tokenizer = AutoTokenizer.from_pretrained("google/flan-t5-base")
            logger.info("FLAN-T5 tokenizer loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load FLAN-T5 tokenizer: {e}")
            return None
    return _summarizer_tokenizer


def get_summarizer_model():
    """
    Load and return FLAN-T5 model with tokenizer for advanced generation.
    
    Provides direct access to model.generate() for:
        - Fine-grained control over generation parameters
        - Custom beam search settings
        - GPU acceleration support
        - Avoiding pipeline limitations
    """
    global _summarizer_model, _summarizer_tokenizer
    if _summarizer_model is None or _summarizer_tokenizer is None:
        try:
            _summarizer_tokenizer = AutoTokenizer.from_pretrained("google/flan-t5-base")
            _summarizer_model = AutoModelForSeq2SeqLM.from_pretrained("google/flan-t5-base")
            logger.info("FLAN-T5 model and tokenizer loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load FLAN-T5 model/tokenizer: {e}")
            return None, None
    return _summarizer_model, _summarizer_tokenizer