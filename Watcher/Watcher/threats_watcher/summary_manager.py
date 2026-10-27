import logging
import re
import difflib
import json
from typing import List, Set
from datetime import timedelta
from llm_gateway.router import LLMRouter

from django.utils import timezone
from django.conf import settings

from .models import TrendyWord, PostUrl, Summary
from .model_manager import (
    get_ner_pipeline,
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


def generate_weekly_summary(notify=True):
    """Generate and send weekly threat summary (top-5 trending topics)."""
    logger.info("Starting weekly summary generation with Multi-LLM clustering")

    try:
        from .core import send_threats_watcher_notifications

        cutoff = timezone.now() - timedelta(days=30)
        trendywords_qs = TrendyWord.objects.all().order_by('-created_at')[:7]
        
        weekly_context = []
        keywords_used = []
        
        for tw in trendywords_qs:
            posturls = list(tw.posturls.filter(created_at__gte=cutoff).order_by('-created_at')[:10])
            if not posturls:
                continue
            
            raw_titles = []
            for pu in posturls:
                try:
                    txt = get_article_title_or_summary(pu)
                    if txt:
                        cleaned = clean_text_and_metadata(txt)
                        if len(cleaned) > 30:
                            raw_titles.append(cleaned)
                except Exception:
                    continue
            
            if raw_titles:
                oldest_date = min(pu.created_at for pu in posturls)
                formatted_date = oldest_date.strftime("%b %d, %Y")

                unique = deduplicate_titles(raw_titles)[:5]
                weekly_context.append(f"Topic '{tw.name}' (First seen: {formatted_date}):\n" + "\n".join(f"- {t}" for t in unique))
                keywords_used.append(tw.name)

        if not weekly_context:
            logger.info("No valid data for weekly summary")
            return

        full_corpus = "\n\n".join(weekly_context)
        summary_text = None
        used_model = "Unknown"

        org_name = getattr(settings, 'ORGANIZATION_NAME', 'the organization')
        context = getattr(settings, 'THREATS_WATCHER_CONTEXT', 'global technology and cybersecurity')

        prompt = f"""You are a Lead Cyber Threat Intelligence Analyst for {org_name} (key sectors: {context}).
        Review the following trending cybersecurity topics and news from the past week.
        Group them into logical threat clusters (e.g., 'Ransomware Operations', 'Critical Vulnerabilities').

        You MUST respond ONLY with a valid JSON object matching this exact structure:
        {{
            "executive_summary": "A concise 2-sentence high-level overview of the week's major threats.",
            "clusters": [
                {{
                    "theme": "Cluster Name",
                    "date": "Use the 'First seen' date provided next to the Topic name. If merging multiple topics, use the oldest date.",
                    "severity": "Critical, High, Medium, or Low",
                    "summary": "Detailed actionable summary of this cluster in a single clear paragraph.",
                    "cves": ["CVE-XXXX-XXXX"],
                    "actors_or_malware": ["APT29", "LockBit"]
                }}
            ]
        }}

        Weekly News Context:
        {full_corpus[:6000]}
        """
        try:
            from llm_gateway.router import LLMRouter
            router = LLMRouter()
            llm_response = router.generate_text(prompt=prompt)
            
            if llm_response:
                json_match = re.search(r'\{.*\}', llm_response, re.DOTALL)
                
                if json_match:
                    data = json.loads(json_match.group(0))
                    lines = []
                    
                    exec_sum = data.get('executive_summary', '')
                    lines.append("<div style='border-left: 3px solid #64748b; padding-left: 0.8em; margin-bottom: 24px;'>")
                    
                    lines.append("<div class='d-flex justify-content-between align-items-center' style='margin-bottom: 1em;'>")
                    lines.append("<strong class='text-info text-uppercase' style='font-size: 0.85em; letter-spacing: 0.05em;'>Executive Summary</strong>")
                    lines.append("<span id='watcher-toggle-all' class='text-muted border rounded px-2 py-1' style='font-size: 0.75em; cursor: pointer; user-select: none; transition: background 0.2s;'>Collapse All</span>")
                    lines.append("</div>")
                    
                    lines.append(f"<p class='mt-1 mb-0 text-body' style='line-height: 1.4; font-size: 0.9em;'>{exec_sum}</p>")
                    lines.append("</div>")
                    
                    clusters = data.get('clusters', [])
                    for i, cluster in enumerate(clusters):
                        theme = cluster.get('theme', 'Threat Cluster')
                        severity = cluster.get('severity', 'Medium')
                        event_date = cluster.get('date', 'This Week')
                        summary_info = cluster.get('summary', '')
                        raw_date = cluster.get('date', '')
                        event_date = str(raw_date).strip().strip('"').strip("'") if raw_date else ""
                        
                        if event_date.lower() in ['none', 'n/a', 'null', 'this week', 'unknown', '']:
                            event_date = ""
                        
                        sev_upper = severity.upper()
                        if 'CRITICAL' in sev_upper:
                            color = "#ef4444"
                        elif 'HIGH' in sev_upper:
                            color = "#eab308"
                        elif 'MEDIUM' in sev_upper:
                            color = "#38bdf8"
                        else:
                            color = "#94a3b8"
                            
                        lines.append(f"<details open class='watcher-cluster' style='border-left: 3px solid {color}; padding-left: 0.8em; margin-bottom: 1.5em;'>")
                        
                        lines.append("<summary class='d-flex justify-content-between align-items-center mb-3' style='cursor: pointer; outline: none; user-select: none;'>")
                        
                        lines.append(f"<div class='d-flex align-items-center'><span class='material-icons cluster-arrow' style='font-size: 1.2em; color: {color}; margin-right: 0.25em; margin-left: -0.25em; transition: transform 0.2s;'>arrow_drop_down</span><strong class='m-0 text-body' style='font-size: 0.95em;'>{theme}</strong></div>")
                        
                        lines.append(f"<div class='d-flex align-items-center gap-2'>")
                        if event_date:
                            lines.append(f"<span class='text-muted fst-italic' style='font-size: 0.75em;'>{event_date}</span>")
                        lines.append(f"<span class='badge' style='font-size: 0.75em; padding: 0.15em 0.6em; color: {color}; border: 1px solid {color}60; background: transparent;'>{severity}</span>")
                        lines.append("</div>")
                        lines.append("</summary>")
                        
                        lines.append(f"<p class='mb-3 text-body' style='font-size: 0.9em; line-height: 1.4;'>{summary_info}</p>")
                        
                        meta_lines = []
                        threats = [t for t in cluster.get('actors_or_malware', []) if t and str(t).strip().lower() != 'none']
                        if threats:
                            meta_lines.append(f"<div class='m-0'><strong class='text-muted'>Threats:</strong> <span class='badge bg-danger text-white'>{', '.join(threats)}</span></div>")
                        
                        cves = [c for c in cluster.get('cves', []) if c and str(c).strip().lower() != 'none']
                        if cves:
                            cve_links = [f"<a href='https://nvd.nist.gov/vuln/detail/{c}' target='_blank' class='text-info text-decoration-underline'>{c}</a>" for c in cves]
                            meta_lines.append(f"<div class='m-0'><strong class='text-muted'>CVEs:</strong> {' | '.join(cve_links)}</div>")
                            
                        if meta_lines:
                            lines.append(f"<div class='d-flex flex-column mt-2 mb-0' style='gap: 0.3em; font-size: 0.85em;'>{''.join(meta_lines)}</div>")
                        
                        lines.append("</details>")
                        
                    summary_text = "\n".join(lines).strip()
                    used_model = getattr(router, 'model_used', 'Primary LLM Router')
                    logger.info("Weekly summary successfully generated via LLM clustering.")
                else:
                    logger.warning("No valid JSON found in the LLM response for the weekly summary.")
                    summary_text = None
        except Exception as e:
            logger.error(f"Failed to process Weekly LLM JSON: {e}")
            summary_text = None

        if not summary_text:
            logger.warning("LLM clustering failed. Falling back to local PyTorch CausalLM engine for weekly summary.")
            
            model, model_tokenizer = get_summarizer_model()
            if model and model_tokenizer:
                import torch
                try:
                    fallback_prompt = f"Summarize the top 3 cybersecurity threats from the news below.\n\nNews:\n{full_corpus[:3000]}"
                    
                    messages = [
                        {
                            "role": "system", 
                            "content": "You are a CTI analyst. Output exactly 3 bullet points starting with '•'. Each bullet must be a full sentence (15-30 words) explaining the vendor, the vulnerability, and the impact."
                        },
                        {
                            "role": "user",
                            "content": "Summarize the top 3 cybersecurity threats from the news below.\n\nNews:\nAcmeCorp routers have a critical SQL injection flaw leading to data theft. BetaTech firewalls are vulnerable to DoS attacks causing network crashes. GammaSoft VPNs have an auth bypass allowing remote access."
                        },
                        {
                            "role": "assistant",
                            "content": "• AcmeCorp has disclosed a critical SQL injection vulnerability in their routing software that allows attackers to steal sensitive data.\n• BetaTech firewalls are currently vulnerable to Denial of Service (DoS) attacks, which can cause severe network crashes and downtime.\n• GammaSoft VPN gateways contain an authentication bypass flaw that enables unauthorized users to gain remote access to internal networks."
                        },
                        {
                            "role": "user", 
                            "content": fallback_prompt
                        }
                    ]
                    
                    chat_prompt = model_tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
                    inputs = model_tokenizer(chat_prompt, return_tensors="pt", truncation=True, max_length=2048)
                    
                    logger.info("Starting safe local Qwen-Instruct inference for weekly summary...")
                    
                    with torch.no_grad():
                        outputs = model.generate(
                            inputs["input_ids"], 
                            max_new_tokens=250, 
                            do_sample=False, 
                            repetition_penalty=1.15
                        )
                    
                    input_length = inputs["input_ids"].shape[1]
                    res_raw = model_tokenizer.decode(outputs[0][input_length:], skip_special_tokens=True).strip()
                    
                    if res_raw and not res_raw.endswith(('.', '!', '?')):
                        last_dot = max(res_raw.rfind('.'), res_raw.rfind('!'), res_raw.rfind('?'))
                        if last_dot != -1:
                            res_raw = res_raw[:last_dot + 1]
                            
                    logger.info("Local Qwen weekly inference finished successfully.")
                    
                    fallback_lines = []
                    valid_bullets_count = 0
                    
                    for line in res_raw.split('\n'):
                        line = line.strip()
                        if not line or len(line) < 15:
                            continue
                            
                        if line.startswith('**') and line.endswith('**'):
                            continue
                        if re.match(r'^\d+\.\s*\*\*', line):
                            continue
                            
                        line = re.sub(r'^([•\-\*]+|\d+\.)\s*\*?\*?', '', line).strip()
                        line = re.sub(r'^[A-Za-z0-9\s]+:\s*', '', line)
                        line = line.replace('**', '')
                    
                        fallback_lines.append(f"<div class='mb-2'>• {line}</div>")
                        valid_bullets_count += 1
                        if valid_bullets_count >= 3:
                            break
                    if len(fallback_lines) > 1:
                        summary_text = "".join(fallback_lines).strip()
                        if model and hasattr(model, 'config') and hasattr(model.config, '_name_or_path'):
                            model_path = model.config._name_or_path
                            used_model = f"local/{model_path.split('/')[-1]}"
                        else:
                            used_model = getattr(settings, "HF_LOCAL_MODEL", "Local CausalLM Fallback")
                        
                except Exception as e:
                    logger.error(f"Local CausalLM weekly summary generation failed safely: {e}")
                    summary_text = f"<div class='text-danger fw-bold mb-2'>Weekly Threat Fallback Report:</div><div>• Generation skipped due to local resource limits.</div>"
                    used_model = "Local Fallback (Error)"

        if summary_text:
            summary_obj = Summary.objects.create(
                type='weekly_summary',
                keywords=', '.join(keywords_used),
                summary_text=summary_text,
                ai_model=used_model
            )

            if notify:
                send_threats_watcher_notifications({
                    'notification_type': 'weeklysummary',
                    'summary_text': summary_text,
                })
                logger.info("Weekly summary notifications sent")
            else:
                logger.info("Weekly summary regenerated manually, notifications skipped")
        else:
            logger.error("All generation methods failed for Weekly Summary.")

    except Exception as e:
        logger.error(f"Weekly summary generation failed: {e}", exc_info=True)
        if notify:
            try:
                from .core import send_threats_watcher_notifications
                send_threats_watcher_notifications({
                    'notification_type': 'weeklysummary',
                    'summary_text': "Weekly threat analysis failed due to technical issue.",
                })
            except Exception:
                pass

def analyze_threat_with_llm(keyword: str, corpus: str) -> dict:
    """
    Uses LiteLLM to extract the summary, enriched entities, and the alert score in a single pass.
    Returns a dictionary (JSON) or None on failure.
    """
    org_name = getattr(settings, 'ORGANIZATION_NAME', 'the organization')
    context = getattr(settings, 'THREATS_WATCHER_CONTEXT', 'global technology and cybersecurity')
    
    full_prompt = f"""You are an elite Cyber Threat Intelligence (CTI) analyst working for {org_name} (key sectors: {context}).
Analyze the following cybersecurity news corpus about '{keyword}'.

You MUST respond ONLY with a valid JSON object (no markdown, no extra text) matching exactly this structure:
{{
    "summary": "A 3-sentence actionable summary covering the threat, impact, and affected products/sectors.",
    "impact_level": "Critical, High, Medium, or Low",
    "alert_score": <int 1-10>,
    "justification": "Brief explanation of the score based on relevance to {org_name} sectors.",
    "entities": {{
        "cves": ["Extract only real CVE identifiers (format: CVE-YYYY-NNNNN) explicitly present in the text. If none exist, output exactly [\"None\"]."],
        "apts_or_actors": ["List of threat actors explicitly mentioned. If NONE are found, return exactly [\"None\"]. DO NOT deduce or guess based on the target."],
        "malwares": ["List of malwares. If none, return [\"None\"]"],
        "mitre_ttps": ["List of MITRE techniques. If none, return [\"None\"]"],
        "targeted_sectors": ["List of targeted industries"],
        "targeted_countries": ["List of targeted countries. If none, return [\"None\"]"]
    }}
}}

News Corpus:
{corpus[:4000]}
"""

    try:
        from llm_gateway.router import LLMRouter
        router = LLMRouter()
        response_text = router.generate_text(prompt=full_prompt)
        
        # Security: If router returns None (fallback delegation), exit cleanly
        if not response_text:
            return None
        
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            parsed_data = json.loads(json_match.group(0))
            parsed_data["model_used"] = getattr(router, "model_used", "Primary LLM Router")
            return parsed_data
        return None

    except Exception as e:
        logger.error(f"LLM analysis failed for '{keyword}': {e}")
        return None

def generate_breaking_news(trendy_word, notify=True):
    """Generate a breaking-news style alert for a TrendyWord using multi-LLM abstraction with local fallback."""
    logger.info(f"Generating breaking news for '{trendy_word.name}' ({getattr(trendy_word, 'occurrences', 'n/a')} occurrences)")
    tokenizer = get_summarizer_tokenizer()

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

        llm_result = analyze_threat_with_llm(trendy_word.name, corpus)
        
        if llm_result and isinstance(llm_result, dict) and "summary" in llm_result:
            logger.info(f"Breaking news successfully generated via LLM router for '{trendy_word.name}'")
            
            raw_summary = llm_result["summary"]
            entities_data = llm_result.get("entities", {})
            
            raw_cves = entities_data.get("cves", [])
            valid_cves = []
            for c in raw_cves:
                c_str = str(c).strip().upper()
                match = re.search(r'CVE-\d{4}-\d{4,7}', c_str)
                if match:
                    valid_cves.append(match.group(0))
            cves_final = sorted(list(dict.fromkeys(valid_cves)))

            def get_valid(key):
                items = entities_data.get(key, [])
                if isinstance(items, str): items = [items]
                return [str(x).strip() for x in items if x and str(x).strip().lower() != 'none']

            sectors = get_valid('targeted_sectors')
            actors = get_valid('apts_or_actors')
            malwares = get_valid('malwares')
            impact = llm_result.get('impact_level', 'Unknown')
            recommendations = llm_result.get('recommendations', '')

            html_lines = [f"<p class='mb-3 text-body' style='line-height: 1.5;'>{raw_summary}</p>"]
            meta_lines = []
            
            if impact and impact.lower() != 'unknown':
                impact_color = "bg-danger" if "critical" in impact.lower() or "high" in impact.lower() else "bg-warning text-dark"
                meta_lines.append(f"<div><strong class='text-muted'>Impact Level:</strong> <span class='badge {impact_color}'>{impact.capitalize()}</span></div>")

            if recommendations and str(recommendations).strip().lower() != 'none':
                meta_lines.append(f"<div><strong class='text-muted'>Recommendations:</strong> <span class='text-success fw-bold'>{recommendations}</span></div>")
                
            if sectors:
                meta_lines.append(f"<div><strong class='text-muted'>Targeted Sectors:</strong> <span class='fw-bold'>{', '.join(sectors[:3])}</span></div>")
                
            if actors:
                meta_lines.append(f"<div><strong class='text-muted'>Threat Actors:</strong> <span class='badge bg-secondary'>{', '.join(actors[:3])}</span></div>")
            
            if malwares:
                meta_lines.append(f"<div><strong class='text-muted'>Malware/TTPs:</strong> <span class='text-danger fw-bold'>{', '.join(malwares[:3])}</span></div>")
                
            if cves_final:
                cve_links = [f"<a href='https://nvd.nist.gov/vuln/detail/{c}' target='_blank' class='fw-bold' style='color: #0d6efd; text-decoration: underline;'>{c}</a>" for c in cves_final]
                meta_lines.append(f"<div><strong class='text-muted'>CVEs:</strong> {' | '.join(cve_links)}</div>")

            if meta_lines:
                html_lines.append(f"<div class='mt-3 p-3 rounded' style='background: rgba(128,128,128,0.15); border: 1px solid rgba(128,128,128,0.2);'><h6 class='text-uppercase text-muted mb-2' style='font-size: 0.75em; letter-spacing: 0.05em;'>Threat Context :</h6><div class='d-flex flex-column' style='gap: 0.4em; font-size: 0.85em;'>{''.join(meta_lines)}</div></div>")

            summary_text = "".join(html_lines)

            used_model = llm_result.get("model_used", "Primary LLM Router")
            
            summary_obj = Summary.objects.create(
                type='breaking_news',
                keywords=trendy_word.name,
                summary_text=summary_text,
                ai_model=used_model
            )

            payload = {
                'notification_type': 'breakingnews',
                'keyword': trendy_word.name,
                'occurrences': getattr(trendy_word, 'occurrences', None),
                'summary_text': summary_text,
                'alert_score': llm_result.get("alert_score"),
                'justification': llm_result.get("justification"),
                'impact_level': llm_result.get("impact_level"),
            }
            if cves_final:
                payload['cves'] = cves_final

            if notify:
                try:
                    send_threats_watcher_notifications(payload)
                except Exception:
                    logger.exception("Failed sending breaking news notifications")
            else:
                logger.info(f"Breaking news for '{trendy_word.name}' regenerated manually, notifications skipped")

            wc = len(summary_text.split())
            logger.info(f"LLM Breaking news sent for '{trendy_word.name}' (id={summary_obj.id}, {wc} words, score={llm_result.get('alert_score')})")
            return summary_obj

        logger.info(f"LLM router unavailable or failed, falling back to local pipeline for '{trendy_word.name}'")

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

        summary_raw = None

        if not summary_raw:
            try:
                model, model_tokenizer = get_summarizer_model()
                if model and model_tokenizer:
                    import torch
                    with torch.no_grad():
                        # Enforce strict system instructions for concise breaking news output
                        messages = [
                            {"role": "system", "content": "You are a Cyber Threat Intelligence analyst. Provide a single short paragraph (1-3 sentences) summarizing the news factually. Do not add commentary or introductory phrases."},
                            {"role": "user", "content": full_input}
                        ]
                        chat_prompt = model_tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
                        inputs = model_tokenizer(chat_prompt, return_tensors="pt", truncation=True, max_length=2048)
                        
                        # Generate the fallback summary using greedy decoding
                        outputs = model.generate(
                            inputs["input_ids"], 
                            max_new_tokens=120, 
                            do_sample=False,
                            repetition_penalty=1.1
                        )
                        
                        # Isolate the newly generated tokens
                        input_length = inputs["input_ids"].shape[1]
                        summary_raw = model_tokenizer.decode(outputs[0][input_length:], skip_special_tokens=True, clean_up_tokenization_spaces=True).strip()
            except Exception as e:
                logger.warning(f"Local CausalLM fallback generation failed for '{trendy_word.name}': {e}")
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
                    s += f" - {impact} impact"
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

        summary_text_raw = summary_text
        cves_final = sorted(list(extract_and_normalize_cves(summary_text_raw)))
        
        fallback_html_lines = []
        fallback_html_lines.append(f"<p class='mb-3 text-body' style='line-height: 1.5;'>{summary_text_raw}</p>")
        
        meta_lines = []
        current_impact = locals().get('impact', None)
        if current_impact:
            impact_color = "bg-danger" if current_impact in ['critical', 'high', 'actively exploited'] else "bg-warning text-dark"
            meta_lines.append(f"<div><strong class='text-muted'>Estimated Impact: <span class='badge {impact_color}'>{current_impact.capitalize()}</span></strong></div>")
        
        current_orgs = locals().get('top_orgs', [])
        if current_orgs:
            meta_lines.append(f"<div><strong class='text-muted'>Targeted Entities: <span class='text-info'>{', '.join(current_orgs[:3])}</span></strong></div>")
        current_attackers = locals().get('top_attackers', [])
        if current_attackers:
            meta_lines.append(f"<div><strong class='text-muted'>Suspected Actors: <span class='badge bg-dark border border-secondary'>{', '.join(current_attackers[:3])}</span></strong></div>")

        if cves_final:
            cve_links = [f"<a href='https://nvd.nist.gov/vuln/detail/{c}' target='_blank' class='text-info text-decoration-underline'>{c}</a>" for c in cves_final]
            meta_lines.append(f"<div><strong class='text-muted'>CVEs: {' | '.join(cve_links)}</strong></div>")
            
        if meta_lines:
            fallback_html_lines.append(f"<div class='mt-3 p-3 rounded' style='background: rgba(128, 128, 128, 0.15); border: 1px solid rgba(128, 128, 128, 0.2);'><h6 class='text-uppercase text-muted mb-2' style='font-size: 0.75em; letter-spacing: 0.05em;'>Extracted Indicators</h6><div class='d-flex flex-column' style='gap: 0.4em; font-size: 0.85em;'>{''.join(meta_lines)}</div></div>")

        summary_text = "".join(fallback_html_lines)

        if model and hasattr(model, 'config') and hasattr(model.config, '_name_or_path'):
            model_path = model.config._name_or_path
            used_model = f"local/{model_path.split('/')[-1]}"
        else:
            used_model = getattr(settings, "HF_LOCAL_MODEL", "Local AI Model")

        summary_obj = Summary.objects.create(
            type='breaking_news',
            keywords=trendy_word.name,
            summary_text=summary_text,
            ai_model=used_model
        )

        payload = {
            'notification_type': 'breakingnews',
            'keyword': trendy_word.name,
            'occurrences': getattr(trendy_word, 'occurrences', None),
            'summary_text': summary_text,
        }
        if cves_final:
            payload['cves'] = cves_final

        if notify:
            try:
                send_threats_watcher_notifications(payload)
            except Exception:
                logger.exception("Failed sending breaking news notifications")
        else:
            logger.info(f"Breaking news for '{trendy_word.name}' regenerated manually, notifications skipped")

        wc = len(summary_text.split())
        logger.info(f"Breaking news sent for '{trendy_word.name}' (id={summary_obj.id}, {wc} words, {len(cves_final)} CVEs)")
        return summary_obj

    except Exception as e:
        logger.error(f"Breaking news generation failed for '{trendy_word.name}': {e}", exc_info=True)
        return None


def _generate_summary_for_keyword_posts(keyword: str, posturls: list):
    """Generate AI summary for a keyword using Multi-LLM abstraction with local fallback."""
    logger.info(f"Generating summary for keyword '{keyword}' via Multi-LLM pipeline")

    try:
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
            logger.info(f"No valid content for '{keyword}'")
            return None

        unique_texts = deduplicate_titles(raw_texts)
        corpus = "\n\n".join(unique_texts[:12]).strip()

        if len(corpus) < 40:
            logger.info(f"Corpus too small for '{keyword}' (len={len(corpus)})")
            return None

        llm_result = analyze_threat_with_llm(keyword, corpus)
        
        if llm_result and isinstance(llm_result, dict) and "summary" in llm_result:
            logger.info(f"Summary successfully generated via LLM router for '{keyword}'")

            used_model = llm_result.get("model_used", "Primary LLM Router")
            summary_text = llm_result["summary"]
            summary_text = summary_text.replace("—", ", ")
            summary_text = summary_text.replace("–", "-")
            summary_text = summary_text.replace(" ,", ",")
            entities_data = llm_result.get("entities", {})
            
            summary_lines = [f"<p class='mb-2 text-body' style='line-height: 1.4;'>{summary_text}</p>"]
            
            meta_lines = []
            def get_valid_entities(key):
                items = entities_data.get(key) or []
                return [x for x in items if x and str(x).strip().lower() != 'none']

            valid_sectors = get_valid_entities('targeted_sectors')
            if valid_sectors:
                sectors_str = ", ".join(valid_sectors[:3])
                meta_lines.append(f"<div><strong class='text-muted'>Sectors:</strong> <span class='text-info'>{sectors_str}</span></div>")
                
            valid_malwares = get_valid_entities('malwares')
            if valid_malwares:
                malware_str = ", ".join(valid_malwares[:3])
                meta_lines.append(f"<div><strong class='text-muted'>Malware/Tools:</strong> <span class='text-warning'>{malware_str}</span></div>")
                
            valid_actors = get_valid_entities('apts_or_actors')
            if valid_actors:
                actors_str = ", ".join(valid_actors[:2])
                meta_lines.append(f"<div><strong class='text-muted'>Threat actors:</strong> <span style='color: #f87171; background-color: rgba(248, 113, 113, 0.15); padding: 1px 4px; border-radius: 3px; font-weight: 600;'>{actors_str}</span></div>")
                
            valid_mitre = get_valid_entities('mitre_ttps')
            if valid_mitre:
                mitre_str = ", ".join(valid_mitre[:2])
                meta_lines.append(f"<div><strong class='text-muted'>MITRE ATT&CK:</strong> <span class='badge bg-secondary'>{mitre_str}</span></div>")
                
            valid_cves = get_valid_entities('cves')
            if valid_cves:
                cves = sorted(list(set(valid_cves)))
                cve_links = [f"<a href='https://nvd.nist.gov/vuln/detail/{cve}' target='_blank' class='text-info text-decoration-underline'>{cve}</a>" for cve in cves]
                meta_lines.append(f"<div><strong class='text-muted'>CVEs:</strong> {' | '.join(cve_links)}</div>")
            
            if llm_result.get("alert_score"):
                score = llm_result['alert_score']
                impact = llm_result.get('impact_level', 'Unknown')
                score_badge = "bg-danger" if score >= 8 else ("bg-warning text-dark" if score >= 5 else "bg-info text-dark")
                
                org_name = getattr(settings, 'ORGANIZATION_NAME', 'Organization')
                display_name = f"{org_name.capitalize()} Alert Score" if org_name.lower() != 'the organization' else "Alert Score"
                
                score_inline = f"<strong class='text-muted'>{display_name}:</strong> <span class='badge {score_badge}'>{score}/10</span> <span class='text-muted ms-1' style='font-size: 0.9em;'>({impact} Impact)</span>"
                meta_lines.append(f"<div class='mt-1'>{score_inline}</div>")
                
            if llm_result.get("justification"):
                meta_lines.append(f"<div class='mt-1 text-muted' style='font-size: 0.85em; line-height: 1.3;'><strong>Justification:</strong> {llm_result['justification']}</div>")

            if meta_lines:
                summary_lines.append(f"<div class='mt-2 d-flex flex-column gap-1' style='font-size: 0.9em;'>{''.join(meta_lines)}</div>")

            final_summary = "\n".join([line for line in summary_lines if line]).strip()

            summary_obj, created = Summary.objects.update_or_create(
                type='trendy_word_summary',
                keywords=keyword,
                defaults={'summary_text': final_summary, 'ai_model': used_model}
            )

            logger.info(f"LLM Summary {'created' if created else 'updated'} for '{keyword}' (id={summary_obj.id})")
            return summary_obj

        logger.warning(f"LLM router unavailable/failed for '{keyword}', falling back to local PyTorch engine.")
        
        summary_raw = None

        if not summary_raw:
            try:
                model, model_tokenizer = get_summarizer_model()
                if model and model_tokenizer:
                    import torch
                    
                    fallback_prompt = (
                        f"Analyze the following cybersecurity news and extract the specific events related to the keyword '{keyword}'.\n"
                        f"Provide a concise, 3-sentence factual paragraph covering the threat, impact, and affected entities. "
                        f"Do not include introductory or concluding remarks.\n\n"
                        f"News:\n{corpus[:2000]}"
                    )
                    
                    with torch.no_grad():
                        messages = [
                            {
                                "role": "system", 
                                "content": "You are a strict Cyber Threat Intelligence parser. Output ONLY the factual summary paragraph. Never explain your reasoning, never use conversational filler."
                            },
                            {
                                "role": "user", 
                                "content": fallback_prompt
                            }
                        ]
                        
                        chat_prompt = model_tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
                        inputs = model_tokenizer(chat_prompt, return_tensors="pt", truncation=True, max_length=2048)
                        
                        logger.info(f"Starting Qwen2.5 local inference for keyword '{keyword}'...")
                        
                        outputs = model.generate(
                            inputs["input_ids"], 
                            max_new_tokens=150, 
                            do_sample=False,
                            repetition_penalty=1.15
                        )
                        
                        input_length = inputs["input_ids"].shape[1]
                        summary_raw = model_tokenizer.decode(outputs[0][input_length:], skip_special_tokens=True).strip()
                        
                        if summary_raw and not summary_raw.endswith(('.', '!', '?')):
                            last_dot = max(summary_raw.rfind('.'), summary_raw.rfind('!'), summary_raw.rfind('?'))
                            if last_dot != -1:
                                summary_raw = summary_raw[:last_dot + 1]
                                
                        logger.info(f"Local Qwen inference for '{keyword}' finished successfully.")
                        
            except Exception as e:
                logger.error(f"Local CausalLM fallback generation failed for '{keyword}': {e}")
                return None

        if not summary_raw or not summary_raw.strip():
            logger.error(f"Empty summary after all attempts for '{keyword}'")
            return None

        summary_text = clean_text_and_metadata(summary_raw.strip())
        
        summary_text = re.sub(r'^\*?\*?(Summary Paragraph|Summary|Key Facts|Here is a summary|Threat Summary)[*:\-\s]+', '', summary_text, flags=re.IGNORECASE).strip()
        
        summary_text = re.sub(r'\s+', ' ', summary_text).strip()

        if not summary_text.endswith((".", "!", "?")):
            summary_text += "."

        if len(summary_text.split()) < 10: 
            logger.error(f"Summary too short for '{keyword}'")
            return None

        entities = {'products': set(), 'cves': set(), 'organizations': set(), 'attackers': set()}
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

        summary_lines = [f"<p class='mb-2 text-body' style='line-height: 1.4;'>{summary_text}</p>"]
        meta_lines = []
        
        if entities['products']:
            products_str = ", ".join(sorted(list(entities['products']))[:3])
            meta_lines.append(f"<div><strong class='text-muted'>Products:</strong> <span class='text-info'>{products_str}</span></div>")
            
        if entities['attackers']:
            actors_str = ", ".join(sorted(list(entities['attackers']))[:2])
            meta_lines.append(f"<div><strong class='text-muted'>Threat actors:</strong> <span class='badge bg-danger'>{actors_str}</span></div>")
            
        if entities['cves']:
            cves = sorted(list(entities['cves']))
            cve_links = []
            for cve in cves:
                if cve.lower() == 'none':
                    cve_links.append("<span class='text-muted'>None</span>")
                else:
                    cve_links.append(f"<a href='https://nvd.nist.gov/vuln/detail/{cve}' target='_blank' class='text-info' style='text-decoration: underline;'>{cve}</a>")
            meta_lines.append(f"<div><strong class='text-muted'>CVEs:</strong> {' | '.join(cve_links)}</div>")
            
        if entities['organizations']:
            orgs_str = ", ".join(sorted(list(entities['organizations']))[:3])
            meta_lines.append(f"<div><strong class='text-muted'>Organizations:</strong> <span class='text-info'>{orgs_str}</span></div>")

        if meta_lines:
            summary_lines.append(f"<div class='mt-2 d-flex flex-column gap-1' style='font-size: 0.9em;'>{''.join(meta_lines)}</div>")

        final_summary = "\n".join([line for line in summary_lines if line]).strip()

        if model and hasattr(model, 'config') and hasattr(model.config, '_name_or_path'):
            model_path = model.config._name_or_path
            used_model = f"local/{model_path.split('/')[-1]}"
        else:
            used_model = getattr(settings, "HF_LOCAL_MODEL", "Local AI Model")

        summary_obj, created = Summary.objects.update_or_create(
            type='trendy_word_summary',
            keywords=keyword,
            defaults={'summary_text': final_summary, 'ai_model': used_model}
        )

        logger.info(f"Fallback Summary {'created' if created else 'updated'} for '{keyword}' (id={summary_obj.id})")
        return summary_obj

    except Exception as e:
        logger.error(f"Summary generation failed for '{keyword}': {e}", exc_info=True)
        return None


def generate_keyword_summary_from_posturls(keyword: str, posturls: list):
    """Generate/update keyword summary from a list of PostUrl objects."""
    return _generate_summary_for_keyword_posts(keyword, posturls)


def generate_trendy_word_summary(trendy_word_id):
    """Generate AI summary for a specific TrendyWord."""
    logger.info(f"Generating summary for TrendyWord ID: {trendy_word_id}")

    try:
        trendy_word = TrendyWord.objects.get(id=trendy_word_id)
    except TrendyWord.DoesNotExist:
        logger.error(f"TrendyWord not found: {trendy_word_id}")
        return None

    posturls = list(trendy_word.posturls.all().order_by('-created_at')[:15])
    return _generate_summary_for_keyword_posts(trendy_word.name, posturls)