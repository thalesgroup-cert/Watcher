# coding=utf-8
import logging
from .models import Keyword, Alert, PasteId, Subscriber
import requests
from django.db import close_old_connections
from django.utils import timezone
from datetime import timedelta
from apscheduler.schedulers.background import BackgroundScheduler
import tzlocal
from django.conf import settings
from django.db.models.functions import Length
from json.decoder import JSONDecodeError
from common.core import send_app_specific_notifications
from common.core import send_app_specific_notifications_group
from common.core import send_only_thehive_notifications
from django.db.models import Q

# Configure logger
logger = logging.getLogger('watcher.data_leak')

def start_scheduler():
    """
    Launch multiple planning tasks in background:
        - Fire main every 5 minutes from Monday to Sunday
        - Fire cleanup every 2 hours
    """
    scheduler = BackgroundScheduler(timezone=str(tzlocal.get_localzone()))

    scheduler.add_job(main_data_leak, 'cron', day_of_week='mon-sun', minute='*/5', id='week_job', max_instances=10,
                      replace_existing=True)
    scheduler.add_job(cleanup, 'cron', day_of_week='mon-sun', hour='*/2', id='clean', replace_existing=True)
    scheduler.start()


def cleanup():
    """
    Remove 2 hours old, useless, pasteIDs.
    """
    close_old_connections()
    logger.info("CRON TASK : Remove 2 hours old pasteIDs.")
    count = 0

    paste_ids = PasteId.objects.all()
    for paste_id in paste_ids:
        # A paste stay approximately 20-25 minutes in the same API 250 pastes request, if the paste is 2 hours old,
        # we can delete it.
        if (timezone.now() - paste_id.created_at) >= timedelta(hours=2):
            count += 1
            paste_id.delete()
    logger.info(f"Deleted {count} useless pasties ID.")


def main_data_leak():
    """
        Main function:
            - close_old_connections()
            - read in our list of keywords
            - check_keywords(keywords)
    """
    close_old_connections()
    logger.info("CRON TASK : Fetch searx & pastebin")
    # read in our list of keywords
    keywords = Keyword.objects.all().order_by(Length('name').desc())

    check_keywords(keywords)


def check_urls(keyword, urls):
    """
    Check if the URL is new.

    :param keyword: Keyword stored in database.
    :param urls: Fresh searx urls.
    :return: Urls not already in alert database column.
    :rtype: list
    """
    new_urls = []
    stored_urls = list()

    if Alert.objects.all():

        for alerts in Alert.objects.all():
            stored_urls.append(alerts.url)

        for url in urls:

            if url not in stored_urls:
                logger.info(f"New URL for {keyword} discovered: {url}")

                new_urls.append(url)
    else:
        new_urls = urls

    return new_urls


def check_searx(keyword):
    """
    Pull Searx instance for keyword.

    :param keyword: Keyword stored in database.
    :return: Matched urls.
    :rtype: list
    """
    hits = []
    urls = []

    # double quote for exact match
    keyword = '"' + str(keyword) + '"'
    params = {'q': keyword, 'engines': 'gitlab,github,bitbucket,apkmirror,gentoo,npm,stackoverflow,hoogle',
              'format': 'json'}

    logger.info(f"Querying Searx for: {keyword}")

    # send the request off to searx
    try:
        response = requests.get(settings.DATA_LEAK_SEARX_URL, params=params)
    except requests.exceptions.RequestException as e:
        logger.error(str(e))
        return hits

    try:
        results = response.json()
        # if we have results we want to check them against our stored URLs
        if len(results['results']):

            for result in results['results']:

                if result['url'] not in urls:
                    urls.append(result['url'])

            hits = check_urls(keyword, urls)
    except JSONDecodeError as e:
        # no JSON returned
        logger.error(str(e))
        return hits

    return hits


