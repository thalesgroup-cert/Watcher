import logging
import re
import difflib
import json
from typing import List, Set
from datetime import timedelta

from django.utils import timezone
from django.conf import settings

from .models import TrendyWord, PostUrl, Summary
from .model_manager import (
    get_ner_pipeline,
    get_summarizer_pipeline,
    get_summarizer_tokenizer,
    get_summarizer_model,
)

logger = logging.getLogger('watcher.threats_watcher')


def normalize_text(text: str) -> str:
    """Normalize text for comparison: lowercase, collapse whitespace, remove punctuation."""
    import string

    if not text:
        return ""
    text = text.lower().strip()
    text = re.sub(r'\s+', ' ', text)
    text = text.translate(str.maketrans('', '', string.punctuation))
    return text


def extract_and_normalize_cves(text: str) -> Set[str]:
    """Extract and validate CVE identifiers (CVE-YYYY-NNNNN format, year 1999-2030)."""
    if not text:
        return set()
    cve_pattern = r'\bCVE-(\d{4})-(\d{4,7})\b'
    matches = re.findall(cve_pattern, text, re.IGNORECASE)
    normalized_cves = set()

    for year, number in matches:
        try:
            year_int = int(year)
            if 1999 <= year_int <= 2030:
                normalized_cves.add(f"CVE-{year}-{number}")
        except ValueError:
            continue

    return normalized_cves


def clean_text_and_metadata(text: str) -> str:
    """Clean text from attribution phrases, metadata, and invalid CVEs."""
    if not text:
        return ""

    # Remove attribution patterns
    attribution_patterns = [
        r"appeared first on [^\s.]+",
        r"appeared on [^\s.]+",
        r"This article was written by [^.]+\.",
        r"This article originally appeared on [^.]+\.",
        r"Read more at [^\s.]+",
        r"Source: [^\s.]+",
        r"Posted by [^.]+\.",
        r"Originally published at [^\s.]+",
        r"The post .+ appeared first on .+\.",
        r"\[Continue reading\]",
        r"\[Read more\.\.\.\]",
    ]

    for pattern in attribution_patterns:
        text = re.sub(pattern, "", text, flags=re.IGNORECASE)

    # Remove call-to-action and promotional content
    cleanup_patterns = [
        r"Share your story.*", r"Read the rest.*", r"Contact us.*",
        r"Find out more.*", r"Subscribe.*", r"Sign up.*",
        r"Click here.*", r"Tell us.*", r"Advert.*", r"Advertisement.*",
        r"Watch now.*", r"Listen now.*", r"For more.*",
        r"This week's Cyber Threat Digest.*",
        r"Your max_length is set to.*",
        r"\d+ mentions?",
    ]

    for pattern in cleanup_patterns:
        text = re.sub(pattern, "", text, flags=re.IGNORECASE)

    text = re.sub(r"http\S+", "", text)
    text = re.sub(r"www\.[^\s]+", "", text)

    # Remove invalid CVEs
    all_cves = re.findall(r'\bCVE-(\d{4})-(\S+)\b', text, re.IGNORECASE)
    for year, number in all_cves:
        try:
            year_int = int(year)
            if year_int < 1999 or year_int > 2030:
                text = re.sub(
                    r'\b[cC][vV][eE]-?\s?' + year + r'-?\s?' + re.escape(number) + r'\b',
                    '',
                    text
                )
        except ValueError:
            text = re.sub(
                r'\b[cC][vV][eE]-?\s?' + year + r'-?\s?' + re.escape(number) + r'\b',
                '',
                text
            )

    text = re.sub(r'\s+', ' ', text).strip()
    return text


def is_duplicate_summary(summary: str, existing_summaries: List[str], threshold: float = 0.85) -> bool:
    """Check if a summary is too similar to any existing summary."""
    if not summary:
        return False
    norm_summary = normalize_text(summary)
    if len(norm_summary) < 10:
        return False

    for existing in existing_summaries:
        norm_existing = normalize_text(existing)
        similarity = difflib.SequenceMatcher(None, norm_summary, norm_existing).ratio()
        if similarity >= threshold:
            logger.debug(f"Duplicate detected (similarity={similarity:.2f}): '{summary[:80]}...' vs '{existing[:80]}...'")
            return True
    return False


def is_english(text: str, threshold: float = 0.80) -> bool:
    """Detect if text is English with confidence threshold."""
    if not text or len(text.strip()) < 20:
        return False

    try:
        from langdetect import detect_langs
        langs = detect_langs(text)

        for lang in langs:
            if lang.lang == 'en' and lang.prob >= threshold:
                return True

        if langs and langs[0].lang == 'en' and langs[0].prob >= (threshold - 0.1):
            return True

        return False

    except Exception:
        txt = text.lower()

        spanish_markers = [" el ", " la ", " los ", " una ", " de ", " y ", " con ", " está ", " para "]
        french_markers = [" le ", " la ", " les ", " un ", " une ", " avec ", " est ", " pour "]
    
        spanish_count = sum(1 for marker in spanish_markers if marker in txt)
        french_count = sum(1 for marker in french_markers if marker in txt)

        if spanish_count >= 3 or french_count >= 3:
            return False

        english_markers = [" the ", " and ", " with ", " this ", " that ", " from ", " have "]
        english_count = sum(1 for marker in english_markers if marker in txt)

        return english_count > max(spanish_count, french_count)


