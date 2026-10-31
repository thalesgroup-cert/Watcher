# coding=utf-8
import logging
from .models import BannedWord, Source, TrendyWord, PostUrl, Summary, Subscriber, MonitoredKeyword, KeywordHit
from django.utils import timezone
from django.conf import settings
from datetime import timedelta
from datetime import datetime
import calendar
from apscheduler.schedulers.background import BackgroundScheduler
import tzlocal
import feedparser
import requests
import re
from django.db import close_old_connections
from common.core import send_app_specific_notifications
from urllib.parse import urlparse
from .model_manager import get_ner_pipeline

# Import summary generation functions
from .summary_manager import (
    generate_weekly_summary,
    generate_breaking_news,
    generate_trendy_word_summary
)
from types import SimpleNamespace
import functools
import hashlib
import unicodedata
import html
import common.utils.job_log as job_log

# Configure logger
logger = logging.getLogger('watcher.threats_watcher')

# Group of hackers
ATTACKER_PATTERNS = [
    r"\bAPT\d+\b",
    r"\bFIN\d+\b",
    r"\bHFG\d+\b",
]

HEADERS = {
    'User-Agent': (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9"
}

def extract_entities_and_threats(title: str) -> dict:
    """Extract and clean entities and threats from title using NER model."""
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
    
    ner_results = ner_pipe(title)

    persons       = set()
    organizations = set()
    locations     = set()
    products      = set()

    # Common noise words to exclude
    common_noise = ['the', 'and', 'for', 'with', 'from', 'this', 'that', 'are', 'was', 'has', 'have']

    for ent in ner_results:
        grp  = ent["entity_group"]
        text = ent["word"]
        
        # Skip subword tokens (BERT artifacts)
        if text.startswith('##'):
            continue
        # Skip short tokens or single letters
        if len(text) <= 2:
            continue
        # Skip pure numbers
        if text.isdigit():
            continue
        # Skip common noise words
        if text.lower() in common_noise:
            continue
        
        if grp == "PER":
            persons.add(text)
        elif grp == "ORG":
            for token in text.split():
                if not token.startswith('##') and len(token) > 2 and not token.isdigit() and token[0].isupper():
                    organizations.add(token)
        elif grp == "LOC":
            locations.add(text)
        elif grp == "MISC":
            for token in text.split():
                if not token.startswith('##') and len(token) > 2 and not token.isdigit() and (token[0].isupper() or token.isupper()):
                    products.add(token)

    cves = re.findall(r"\bCVE-\d{4}-\d{4,7}\b", title)

    attackers = []
    for pat in ATTACKER_PATTERNS:
        attackers += re.findall(pat, title)

    return {
        "persons":       list(persons),
        "organizations": list(organizations),
        "locations":     list(locations),
        "product":       list(products),
        "cves":          list(set(cves)),
        "attackers":     list(set(attackers)),
    }


def start_scheduler():
    """
    Launch planning tasks in background:
        - Fire main_watch every 30 minutes
        - Fire cleanup every day at 8 am
        - Fire weekly summary based on settings configuration
    """
    scheduler = BackgroundScheduler(timezone=str(tzlocal.get_localzone()))

    scheduler.add_job(main_watch, 'cron', day_of_week='mon-sun', minute='*/30', id='main_watch_job',
                      max_instances=10, replace_existing=True)

    scheduler.add_job(cleanup, 'cron', day_of_week='mon-sun', hour=8, minute=0, id='day_clean', replace_existing=True)

    # Weekly summary
    day = 'mon'
    hour, minute = 9, 30
    try:
        day = {
            'monday': 'mon', 'tuesday': 'tue', 'wednesday': 'wed',
            'thursday': 'thu', 'friday': 'fri', 'saturday': 'sat', 'sunday': 'sun'
        }.get(settings.WEEKLY_SUMMARY_DAY.lower(), 'mon')
        hour, minute = map(int, settings.WEEKLY_SUMMARY_HOUR.split(':'))
    except Exception:
        pass
    
    scheduler.add_job(generate_weekly_summary,'cron', day_of_week=day, hour=hour, minute=minute, id='weekly_summary_job', 
                      max_instances=1, replace_existing=True
    )
    
    scheduler.start()


def cleanup():
    """
    Remove words with a creation date greater than 30 days.
    """
    close_old_connections()
    logger.info("CRON TASK : Remove words with a creation date greater than 30 days")
    words = TrendyWord.objects.all()
    for word in words:
        if (timezone.now() - word.created_at) >= timedelta(days=30):
            logger.info(f"Delete this trendy word -> {word.name}")
            word.delete()


def main_watch():
    """
    Main function:
        - close_old_connections()
        - load_feeds()
        - fetch_last_posts(settings.POSTS_DEPTH)
        - tokenize_count_urls()
        - remove_banned_words()
        - focus_five_letters()
        - focus_on_top(settings.WORDS_OCCURRENCE)
        - send_threats_watcher_notifications()
        
    """
    close_old_connections()
    logger.info("CRON TASK : Main function")
    load_feeds()
    logger.info("Loaded feeds.")
    fetch_last_posts(settings.POSTS_DEPTH)
    logger.info("Fetched last posts.")
    tokenize_count_urls()
    logger.info("Tokenized words.")
    remove_banned_words()
    logger.info("Removed banned words.")

    focus_five_letters()
    focus_on_top(settings.WORDS_OCCURRENCE)
    reliability_score()
    send_threats_watcher_notifications(email_words)



def get_confidence_score(confidence):
    """
    Converts a confidence level (1, 2 or 3) to a percentage.   
    """
    return {1: 100, 2: 50, 3: 20}.get(confidence, 0)


def load_feeds():
    """
    Load feeds.
    """
    global rss_urls
    global feeds
    global sources_by_url
    sources = Source.objects.all().order_by('id')
    rss_urls = list()
    feeds = []
    sources_by_url = {}
    for source in sources:
        rss_urls.append(source.url)
        sources_by_url[source.url] = source.id


def _update_source_status(url, status_code):
    """
    Write last_status_code and last_checked for a Source row (fire-and-forget).

    :return: the logging function to use for a problem on this feed: a warning when the answer is new, debug when the
        feed was already answering the same way at the previous check (a feed that blocks Watcher would otherwise be
        reported at every cycle).
    """
    source_id = sources_by_url.get(url)
    if source_id is None:
        return logger.warning
    try:
        previous = Source.objects.filter(pk=source_id).values_list('last_status_code', flat=True).first()
        Source.objects.filter(pk=source_id).update(
            last_status_code=status_code,
            last_checked=timezone.now(),
        )
        return logger.debug if previous == status_code else logger.warning
    except Exception as exc:
        logger.debug(f"Could not update status for source {url}: {exc}")
        return logger.warning


def fetch_last_posts(nb_max_post):
    """
    Fetch the nb last posts for each feed (non-Bluesky) .

    :param nb_max_post: The deepness of the search on each feed.
    """
    global posts
    global posts_published
    posts = dict()
    tmp_posts = dict()
    posts_published = dict()

    for url in rss_urls:
        try:
            feed_content = requests.get(url, headers=HEADERS, timeout=10, verify=True)
            report = _update_source_status(url, feed_content.status_code)
            if feed_content.status_code // 100 == 2:
                feeds.append(feedparser.parse(feed_content.content))
            else:
                report(f"Feed: {url} => Error: Status code: {feed_content.status_code}")
        except requests.exceptions.SSLError:
            _update_source_status(url, 0)("SSL certificate error for %s (skipping)", url)
        except requests.exceptions.ProxyError as e:
            detail = re.search(r'(\d{3}\s+\w[\w ]*)', str(e))
            code_str = f" [{detail.group(1).strip()}]" if detail else ""
            _update_source_status(url, 0)("Feed unreachable through proxy%s: %s", code_str, url)
        except requests.exceptions.ConnectionError:
            _update_source_status(url, 0)("Connection failed for %s", url)
        except requests.exceptions.Timeout:
            _update_source_status(url, 0)("Timeout fetching %s", url)
        except requests.exceptions.RequestException as e:
            _update_source_status(url, 0)("Error fetching %s: %s", url, type(e).__name__)

    # Fetch monitored keywords once for efficiency
    monitored_keywords = list(MonitoredKeyword.objects.filter(is_active=True))

    # Pre-fetch seen posturl URLs per monitored keyword to avoid double-counting
    mk_seen_urls: dict[int, set] = {}
    for mk in monitored_keywords:
        mk_seen_urls[mk.id] = set(mk.posturls.values_list('url', flat=True))

    for feed in feeds:
        count = 1
        for entry in feed.entries:
            if count <= nb_max_post:
                count += 1
                dt = "no-date"
                parsed = entry.get('published_parsed') or entry.get('updated_parsed')
                if parsed:
                    try:
                        dt = datetime.fromtimestamp(calendar.timegm(parsed))
                    except Exception:
                        dt = "no-date"
                link = entry.get('link') or entry.get('guid') or entry.get('id') or None
                title_raw = entry.get('title') or entry.get('summary') or entry.get('description') or (entry.get('guid') if isinstance(entry.get('guid'), str) else None) or link or ""
                title_clean = re.sub(r'<[^>]+>', '', title_raw).replace(u'\xa0', u' ').strip()

                # Check which MonitoredKeyword the post title/content matches (a word, or a rule of several words;
                # case and accents are ignored)
                if monitored_keywords and title_clean:
                    content_raw = entry.get('content', [{}])[0].get('value', '') if entry.get('content') else (entry.get('summary', '') or entry.get('description', '') or '')
                    content_clean = re.sub(r'<[^>]+>', '', content_raw).strip()
                    post_text = normalize_text(title_clean + " " + content_clean)
                    for mk in monitored_keywords:
                        words = match_keyword(mk, post_text, normalized=True)
                        if words is not None:
                            # Only count a new occurrence if this article URL hasn't been
                            # linked before (prevents inflated counts from repeated CRON runs).
                            if link and link in mk_seen_urls.get(mk.id, set()):
                                continue  # already counted for this article
                            mk.occurrences += 1
                            mk.last_seen = timezone.now()
                            mk.update_level()
                            mk.save()
                            # Link the article PostUrl to this keyword for source tracking
                            if link:
                                post_obj, _ = PostUrl.objects.get_or_create(url=link, defaults={'created_at': dt if dt != "no-date" else timezone.now()})
                                mk.posturls.add(post_obj)
                                mk_seen_urls[mk.id].add(link)  # update local cache
                            logger.info(f"MonitoredKeyword '{mk.name}' detected - occurrences: {mk.occurrences}, level: {mk.level}")
                            # A rule keeps the article to be reviewed, and tells the subscribers which one it was
                            if mk.is_rule and link:
                                try:
                                    hit = record_keyword_hit(mk, title_clean, link, words)
                                    if hit:
                                        notify_keyword_rule_hit(hit)
                                except Exception as exc:  # a rule that fails must not stop the collection
                                    logger.error(f"Keyword rule '{mk.name}': {type(exc).__name__}: {exc}")

                if link and title_clean:
                    tmp_posts[title_clean] = link
                    posts_published[link] = dt
    for title, url in tmp_posts.items():
        posts[title] = url


def tokenize_count_urls():
    """
    For each title (≤ 30 days):
        - Runs NER and threat extraction,
        - Casts scores to float,
        - Counts occurrences and aggregates associated URLs.
    """
    global posts_words, wordurl
    posts_words = {}
    wordurl     = {}

    threshold = timezone.now() - timedelta(days=30)
    ner_pipe = get_ner_pipeline()
    
    if not ner_pipe:
        logger.error("NER pipeline not available for tokenization")
        return

    for title, url in posts.items():
        post_date = posts_published.get(url, "no-date")
        if post_date == "no-date" or not isinstance(post_date, datetime) or post_date < threshold:
            continue
        raw_ner = ner_pipe(title)
        for ent in raw_ner:
            ent['score'] = float(ent['score'])
        ents = extract_entities_and_threats(title)
        retained = (
              ents["persons"]
            + ents["organizations"]
            + ents["locations"]
            + ents["product"]
            + ents["cves"]
            + ents["attackers"]
        )
        for item in retained:
            key = f"{item}_url"
            posts_words[item] = posts_words.get(item, 0) + 1
            if key in wordurl:
                wordurl[key] += ", " + url
            else:
                wordurl[key] = url

def remove_banned_words():
    """
    Clean the posts for specific patterns: BannedWord, then english + french common words.
    """
    banned_words = BannedWord.objects.all().order_by('id')
    global posts_without_banned

    posts_without_banned = dict()

    french = open('threats_watcher/datas/french.txt', 'r')
    french = french.read().splitlines()
    english = open('threats_watcher/datas/english.txt', 'r')
    english = english.read().splitlines()

    for word, count in posts_words.items():
        for word1 in banned_words:
            if word1.name == word:
                word = ""
        for word2 in english:
            word = re.sub(r'^' + word2 + r'$', "", word)
        for word3 in french:
            word = re.sub(r'^' + word3 + r'$', "", word)
        if word == "https":
            word = ""

        # Remove all special characters
        word = re.sub(r"[^a-zA-Z0-9]+" + r'$', '', word)
        # Remove version numbers
        word = re.sub(r"^(\d+\.)?(\d+\.)?(\*|\d+)?(\.\d+)?(\.\d+)$" + r'$', '', word)
        # Remove ' (sometimes regular expression don't catch this character)
        word = word.replace("'", "")
        # Remove '/' (sometimes regular expression don't catch this character)
        word = word.replace("/", "")

        # Remove domain name
        domain_extensions = [
        ".com", ".org", ".net", ".edu", ".gov", ".mil", 
        ".biz", ".info", ".name", ".pro", ".coop", ".museum", ".aero", ".int", ".jobs", ".mobi", ".tel", ".travel", 
        ".fr", ".uk", ".de", ".jp", ".cn", ".it", ".us", ".es", ".ca", ".au", ".nl", ".ru", ".br", ".pl", ".in", ".be", ".ch", ".se", ".mx", ".at", ".dk", ".no", ".fi", ".ie", ".nz", ".sg", ".hk", ".my", ".za", ".ar", ".tw", ".kr", ".vn", ".tr", ".ua", ".gr", ".pt", ".cz", ".hu", ".cl", ".ro", ".id", ".il", ".co", ".ae", ".th", ".sk", ".bg", ".ph", ".hr", ".lt", ".si", ".lv", ".ee", ".rs", ".is", ".ir", ".sa", ".pe", ".ma", ".by", ".gt", ".do", ".ng", ".cr", ".ve", ".ec", ".py", ".sv", ".hn", ".pa", ".bo", ".kz", ".lu", ".uy", ".dz", ".uz", ".ke", ".np", ".kh", ".zm", ".ug", ".cy", ".mm", ".et", ".ni", ".al", ".kg", ".bd", ".tn", ".np", ".la", ".gh", ".iq", ".bj", ".gm", ".tg", ".lk", ".jo", ".zw", ".sn", ".km", ".mw", ".md", ".mr", ".tn", ".bf", ".bi", ".sc", ".er", ".sl", ".cf", ".ss", ".td", ".cg", ".gq", ".dj", ".rw", ".so", ".ne", ".yt", ".re", ".pm", ".wf", ".tf", ".gs", ".ai", ".aw", ".bb", ".bm", ".vg", ".ky", ".fk", ".fo", ".gl", ".gp", ".gg", ".gi", ".je", ".im", ".mq", ".ms", ".nc", ".pf", ".pn", ".sh", ".sb", ".gs", ".tc", ".tk", ".vg", ".vi", ".um", ".cx", ".cc", ".ac", ".eu", ".ad", ".ax", ".gg", ".gi", ".im", ".je", ".mc", ".me", ".sm", ".va", ".rs", ".ps", ".asia", ".cat", ".coop", ".jobs", ".mobi", ".tel", ".travel"  # Domaines de premier niveau géographiques (ccTLD)
        ]
        if any(word.endswith(ext) for ext in domain_extensions):
            word = ""
        
        # Remove special characters
        word = word.encode("latin1", errors="ignore").decode("utf-8", errors="ignore")

        # Remove version numbers in the format x.x.x
        word = re.sub(r"\b\d+(?:\.\d+){2,}\b", "", word)
        # Remove version numbers in the format vx.x.x
        word = re.sub(r"v\d+(?:\.\d+){2,}", "", word)

        if word.startswith("#"):
            word = ""

        if word:
            posts_without_banned[word] = count


def focus_five_letters():
    """
    Focus on 5 letters long words.
    """
    global posts_five_letters
    posts_five_letters = dict()
    n = 4
    for word, count in posts_without_banned.items():
        if len(word) > n:
            posts_five_letters[word] = count


def focus_on_top(words_occurrence):
    """
    Focus on top words.
    Populated the database with only words with a minimum occurrence of "words_occurence" in feeds.
    Also triggers breaking news when threshold is exceeded.
    Generates AI summary for newly created or updated words.

    :param words_occurrence: Word occurence in feeds.
    """
    global email_words
    email_words = list()
    new_posts = dict()
    words_to_summarize = []
    
    breaking_threshold = settings.BREAKING_NEWS_THRESHOLD

    for word, occurrences in posts_five_letters.items():
        if occurrences >= words_occurrence:
            if TrendyWord.objects.filter(name=word):
                try:
                    for posturl in wordurl[word + "_url"].split(', '):
                        for url_, date in posts_published.items():
                            if posturl == url_:
                                if not PostUrl.objects.filter(url=posturl):
                                    trendy_word = TrendyWord.objects.get(name=word)
                                    trendy_word.occurrences += 1
                                    trendy_word.save()
                                    
                                    if date != "no-date":
                                        PostUrl.objects.create(url=posturl, created_at=date)
                                    else:
                                        PostUrl.objects.create(url=posturl)
                                    post_url = PostUrl.objects.filter(url=posturl).first()
                                    if post_url:
                                        trendy_word.posturls.add(post_url)
                                    new_posts[word] = new_posts.get(word, 0) + 1
                                    
                                    # Add to summary queue if it has enough posts and no recent summary
                                    if trendy_word.posturls.count() >= 3:
                                        last_24h = timezone.now() - timedelta(hours=24)
                                        has_recent_summary = Summary.objects.filter(
                                            type='trendy_word_summary',
                                            keywords=word,
                                            created_at__gte=last_24h
                                        ).exists()
                                        if not has_recent_summary and trendy_word.id not in words_to_summarize:
                                            words_to_summarize.append(trendy_word.id)
                                    
                                    # Check for breaking news threshold
                                    if trendy_word.occurrences >= breaking_threshold:
                                        # Check if we already sent breaking news recently (last 24h)
                                        last_24h = timezone.now() - timedelta(hours=24)
                                        recent_breaking = Summary.objects.filter(
                                            type='breaking_news',
                                            keywords=word,
                                            created_at__gte=last_24h
                                        ).exists()
                                        
                                        if not recent_breaking:
                                            logger.info(f"Breaking news threshold reached for '{word}' ({trendy_word.occurrences} occurrences)")
                                            generate_breaking_news(trendy_word)
                except KeyError:
                    pass
            else:
                try:
                    for url in wordurl[word + "_url"].split(', '):
                        for url_, date in posts_published.items():
                            if url == url_:
                                if not PostUrl.objects.filter(url=url):
                                    if date != "no-date":
                                        PostUrl.objects.create(url=url, created_at=date)
                                    else:
                                        PostUrl.objects.create(url=url)

                    word_db = TrendyWord.objects.create(name=word, occurrences=occurrences)
                    for url in wordurl[word + "_url"].split(', '):
                        post_url, _ = PostUrl.objects.get_or_create(url=url)
                        word_db.posturls.add(post_url)

                    email_words.append(
                        "<a href=" + settings.WATCHER_URL + ">" + word + "</a> :<b> " + str(occurrences) + "</b>")
                    
                    # Add newly created word to summary queue if it has enough posts
                    if word_db.posturls.count() >= 3:
                        words_to_summarize.append(word_db.id)
                    
                    # Check for breaking news on new words
                    if occurrences >= breaking_threshold:
                        logger.info(f"New word '{word}' reached breaking news threshold ({occurrences} occurrences)")
                        generate_breaking_news(word_db)
                        
                except KeyError:
                    pass
    
    # Generate summaries for all words in queue
    if words_to_summarize:
        logger.info(f"Generating summaries for {len(words_to_summarize)} words: {words_to_summarize}")
        for word_id in words_to_summarize:
            try:
                generate_trendy_word_summary(word_id)
            except Exception as e:
                logger.error(f"Failed to generate summary for word ID {word_id}: {e}")


def get_pre_redirect_domain(url):
    """
    Retrieves the domain of the URL before the redirect.
    """
    try:
        response = requests.get(url, headers=HEADERS, timeout=10, verify=True, allow_redirects=True)
        if response.history:
            original_url = response.history[-1].url
        else:
            original_url = url
    except requests.exceptions.SSLError as ssl_err:
        logger.error(f"SSL error retrieving pre-redirect URL for {url}: {ssl_err}")
        original_url = url
    except Exception as e:
        logger.error(f"Error retrieving pre-redirect URL for {url}: {e}")
        original_url = url
    domain = get_normalized_domain(original_url)
    return domain


def get_normalized_domain(url):
    """
    Extracts and normalizes the domain from a URL without a network query (for Source objects).
    """
    parsed = urlparse(url)
    domain = parsed.netloc.lower()
    if domain.startswith('www.'):
        domain = domain[4:]
    return domain


def reliability_score():
    """
    Calculates the reliability score for each TrendyWord by scanning its associated PostUrls.
    """
    trendy_words = TrendyWord.objects.prefetch_related('posturls').all()

    for word in trendy_words:
        score_list = []
        for post in word.posturls.all():
            try:
                post_domain = get_pre_redirect_domain(post.url)
                source_match = None
                for source in Source.objects.all():
                    source_domain = get_normalized_domain(source.url)
                    if post_domain == source_domain:
                        source_match = source
                        break
                if source_match:
                    conf_score = get_confidence_score(source_match.confident)
                    score_list.append(conf_score)
            except Exception as e:
                logger.error(f"Error for {post.url} word : '{word.name}' : {e}")

        if score_list:
            avg_score = sum(score_list) / len(score_list)
            word.score = avg_score
            word.save()
        else:
            logger.info(f"'{word.name}' : No fiability score.")


def send_threats_watcher_notifications(content):
    """
    Send notifications for Threats Watcher events.
    Detects notification type from content and prepares the context for downstream handlers.
    Slack, Citadel and TheHive follow the instance settings (Connectors > Notifications); the email goes to the
    subscribers who ticked E-mail and asked for this kind of notification.
    """
    subscribers = Subscriber.objects.all()

    context_data = {}
    subscription_type = 'trendy_words'
    notification_type = 'regular'
    if isinstance(content, dict):
        requested_type = content.get('notification_type')
        if requested_type in ('regular', 'weeklysummary', 'breakingnews'):
            notification_type = requested_type
        else:
            notification_type = 'breakingnews'

        if content.get('subscription_type') in ('trendy_words', 'monitored_keywords'):
            subscription_type = content.get('subscription_type')

        context_data = {
            'notification_type': notification_type,
            'keyword': content.get('keyword', ''),
            'occurrences': content.get('occurrences', 0),
            'summary_text': content.get('summary_text', '')
        }
    elif isinstance(content, str):
        context_data = {
            'notification_type': 'weeklysummary',
            'summary_text': content
        }
    elif isinstance(content, list):
        if not content:
            return
        context_data = {
            'notification_type': 'regular',
            'email_words': content
        }
    else:
        return

    if notification_type == 'weeklysummary':
        subscribers = subscribers.filter(notify_weekly_summary=True)
    elif notification_type == 'breakingnews':
        subscribers = subscribers.filter(notify_breaking_news=True)
    elif subscription_type == 'monitored_keywords':
        subscribers = subscribers.filter(notify_monitored_keywords=True)
    else:
        subscribers = subscribers.filter(notify_trendy_words=True)

    send_app_specific_notifications('threats_watcher', context_data, subscribers)


# Monitored keywords: matching against the articles. A keyword is a single word (its name) or a rule: all the words of
# `all_of`, one of `any_of` when given, none of `exceptions`.
def normalize_text(text):
    """Lower case, without accents: 'Électricité' and 'electricite' are the same word."""
    decomposed = unicodedata.normalize('NFKD', str(text or ''))
    return ''.join(c for c in decomposed if not unicodedata.combining(c)).casefold()


@functools.lru_cache(maxsize=2048)
def _whole_word(word):
    # Not preceded or followed by a letter or a digit: 'apt' is not found in 'adapt' nor in 'APT29', but in 'APT-29'
    return re.compile(r'(?<![^\W_])' + re.escape(word) + r'(?![^\W_])')


@functools.lru_cache(maxsize=4096)
def _normalized_word(word):
    return normalize_text(word)


def _found(word, haystack, whole_words):
    word = _normalized_word(word)
    if not word:
        return False
    return _whole_word(word).search(haystack) is not None if whole_words else word in haystack


def match_rule(rule, text, normalized=False):
    """
    The words of the rule found in `text`, or None when the article does not match.

    :param rule: anything with all_of, any_of, exceptions and whole_words.
    :param text: title and content of the article.
    :param normalized: `text` already went through `normalize_text` (done once per article when it is checked against
        many keywords).
    :return: the matched words (all of `all_of`, plus those of `any_of` that were found) or None.
    """
    haystack = text if normalized else normalize_text(text)
    if any(_found(word, haystack, rule.whole_words) for word in rule.exceptions):
        return None
    required = [word for word in rule.all_of if _found(word, haystack, rule.whole_words)]
    if len(required) != len(rule.all_of):
        return None
    optional = [word for word in rule.any_of if _found(word, haystack, rule.whole_words)]
    if rule.any_of and not optional:
        return None
    if not rule.all_of and not rule.any_of:
        return None
    return required + optional


def match_keyword(keyword, text, normalized=False):
    """The words of a monitored keyword found in `text` (its name when it is a single word), or None."""
    if keyword.is_rule:
        return match_rule(keyword, text, normalized)
    return match_rule(SimpleNamespace(all_of=[keyword.name], any_of=[], exceptions=keyword.exceptions,
                                      whole_words=keyword.whole_words), text, normalized)


def record_keyword_hit(keyword, title, link, words):
    """
    Keep the article that a rule matched, to be reviewed.

    :return: the new KeywordHit, or None when this article was already kept for this keyword.
    """
    digest = hashlib.sha256(link.encode('utf-8')).hexdigest()
    hit, created = KeywordHit.objects.get_or_create(
        keyword=keyword, url_hash=digest,
        defaults={'url': link[:1000], 'title': (title or '')[:500], 'matched': words})
    if created:
        logger.info(f"Keyword rule '{keyword.name}' matched: {hit.title or hit.url} ({', '.join(words)})")
    return hit if created else None


# Monitored keywords: notification of an article that matched a rule (Slack, Citadel, e-mail). The title of an article
# comes from a feed: it is escaped for each channel.
RULE_NOTIFICATION = 'article_rule_hit'


def _slack_escape(text):
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _rule_context(hit, channel):
    from connectors.notifications import get_type

    escape = {'slack': _slack_escape, 'citadel': html.escape}.get(channel, lambda text: text)
    one_line = lambda text: ' '.join(str(text).split())
    return {
        'rule_name': escape(one_line(hit.keyword.name)),
        'article_title': escape(one_line(hit.title or hit.url)),
        'article_url': escape(hit.url),
        'matched_words': escape(', '.join(hit.matched)),
        'details_url': getattr(settings, 'WATCHER_URL', '') + get_type(RULE_NOTIFICATION).url_suffix,
    }


def _send_rule_slack(hit):
    from common.utils.send_slack_messages import send_slack_message
    from connectors.core import get_slack_config
    from connectors.notifications import is_enabled, render_message

    if is_enabled(RULE_NOTIFICATION, 'slack'):
        send_slack_message(render_message(RULE_NOTIFICATION, 'slack', _rule_context(hit, 'slack')),
                           get_slack_config()['channel'], app_name='keyword_rules')


def _send_rule_citadel(hit):
    from common.utils.send_citadel_messages import send_citadel_message
    from connectors.core import get_citadel_config
    from connectors.notifications import is_enabled, render_message

    if is_enabled(RULE_NOTIFICATION, 'citadel'):
        body = render_message(RULE_NOTIFICATION, 'citadel', _rule_context(hit, 'citadel'))
        send_citadel_message(
            content={'msgtype': 'm.text', 'body': body, 'format': 'org.matrix.custom.html', 'formatted_body': body},
            room_id=get_citadel_config()['room_id'], app_name='keyword_rules')


def _send_rule_email(hit):
    from common.mail_template.article_rule_template import get_article_rule_template
    from common.utils.send_email_notifications import send_email_notifications
    from connectors.notifications import email_subject, is_enabled
    from .models import Subscriber

    if not is_enabled(RULE_NOTIFICATION, 'email'):
        return
    recipients = [s.user_rec.email for s in Subscriber.objects.filter(email=True, notify_monitored_keywords=True)
                  if s.user_rec.email]
    if not recipients:
        job_log.note_channel('no recipients')
        return
    context = _rule_context(hit, 'email')
    subject = email_subject(RULE_NOTIFICATION, {'rule_name': context['rule_name'].replace('\n', ' ')})
    send_email_notifications(subject, get_article_rule_template(context), recipients, app_name='keyword_rules')


def notify_keyword_rule_hit(hit):
    """Tell the channels that an article matched a keyword rule. A channel that fails does not stop the next ones."""
    report = {}
    for channel, send in (('slack', _send_rule_slack), ('citadel', _send_rule_citadel), ('email', _send_rule_email)):
        try:
            report[channel] = job_log.run_channel(channel, lambda send=send: send(hit))
        except Exception as exc:
            report[channel] = f"failed ({str(exc)[:110]})"
    problems = any(status.startswith('failed') for status in report.values())
    logger.log(logging.WARNING if problems else logging.INFO,
               f"Notification keyword rule #{hit.keyword_id}: " + ', '.join(f"{c}={s}" for c, s in report.items()))