def check_pastebin(keywords):
    """
    Check Pastebin for keyword list.

    :param keywords: Keywords stored in database.
    :return: Matched urls & Corresponding keyword.
    :rtype: dictionary
    """
    global paste_content_hits
    paste_content_hits = {}
    new_ids = []
    pastebin_ids = list()
    paste_hits = {}

    # Fetch the Pastebin API
    try:
        response = requests.get("https://scrape.pastebin.com/api_scraping.php?limit=250")
    except requests.exceptions.RequestException as e:
        logger.error(str(e))
        return paste_hits

    if len(response.text) > 0:
        # Check if it is a json, cannot check 'application/json' in  content-type because it is always the same...
        if response.text[0] == "[":
            # parse the JSON
            result = response.json()

            # load up our list of stored paste ID's and only check the new ones
            pastebin = PasteId.objects.all()
            for paste in pastebin:
                pastebin_ids.append(paste.paste_id)

            for paste in result:

                if paste['key'] not in pastebin_ids:

                    new_ids.append(paste['key'])

                    # this is a new paste so send a secondary request to retrieve
                    # it and then check it for our keywords
                    try:
                        headers = {
                            'Referer': 'https://scrape.pastebin.com',
                            'User-Agent': 'Chrome/75.0.3770.142'
                        }

                        paste_response = requests.get(paste['scrape_url'], headers)
                        paste_body_lower = paste_response.content.lower()

                        keyword_hits = []

                        for keyword in keywords:
                            if bytes(str(keyword).lower(), 'utf8') in paste_body_lower:
                                keyword_hits.append(keyword)

                        if len(keyword_hits):
                            # We stored the first matched keyword, others are pointless
                            paste_hits[paste['full_url']] = keyword_hits[0]
                            paste_content_hits[paste['full_url']] = str(paste_body_lower.decode("utf-8"))

                            logger.info(f"Hit on Pastebin for {str(keyword_hits)}: {paste['full_url']}")
                    except requests.exceptions.RequestException as e:
                        logger.error(str(e))

            # store the newly checked IDs
            for pastebin_id in new_ids:
                PasteId.objects.create(paste_id=pastebin_id)

            logger.info(f"Successfully processed {len(new_ids)} Pastebin posts.")
        else:
            logger.warning("Cannot Pull https://scrape.pastebin.com API. You need a Pastebin Pro Account. "
                                  "Please verify that the software IP is whitelisted: https://pastebin.com/doc_scraping_api")
    else:
        logger.warning("Cannot Pull https://scrape.pastebin.com API. API is in maintenance")

    return paste_hits


def check_keywords(keywords):
    """
    Check keywords in Searx Instance & Pastebin.

    :param keywords: Keywords stored in database.
    """
    # use the list of keywords and check each against searx
    for keyword in keywords:
        # query searx for the keyword
        results = check_searx(keyword)

        if len(results):
            for result in results:
                logger.info(f"Create alert for: {keyword} url: {result}")
                alert = Alert.objects.create(keyword=Keyword.objects.get(name=keyword), url=result)
                # limiting the number of specific email per alert
                if len(results) < 6:
                    send_data_leak_notifications(alert)
            # if there is too many alerts, we send a group email
            if len(results) >= 6:
                send_data_leak_notifications_group(keyword, len(results), results)

    # now we check Pastebin for new pastes
    result = check_pastebin(keywords)

    if len(result.keys()):
        for url, keyword in result.items():
            logger.info(f"Create alert for: {keyword} url: {url}")
            alert = Alert.objects.create(keyword=Keyword.objects.get(name=keyword), url=url,
                                         content=paste_content_hits[url])
            send_data_leak_notifications(alert)


def send_data_leak_notifications(alert):
    """
    Sends notifications to Slack, Citadel, TheHive or Email based on Data Leak.
    
    :param alert: Alert Object.
    """
    subscribers = Subscriber.objects.filter(
        (Q(slack=True) | Q(citadel=True) | Q(thehive=True) | Q(email=True))
    )

    if not subscribers.exists():
        logger.info("No subscribers for Data Leak, no message sent.")
        return    

    context_data = {
        'alert': alert
    }

    send_app_specific_notifications('data_leak', context_data, subscribers)


def send_data_leak_notifications_group(keyword, alerts_number, alerts):
    """
    Sends grouped notifications to Slack, Citadel, TheHive or Email based on data_leak_group.
    If the application is TheHive, individual notifications are sent for each alert.

    :param keyword: The keyword or term associated with the data leak.
    :param alerts_number: The total number of alerts in the group.
    :param alerts: The list of individual alerts to be processed and sent to TheHive.
    """
    subscribers = Subscriber.objects.filter(
        Q(slack=True) | Q(citadel=True) | Q(thehive=True) | Q(email=True)
    )


    if not subscribers.exists():
        logger.info("No subscribers for Data Leak group, no message sent.")
        return

    context_data_group = {
        'keyword': keyword,
        'alerts_number': alerts_number, 
    }

    send_app_specific_notifications_group('data_leak_group', context_data_group, subscribers)

    for index, alert in enumerate(alerts):

        context_data_thehive = {
            'alert': alert,  
        }

        send_only_thehive_notifications('data_leak', context_data_thehive, subscribers)