def clean_attribution_text(text: str) -> str:
    """Remove attribution phrases and metadata."""
    if not text:
        return ""
    patterns = [
        r"appeared first on [^\s.]+",
        r"appeared on [^\s.]+",
        r"This article was written by [^.]+\.",
        r"This article originally appeared on [^.]+\.",
        r"Read more at [^\s.]+",
        r"Source: [^\s.]+",
        r"Posted by [^.]+\.",
        r"Originally published at [^\s.]+",
        r"The post .+ appeared first on .+\.",
        r"\[Continue reading\]",
        r"\[Read more\.\.\.\]",
    ]
    
    for pattern in patterns:
        text = re.sub(pattern, "", text, flags=re.IGNORECASE)
    
    return text.strip()


def deduplicate_titles(titles: List[str]) -> List[str]:
    """Remove duplicate titles using normalized comparison."""
    seen_normalized = set()
    unique_titles = []
    
    for title in titles:
        normalized = normalize_text(title)
        if normalized not in seen_normalized and len(normalized) > 10:
            seen_normalized.add(normalized)
            unique_titles.append(title)
    
    return unique_titles


def get_article_title_or_summary(posturl_obj):
    """Extract article content from PostUrl using multiple fallback strategies."""
    import feedparser
    import requests
    import re
    import json
    import html as _html

    url = getattr(posturl_obj, "url", None)
    if not url:
        return ""

    ua = getattr(settings, "REQUESTS_USER_AGENT",
                 "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                 "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36")
    headers = {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": getattr(settings, "WATCHER_URL", "https://example.com"),
    }
    timeout = getattr(settings, "THREATS_WATCHER_REQUEST_TIMEOUT", 10)

    try:
        session = requests.Session()
        resp = session.get(url, headers=headers, timeout=timeout, allow_redirects=True)
    except Exception as e:
        logger.warning(f"Failed fetching URL {url}: {e}")
        return ""

    if resp.status_code != 200:
        return ""

    try:
        if resp.encoding is None:
            resp.encoding = resp.apparent_encoding
    except Exception:
        pass

    html_text = resp.text or ""
    if not html_text or len(html_text.strip()) < 50:
        return ""

    try:
        feed = feedparser.parse(html_text)
        if hasattr(feed, "entries") and len(feed.entries) > 0:
            entry = feed.entries[0]
            title = entry.get('title', '') or ""
            summary = entry.get('summary', '') or entry.get('description', '') or ""
            if summary:
                cleaned = clean_text_and_metadata(summary)
                if cleaned and len(cleaned) > 40:
                    return cleaned
            if title and len(title) > 20:
                cleaned_title = clean_text_and_metadata(title)
                if cleaned_title and len(cleaned_title) > 20:
                    return cleaned_title
    except Exception:
        pass

    def _strip_tags_and_unescape(s: str) -> str:
        if not s:
            return ""
        s = re.sub(r'(?is)<(script|style).*?>.*?</\1>', ' ', s)
        s = re.sub(r'(?is)<[^>]+>', ' ', s)
        s = _html.unescape(s)
        s = re.sub(r'\s+', ' ', s).strip()
        return s

    # 2) JSON-LD extraction via regex
    try:
        json_ld_blocks = re.findall(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html_text, flags=re.I | re.S)
        for block in json_ld_blocks:
            try:
                data = json.loads(block.strip())
            except Exception:
                try:
                    start = block.find('{')
                    end = block.rfind('}')
                    if start != -1 and end != -1 and end > start:
                        data = json.loads(block[start:end+1])
                    else:
                        continue
                except Exception:
                    continue

            items = data if isinstance(data, list) else [data]
            for item in items:
                if not isinstance(item, dict):
                    continue
                for key in ('articleBody', 'description', 'headline', 'name'):
                    val = item.get(key)
                    if val and isinstance(val, str) and len(val.strip()) > 40:
                        cleaned = clean_text_and_metadata(val)
                        if cleaned and len(cleaned) > 40:
                            return cleaned
                graph = item.get('@graph') or item.get('graph')
                if isinstance(graph, list):
                    for g in graph:
                        if not isinstance(g, dict):
                            continue
                        for key in ('articleBody', 'description', 'headline', 'name'):
                            val = g.get(key)
                            if val and isinstance(val, str) and len(val.strip()) > 40:
                                cleaned = clean_text_and_metadata(val)
                                if cleaned and len(cleaned) > 40:
                                    return cleaned
    except Exception:
        pass

    # 3) Meta tags extraction via regex (robust to attribute order)
    try:
        metas = re.findall(r'<meta\b[^>]*>', html_text, flags=re.I)
        for m in metas:
            attr_name = None
            content = None
            name_match = re.search(r'\b(name|property)\s*=\s*["\']([^"\']+)["\']', m, flags=re.I)
            if name_match:
                attr_name = name_match.group(2).strip().lower()
            content_match = re.search(r'\bcontent\s*=\s*["\']([^"\']+)["\']', m, flags=re.I)
            if content_match:
                content = content_match.group(1).strip()
            if content and attr_name in ('og:description', 'twitter:description', 'description'):
                cleaned = clean_text_and_metadata(content)
                if cleaned and len(cleaned) > 40:
                    return cleaned
    except Exception:
        pass

    # 4) <Article> tag extraction via regex
    try:
        article_match = re.search(r'(?is)<article\b[^>]*>(.*?)</article>', html_text)
        if article_match:
            article_html = article_match.group(1)
            article_text = _strip_tags_and_unescape(article_html)
            article_text = clean_text_and_metadata(article_text)
            if article_text and len(article_text) > 40:
                return article_text
    except Exception:
        pass

    # 5) Common container classes (div/section) fallback via regex
    try:
        selector_pattern = re.compile(
            r'(?is)<(div|section)\b[^>]*class=["\'][^"\']*(article|article-body|post-content|content-body|main-content|entry-content|post-body)[^"\']*["\'][^>]*>(.*?)</\1>'
        )
        for m in selector_pattern.finditer(html_text):
            inner = m.group(3)
            txt = _strip_tags_and_unescape(inner)
            txt = clean_text_and_metadata(txt)
            if txt and len(txt) > 40:
                return txt
    except Exception:
        pass

    # 6) H1/H2 fallback (titles)
    try:
        h1_match = re.search(r'(?is)<h1\b[^>]*>(.*?)</h1>', html_text)
        h2_match = re.search(r'(?is)<h2\b[^>]*>(.*?)</h2>', html_text)
        h1_txt = _strip_tags_and_unescape(h1_match.group(1)) if h1_match else ""
        h2_txt = _strip_tags_and_unescape(h2_match.group(1)) if h2_match else ""
        combined = " ".join(filter(None, [h1_txt.strip(), h2_txt.strip()])).strip()
        combined = clean_text_and_metadata(combined)
        if combined and len(combined) > 40:
            return combined
    except Exception:
        pass

    # Nothing found
    logger.debug(f"No valid extracted content for {url} (fetched len={len(html_text)})")
    return ""


def extract_entities_and_threats(title: str) -> dict:
    """Extract entities and threats from title using NER model."""
    ner_pipe = get_ner_pipeline()
    if not ner_pipe:
        logger.error("NER pipeline not available")
        return {
            "persons": [],
            "organizations": [],
            "locations": [],
            "product": [],
            "cves": [],
            "attackers": [],
        }

    try:
        ner_results = ner_pipe(title)
    except Exception as e:
        logger.warning(f"NER pipeline failure: {e}")
        return {
            "persons": [],
            "organizations": [],
            "locations": [],
            "product": [],
            "cves": [],
            "attackers": [],
        }

    persons = set()
    organizations = set()
    locations = set()
    products = set()

    common_noise = ['the', 'and', 'for', 'with', 'from', 'this', 'that', 'are', 'was', 'has', 'have']

    for ent in ner_results:
        grp = ent.get("entity_group") or ent.get("entity") or ent.get("label")
        text = ent.get("word") or ent.get("entity") or ent.get("text", "")

        if isinstance(text, str) and text.startswith('##'):
            continue
        if not isinstance(text, str) or len(text) <= 2:
            continue
        if text.isdigit():
            continue
        if text.lower() in common_noise:
            continue

        if grp == "PER" or grp == "PERSON":
            persons.add(text)
        elif grp == "ORG" or grp == "ORGANIZATION":
            for token in text.split():
                if not token.startswith('##') and len(token) > 2 and not token.isdigit() and token[0].isupper():
                    organizations.add(token)
        elif grp == "LOC" or grp == "LOCATION":
            locations.add(text)
        elif grp == "MISC":
            for token in text.split():
                if not token.startswith('##') and len(token) > 2 and not token.isdigit() and (token[0].isupper() or token.isupper()):
                    products.add(token)

    cves = extract_and_normalize_cves(title)

    ATTACKER_PATTERNS = [r"\bAPT\d+\b", r"\bFIN\d+\b", r"\bHFG\d+\b"]
    attackers = []
    for pat in ATTACKER_PATTERNS:
        attackers += re.findall(pat, title)

    return {
        "persons": list(persons),
        "organizations": list(organizations),
        "locations": list(locations),
        "product": list(products),
        "cves": list(cves),
        "attackers": list(set(attackers)),
    }


def generate_weekly_summary():
    """Generate and send weekly threat summary (top-5 trending topics)."""
    logger.info("Starting weekly summary generation")

    try:
        model, tokenizer = get_summarizer_model()
        if model is None or tokenizer is None:
            raise RuntimeError("Summarizer model unavailable")

        try:
            model.eval()
        except Exception:
            pass

        logger.info("Summarizer model loaded successfully")
    except Exception:
        logger.error("Failed to load summarizer model", exc_info=True)
        return

    try:
        from .core import send_threats_watcher_notifications

        trendywords_qs = TrendyWord.objects.all().order_by('-created_at')
        logger.info(f"Processing {trendywords_qs.count()} trending word candidates")

        summaries_data = []
        keywords_used = []
        existing_summaries = []
        cutoff = timezone.now() - timedelta(days=30)

        # Generation parameters
        max_words_needed = 5
        max_posts_per_trend = 30
        max_input_tokens = 450
        min_words, max_words_target = 30, 90
        generation_min_new_tokens, generation_max_new_tokens = 40, 150
        num_beams = 5
        no_repeat_ngram_size = 3
        length_penalty = 0.9
        early_stopping = True
        english_confidence_threshold = 0.70

        max_attempts = min(trendywords_qs.count(), max_words_needed * 5)

        for tw in trendywords_qs[:max_attempts]:
            if len(summaries_data) >= max_words_needed:
                break

            logger.info(f"Processing trendy word '{tw.name}'")

            posturls = list(tw.posturls.filter(created_at__gte=cutoff).order_by('-created_at')[:max_posts_per_trend])

            if not posturls:
                continue

            raw_titles = []
            for posturl_obj in posturls:
                try:
                    text = get_article_title_or_summary(posturl_obj)
                    if not text or len(text.strip()) < 30:
                        logger.debug(f"Insufficient text for {posturl_obj.url} (len={len(text) if text else 0})")
                        continue

                    text = clean_text_and_metadata(text)
                    if len(text.strip()) < 30:
                        logger.debug(f"Text too short after cleaning for {posturl_obj.url}")
                        continue

                    if not is_english(text, threshold=english_confidence_threshold):
                        logger.debug(f"Non-English source skipped for {posturl_obj.url}")
                        continue

                    raw_titles.append(text)

                except Exception as e:
                    logger.warning(f"Error processing post for '{tw.name}': {e}")
                    continue

            if not raw_titles:
                continue

            all_titles = deduplicate_titles(raw_titles)

            min_titles_required = 1 if tw.name.startswith('CVE-') else 2
            if len(all_titles) < min_titles_required:
                continue

            # Build corpus
            corpus = " ".join(all_titles[:20])
            corpus_words = corpus.split()
            if len(corpus_words) > 350:
                corpus = " ".join(corpus_words[:350])

            prompt = (
                f"Write a complete summary of this cybersecurity news in {min_words}-{max_words_target} words. "
                f"Requirements:\n"
                f"- Write 2-3 complete sentences (NO truncation)\n"
                f"- Be specific about vulnerability, products, impact\n"
                f"- End with a period\n\n"
                f"{corpus}"
            )

            # Generate summary
            try:
                import torch
                with torch.no_grad():
                    inputs = tokenizer(prompt, truncation=True, max_length=max_input_tokens, return_tensors="pt")

                    gen_kwargs = {
                        "max_new_tokens": generation_max_new_tokens,
                        "min_new_tokens": generation_min_new_tokens,
                        "num_beams": num_beams,
                        "no_repeat_ngram_size": no_repeat_ngram_size,
                        "early_stopping": early_stopping,
                        "do_sample": False,
                        "length_penalty": length_penalty,
                        "repetition_penalty": 1.3,
                    }

                    try:
                        summarizer_model = get_summarizer_model()[0]
                        outputs = summarizer_model.generate(input_ids=inputs["input_ids"], attention_mask=inputs.get("attention_mask"), **gen_kwargs)
                        generated = get_summarizer_model()[1].decode(outputs[0], skip_special_tokens=True, clean_up_tokenization_spaces=True)
                    except Exception:
                        summarizer = get_summarizer_pipeline()
                        if summarizer:
                            res = summarizer(prompt, max_length=120, min_length=40, truncation=True, do_sample=False)
                            if isinstance(res, list) and res:
                                first = res[0]
                                if isinstance(first, dict):
                                    generated = first.get('generated_text') or first.get('summary_text') or first.get('text') or ""
                                elif isinstance(first, str):
                                    generated = first
                            elif isinstance(res, dict):
                                generated = res.get('generated_text') or res.get('summary_text') or res.get('text') or ""
                            else:
                                generated = str(res)
                        else:
                            raise RuntimeError("No summarizer available")

            except Exception as e:
                logger.error(f"Generation failed for '{tw.name}': {e}")
                continue

            summary = (generated or "").strip()
            summary = re.sub(r'^(summarize|summary|text):\s*', '', summary, flags=re.IGNORECASE)
            summary = clean_text_and_metadata(summary)
            summary = re.sub(r'\s+', ' ', summary).strip()

            cves_in_summary = extract_and_normalize_cves(summary)

            if summary and not summary[0].isupper():
                summary = summary[0].upper() + summary[1:]

            if summary and not summary.endswith(('.', '!', '?')):
                summary += '.'

            word_count = len(summary.split()) if summary else 0
            if word_count < 20:
                continue

            if is_duplicate_summary(summary, existing_summaries, threshold=0.70):
                continue

            # Extract entities
            entities = {
                'products': set(),
                'cves': set(),
                'organizations': set(),
                'attackers': set()
            }

            for title in all_titles:
                try:
                    extracted = extract_entities_and_threats(title)
                    entities['products'].update(extracted.get('product', []))
                    entities['cves'].update(extracted.get('cves', []))
                    entities['organizations'].update(extracted.get('organizations', []))
                    entities['attackers'].update(extracted.get('attackers', []))
                except Exception:
                    continue

            entities['products'] = {p for p in entities['products'] if len(p) >= 4 and not p.isdigit()}
            entities['cves'] = cves_in_summary

            summaries_data.append({
                'summary': summary,
                'entities': entities
            })
            existing_summaries.append(summary)
            keywords_used.append(tw.name)
            logger.info(f"Summary generated for '{tw.name}'")

        if summaries_data:
            summary_lines = []
            for item in summaries_data:
                summary_lines.append(f"• {item['summary']}")
                metadata = []
                entities = item['entities']
                if entities['products']:
                    products = sorted(list(entities['products']))[:3]
                    metadata.append(f"Products: {', '.join(products)}")
                if entities['cves']:
                    cves = sorted(list(entities['cves']))
                    cve_links = [f"{cve} (https://nvd.nist.gov/vuln/detail/{cve})" for cve in cves]
                    metadata.append(f"CVEs: {' | '.join(cve_links)}")
                if entities['attackers']:
                    attackers = sorted(list(entities['attackers']))[:2]
                    metadata.append(f"Threat actors: {', '.join(attackers)}")
                if metadata:
                    summary_lines.append("  " + " | ".join(metadata))
                summary_lines.append("")
            summary_text = "\n".join(summary_lines).strip()
            logger.info(f"Weekly summary generated with {len(summaries_data)} entries")

            summary_obj = Summary.objects.create(
                type='weekly_summary',
                keywords=', '.join(keywords_used),
                summary_text=summary_text
            )
            from .core import send_threats_watcher_notifications
            send_threats_watcher_notifications(summary_text)
            logger.info("Weekly summary notifications sent")
        else:
            logger.info("No valid summaries generated this week")

    except Exception as e:
        logger.error(f"Weekly summary generation failed: {e}", exc_info=True)
        from .core import send_threats_watcher_notifications
        try:
            send_threats_watcher_notifications({'summary_text': "Weekly threat analysis failed due to technical issue."})
        except Exception:
            logger.exception("Failed to send failure notification")
    finally:
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass


def generate_breaking_news(trendy_word):
    """Generate a breaking-news style alert for a TrendyWord."""
    logger.info(f"Generating breaking news for '{trendy_word.name}' ({getattr(trendy_word, 'occurrences', 'n/a')} occurrences)")
    summarizer = get_summarizer_pipeline()
    tokenizer = get_summarizer_tokenizer()

    if not summarizer or not tokenizer:
        logger.error("Summarizer pipeline or tokenizer unavailable")
        return None

    try:
        from .core import send_threats_watcher_notifications

        posturls_qs = trendy_word.posturls.all().order_by('-created_at')
        posturls = list(posturls_qs)

        if not posturls:
            return None

        raw_texts = []
        for posturl_obj in posturls:
            try:
                txt = get_article_title_or_summary(posturl_obj)
                if not txt:
                    continue
                txt = clean_text_and_metadata(txt)
                if txt and len(txt.strip()) >= 30:
                    raw_texts.append(txt.strip())
            except Exception:
                continue

        if not raw_texts:
            return None

        unique_texts = deduplicate_titles(raw_texts)
        candidate_texts = unique_texts if unique_texts else raw_texts

        corpus = "\n\n".join(candidate_texts).strip()
        if len(corpus) < 40:
            corpus = " ".join(raw_texts).strip()
        if len(corpus) < 40:
            return None

        pre_prompt = (
            "Produce a single short paragraph (1-3 short sentences, 15-70 words) summarizing the cybersecurity news below. "
            "Only provide factual information. Do NOT output questions, instructions, repeated lines, placeholders, or prompts like 'Identify the'. "
            "Be specific about affected products, impact and CVEs. End with a single period.\n\n"
        )
        full_input = pre_prompt + corpus

        max_input_tokens = getattr(settings, "THREATS_WATCHER_MAX_INPUT_TOKENS", 1024)
        try:
            tokens = tokenizer.encode(full_input)
            input_tokens = len(tokens)
            if input_tokens > max_input_tokens:
                tokens = tokens[:max_input_tokens]
                try:
                    full_input = tokenizer.decode(tokens, skip_special_tokens=True, clean_up_tokenization_spaces=True)
                except Exception:
                    full_input = tokenizer.decode(tokens, skip_special_tokens=True)
                input_tokens = len(tokens)
        except Exception:
            input_tokens = len(full_input.split())
            if input_tokens > max_input_tokens:
                words = full_input.split()[:max_input_tokens]
                full_input = " ".join(words)
                input_tokens = len(words)

        max_len = min(150, max(80, input_tokens // 2))
        min_len = max(30, max_len // 2)

        def _extract_summary_from_result(result):
            if not result:
                return None
            try:
                if isinstance(result, list) and result:
                    first = result[0]
                    if isinstance(first, dict):
                        for key in ('summary_text', 'generated_text', 'text', 'content'):
                            val = first.get(key)
                            if val and isinstance(val, str) and val.strip():
                                return val.strip()
                    else:
                        if isinstance(first, str) and first.strip():
                            return first.strip()
                elif isinstance(result, dict):
                    for key in ('summary_text', 'generated_text', 'text', 'content'):
                        val = result.get(key)
                        if val and isinstance(val, str) and val.strip():
                            return val.strip()
                elif isinstance(result, str):
                    return result.strip()
            except Exception:
                return None
            return None

        summary_raw = None
        for attempt in range(2):
            prompt = full_input
            if attempt == 1:
                prompt = ("IMPORTANT: Do NOT output instructions, questions, or placeholders. Produce 1-2 factual sentences only.\n\n" + full_input)
            try:
                result = summarizer(prompt, max_length=max_len, min_length=min_len, truncation=True, do_sample=False)
            except Exception as e:
                logger.warning(f"Summarizer pipeline error for '{trendy_word.name}' on attempt {attempt+1}: {e}")
                result = None

            candidate = _extract_summary_from_result(result)
            if candidate:
                summary_raw = candidate
                break

        if not summary_raw:
            try:
                model, model_tokenizer = get_summarizer_model()
                if model and model_tokenizer:
                    import torch
                    with torch.no_grad():
                        inputs = model_tokenizer(full_input, truncation=True, max_length=450, return_tensors="pt")
                        gen_kwargs = {
                            "max_new_tokens": 120,
                            "min_new_tokens": 40,
                            "num_beams": 4,
                            "no_repeat_ngram_size": 3,
                            "early_stopping": True,
                            "do_sample": False,
                            "length_penalty": 0.9,
                        }
                        try:
                            outputs = model.generate(input_ids=inputs["input_ids"], attention_mask=inputs.get("attention_mask"), **gen_kwargs)
                        except RuntimeError as e:
                            if "out of memory" in str(e).lower():
                                try:
                                    torch.cuda.empty_cache()
                                except Exception:
                                    pass
                                gen_kwargs["max_new_tokens"] = 80
                                gen_kwargs["num_beams"] = 2
                                outputs = model.generate(input_ids=inputs["input_ids"], attention_mask=inputs.get("attention_mask"), **gen_kwargs)
                            else:
                                raise
                        summary_raw = model_tokenizer.decode(outputs[0], skip_special_tokens=True, clean_up_tokenization_spaces=True).strip()
            except Exception as e:
                logger.warning(f"Model.generate fallback failed for '{trendy_word.name}': {e}")
                summary_raw = None

        summary_text = None
        if summary_raw and summary_raw.strip():
            summary_text = clean_text_and_metadata(summary_raw.strip())
            summary_text = re.sub(r'^\s*Breaking:\s*', '', summary_text, flags=re.IGNORECASE)
            summary_text = re.sub(r"'\w+'\s*\(\s*\)\.\s*", '', summary_text)
            summary_text = re.sub(r'\s+', ' ', summary_text).strip()

            disallowed_patterns = [
                r'(?i)\bidentify the\b', r'(?i)\blist the\b', r'(?i)\bplease find more\b',
                r'(?i)\bplease review\b', r'(?i)find more details\b', r'(?i)identify domains\b'
            ]
            if any(re.search(pat, summary_text) for pat in disallowed_patterns):
                summary_text = None
            else:
                sentences = re.split(r'(?<=[.!?])\s+', summary_text)
                cleaned = []
                for s in sentences:
                    s = s.strip()
                    if not s:
                        continue
                    if s in cleaned:
                        continue
                    too_similar = False
                    for existing in cleaned:
                        sim = difflib.SequenceMatcher(None, normalize_text(s), normalize_text(existing)).ratio()
                        if sim >= 0.85:
                            too_similar = True
                            break
                    if too_similar:
                        continue
                    cleaned.append(s)
                if cleaned:
                    summary_text = " ".join(cleaned[:3]).strip()
                    if not summary_text.endswith((".", "!", "?")):
                        summary_text += "."
                else:
                    summary_text = None

            if summary_text:
                wc = len(summary_text.split())
                if wc < 15:
                    summary_text = None

        if not summary_text:
            products = {}
            orgs = {}
            attackers = {}
            cves_set = set()
            for txt in candidate_texts[:20]:
                try:
                    ext = extract_entities_and_threats(txt)
                    for p in ext.get('product', []):
                        products[p] = products.get(p, 0) + 1
                    for o in ext.get('organizations', []):
                        orgs[o] = orgs.get(o, 0) + 1
                    for a in ext.get('attackers', []):
                        attackers[a] = attackers.get(a, 0) + 1
                    for c in ext.get('cves', []):
                        cves_set.add(c)
                except Exception:
                    continue

            top_products = [p for p, _ in sorted(products.items(), key=lambda x: -x[1])][:3]
            top_orgs = [o for o, _ in sorted(orgs.items(), key=lambda x: -x[1])][:2]
            top_attackers = [a for a, _ in sorted(attackers.items(), key=lambda x: -x[1])][:2]
            cves = sorted(list(cves_set))

            joined = corpus.lower()
            if any(k in joined for k in ('critical vulnerability', 'critical severity', 'critical')):
                impact = 'critical'
            elif any(k in joined for k in ('high severity', 'high-severity', 'high severity')):
                impact = 'high'
            elif any(k in joined for k in ('actively exploited', 'known exploited', 'being exploited', 'exploit')):
                impact = 'actively exploited'
            else:
                impact = None

            sentences = []
            if top_products:
                prod_str = ", ".join(top_products)
                s = f"{trendy_word.name}: {prod_str} affected"
                if impact:
                    s += f" — {impact} impact"
                s += "."
                sentences.append(s)
            elif top_orgs:
                sentences.append(f"{trendy_word.name}: reports reference {', '.join(top_orgs)}.")
            else:
                sentences.append(f"{trendy_word.name}: multiple sources report a cybersecurity issue.")

            if cves:
                sentences.append("CVEs: " + ", ".join(cves[:3]) + ".")

            fallback_summary = " ".join(sentences[:3])
            fallback_summary = re.sub(r'\s+', ' ', fallback_summary).strip()
            if not fallback_summary.endswith((".", "!", "?")):
                fallback_summary += "."

            if len(fallback_summary.split()) < 8:
                logger.error(f"Deterministic fallback summary too short for '{trendy_word.name}'")
                return None
            summary_text = fallback_summary

        cves_final = sorted(list(extract_and_normalize_cves(summary_text)))

        summary_obj = Summary.objects.create(
            type='breaking_news',
            keywords=trendy_word.name,
            summary_text=summary_text
        )

        payload = {
            'keyword': trendy_word.name,
            'occurrences': getattr(trendy_word, 'occurrences', None),
            'summary_text': summary_text,
        }
        if cves_final:
            payload['cves'] = cves_final

        try:
            send_threats_watcher_notifications(payload)
        except Exception:
            logger.exception("Failed sending breaking news notifications")

        wc = len(summary_text.split())
        logger.info(f"Breaking news sent for '{trendy_word.name}' (id={summary_obj.id}, {wc} words, {len(cves_final)} CVEs)")
        return summary_obj

    except Exception as e:
        logger.error(f"Breaking news generation failed for '{trendy_word.name}': {e}", exc_info=True)
        return None


def generate_trendy_word_summary(trendy_word_id):
    """Generate AI summary for a specific TrendyWord."""
    logger.info(f"Generating summary for TrendyWord ID: {trendy_word_id}")

    summarizer = get_summarizer_pipeline()
    tokenizer = get_summarizer_tokenizer()
    if not summarizer or not tokenizer:
        logger.error("Summarizer or tokenizer unavailable")
        return None

    try:
        trendy_word = TrendyWord.objects.get(id=trendy_word_id)
    except TrendyWord.DoesNotExist:
        logger.error(f"TrendyWord not found: {trendy_word_id}")
        return None

    try:
        posturls_qs = trendy_word.posturls.all().order_by('-created_at')[:15]
        posturls = list(posturls_qs)

        if not posturls:
            return None

        raw_texts = []
        for posturl_obj in posturls:
            try:
                txt = get_article_title_or_summary(posturl_obj)
                if not txt:
                    continue
                txt = clean_text_and_metadata(txt)
                if txt and len(txt.strip()) >= 30:
                    raw_texts.append(txt.strip())
            except Exception:
                continue

        if not raw_texts:
            logger.info(f"No valid content for '{trendy_word.name}'")
            return None

        unique_texts = deduplicate_titles(raw_texts)
        corpus = "\n\n".join(unique_texts[:12]).strip()

        if len(corpus) < 40:
            logger.info(f"Corpus too small for '{trendy_word.name}' (len={len(corpus)})")
            return None

        # Generate summary
        try:
            input_tokens = len(tokenizer.encode(corpus))
        except Exception:
            input_tokens = len(corpus.split())
        
        max_len = min(150, max(80, input_tokens // 2))
        min_len = max(40, max_len // 2)

        try:
            result = summarizer(corpus, max_length=max_len, min_length=min_len, truncation=True, do_sample=False)
        except Exception as e:
            logger.error(f"Summarizer failed for '{trendy_word.name}': {e}")
            result = None

        summary_raw = None
        if result:
            if isinstance(result, list) and result:
                first = result[0]
                if isinstance(first, dict):
                    for key in ('summary_text', 'generated_text', 'text', 'content'):
                        val = first.get(key)
                        if val and isinstance(val, str) and val.strip():
                            summary_raw = val.strip()
                            break
                elif isinstance(first, str) and first.strip():
                    summary_raw = first.strip()
            elif isinstance(result, dict):
                for key in ('summary_text', 'generated_text', 'text', 'content'):
                    val = result.get(key)
                    if val and isinstance(val, str) and val.strip():
                        summary_raw = val.strip()
                        break
            elif isinstance(result, str) and result.strip():
                summary_raw = result.strip()

        if not summary_raw:
            try:
                model, model_tokenizer = get_summarizer_model()
                if model and model_tokenizer:
                    import torch
                    with torch.no_grad():
                        inputs = model_tokenizer(corpus, truncation=True, max_length=450, return_tensors="pt")
                        gen_kwargs = {
                            "max_new_tokens": 120,
                            "min_new_tokens": 40,
                            "num_beams": 4,
                            "no_repeat_ngram_size": 3,
                            "early_stopping": True,
                            "do_sample": False,
                            "length_penalty": 0.9,
                        }
                        try:
                            outputs = model.generate(input_ids=inputs["input_ids"], attention_mask=inputs.get("attention_mask"), **gen_kwargs)
                        except RuntimeError as e:
                            if "out of memory" in str(e).lower():
                                try:
                                    import torch as _torch
                                    _torch.cuda.empty_cache()
                                except Exception:
                                    pass
                                gen_kwargs["max_new_tokens"] = 80
                                gen_kwargs["num_beams"] = 2
                                outputs = model.generate(input_ids=inputs["input_ids"], attention_mask=inputs.get("attention_mask"), **gen_kwargs)
                            else:
                                raise
                        summary_raw = model_tokenizer.decode(outputs[0], skip_special_tokens=True, clean_up_tokenization_spaces=True).strip()
            except Exception as e:
                logger.error(f"Model.generate fallback failed for '{trendy_word.name}': {e}")
                return None

        if not summary_raw or not summary_raw.strip():
            logger.error(f"Empty summary after all attempts for '{trendy_word.name}'")
            return None

        summary_text = clean_text_and_metadata(summary_raw.strip())
        summary_text = re.sub(r'\s+', ' ', summary_text).strip()
        
        if not summary_text.endswith((".", "!", "?")):
            summary_text += "."

        if len(summary_text.split()) < 15:
            return None

        entities = {
            'products': set(),
            'cves': set(),
            'organizations': set(),
            'attackers': set()
        }

        for title in unique_texts:
            try:
                extracted = extract_entities_and_threats(title)
                entities['products'].update(extracted.get('product', []))
                entities['organizations'].update(extracted.get('organizations', []))
                entities['attackers'].update(extracted.get('attackers', []))
                entities['cves'].update(extracted.get('cves', []))
            except Exception:
                continue

        entities['cves'].update(extract_and_normalize_cves(summary_text))

        # Build final summary
        summary_lines = [summary_text, ""]
        if entities['products']:
            summary_lines.append("Products: " + ", ".join(sorted(list(entities['products']))[:3]))
        if entities['cves']:
            cves = sorted(list(entities['cves']))
            cve_links = [f"{cve} (https://nvd.nist.gov/vuln/detail/{cve})" for cve in cves]
            summary_lines.append("CVEs: " + " | ".join(cve_links))
        if entities['attackers']:
            summary_lines.append("Threat actors: " + ", ".join(sorted(list(entities['attackers']))[:2]))
        if entities['organizations']:
            summary_lines.append("Organizations: " + ", ".join(sorted(list(entities['organizations']))[:3]))

        final_summary = "\n".join([line for line in summary_lines if line]).strip()

        summary_obj, created = Summary.objects.update_or_create(
            type='trendy_word_summary',
            keywords=trendy_word.name,
            defaults={'summary_text': final_summary}
        )
        
        logger.info(f"Summary {'created' if created else 'updated'} for '{trendy_word.name}' (id={summary_obj.id}, {len(summary_text.split())} words)")
        return summary_obj

    except Exception as e:
        logger.error(f"Summary generation failed for '{trendy_word.name}': {e}", exc_info=True)
        return None