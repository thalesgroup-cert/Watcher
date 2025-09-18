# coding=utf-8
from .models import Keyword, Alert, PasteId, Subscriber
import requests
import re
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
    print(str(timezone.now()) + " - CRON TASK : Remove 2 hours old pasteIDs.")
    count = 0

    paste_ids = PasteId.objects.all()
    for paste_id in paste_ids:
        # A paste stay approximately 20-25 minutes in the same API 250 pastes request, if the paste is 2 hours old,
        # we can delete it.
        if (timezone.now() - paste_id.created_at) >= timedelta(hours=2):
            count += 1
            paste_id.delete()
    print(str(timezone.now()) + " - Deleted ", count, " useless pasties ID.")


def main_data_leak():
    """
        Main function:
            - close_old_connections()
            - read in our list of keywords
            - check_keywords(keywords)
    """
    close_old_connections()
    print(str(timezone.now()) + " - CRON TASK : Fetch searx & pastebin")
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
                print(str(timezone.now()) + " - New URL for", keyword, " discovered: ", url)

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

    # Use the search pattern from the keyword model
    search_pattern = keyword.get_search_pattern()
    
    # For regex patterns, we need to search for the literal name but apply regex later
    # For exact matches, use double quotes
    if keyword.is_regex:
        search_term = str(keyword.name)  # Use the name for initial search
    else:
        search_term = '"' + str(keyword.name) + '"'  # Exact match with quotes
    
    params = {'q': search_term, 'engines': 'gitlab,github,bitbucket,apkmirror,gentoo,npm,stackoverflow,hoogle',
              'format': 'json'}

    print(str(timezone.now()) + " - Querying Searx for: ", search_term)

    # send the request off to searx
    try:
        response = requests.get(settings.DATA_LEAK_SEARX_URL, params=params)
    except requests.exceptions.RequestException as e:
        print(str(timezone.now()) + " - ", e)
        return hits

    try:
        results = response.json()
        # if we have results we want to check them against our stored URLs
        if len(results['results']):

            for result in results['results']:
                if result['url'] not in urls:
                    # For regex keywords, perform additional regex validation on content
                    if keyword.is_regex and keyword.regex_pattern:
                        # Try to get the page title or snippet for regex matching
                        content_to_check = (result.get('title', '') + ' ' + 
                                          result.get('content', '') + ' ' + 
                                          result.get('url', '')).lower()
                        
                        import re
                        try:
                            if re.search(keyword.regex_pattern, content_to_check, re.IGNORECASE):
                                urls.append(result['url'])
                        except re.error as e:
                            print(f"{timezone.now()} - Regex error for {keyword.regex_pattern}: {e}")
                            # Fallback to simple string match
                            if str(keyword.name).lower() in content_to_check:
                                urls.append(result['url'])
                    else:
                        urls.append(result['url'])

            hits = check_urls(keyword, urls)
    except JSONDecodeError as e:
        # no JSON returned
        print(str(timezone.now()) + " - ", e)
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
        print(str(timezone.now()) + " - ", e)
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
                            # Check if keyword matches using regex or simple string match
                            if keyword.is_regex and keyword.regex_pattern:
                                try:
                                    import re
                                    # Convert bytes to string for regex matching
                                    paste_text = paste_body_lower.decode('utf-8', errors='ignore')
                                    if re.search(keyword.regex_pattern, paste_text, re.IGNORECASE):
                                        keyword_hits.append(keyword)
                                except (re.error, UnicodeDecodeError) as e:
                                    print(f"{timezone.now()} - Error processing regex for {keyword.name}: {e}")
                                    # Fallback to simple string match
                                    if bytes(str(keyword.name).lower(), 'utf8') in paste_body_lower:
                                        keyword_hits.append(keyword)
                            else:
                                # Original simple string matching
                                if bytes(str(keyword.name).lower(), 'utf8') in paste_body_lower:
                                    keyword_hits.append(keyword)

                        if len(keyword_hits):
                            # We stored the first matched keyword, others are pointless
                            paste_hits[paste['full_url']] = keyword_hits[0]
                            paste_content_hits[paste['full_url']] = str(paste_body_lower.decode("utf-8"))

                            print(
                                str(timezone.now()) + " - Hit on Pastebin for ", str(keyword_hits), ": ",
                                paste['full_url'])
                    except requests.exceptions.RequestException as e:
                        print(str(timezone.now()) + " - ", e)

            # store the newly checked IDs
            for pastebin_id in new_ids:
                PasteId.objects.create(paste_id=pastebin_id)

            print(str(timezone.now()) + " - Successfully processed ", len(new_ids), " Pastebin posts.")
        else:
            print(str(
                timezone.now()) + " - Cannot Pull https://scrape.pastebin.com API. You need a Pastebin Pro Account. "
                                  "Please verify that the software IP is whitelisted: https://pastebin.com/doc_scraping_api")
    else:
        print(str(timezone.now()) + " - Cannot Pull https://scrape.pastebin.com API. API is in maintenance")

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
                print(str(timezone.now()) + " - Create alert for: ", keyword, "url: ", result)
                alert = Alert.objects.create(keyword=Keyword.objects.get(name=keyword), url=result)
                # limiting the number of specific email per alert
                if len(results) < 6:
                    send_data_leak_notifications(alert)
            # if there is too many alerts, we send a group email
            if len(results) >= 6:
                alerts_obj = []
                for result in results:
                    alert = Alert.objects.create(
                        keyword=Keyword.objects.get(name=keyword),
                        url=result
                    )
                    alerts_obj.append(alert)

                send_data_leak_notifications_group(keyword, len(alerts_obj), alerts_obj)

    
    # now we check Pastebin for new pastes
    result = check_pastebin(keywords)

    if len(result.keys()):
        for url, keyword in result.items():
            print(str(timezone.now()) + " - Create alert for: ", keyword, "url: ", url)
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
        print(f"{timezone.now()} - No subscribers for Data Leak, no message sent.")
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
        print(f"{timezone.now()} - No subscribers for Data Leak group, no message sent.")
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
