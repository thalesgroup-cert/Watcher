import requests
from django.conf import settings
from django.utils import timezone
from common.utils.update_thehive import handle_alert_or_case, create_new_alert
from site_monitoring.models import Site


def get_ticket_id_for_domain(domain_name):
    """
    Retrieve the ticket_id for a monitored domain from the Watcher database.

    :param domain_name: The domain name for which the ticket_id is being fetched.
    :return: ticket_id if domain is found, otherwise None.
    :rtype: str or None
    """
    try:
        domain = Site.objects.get(domain_name=domain_name)
        return domain.ticket_id
    except Site.DoesNotExist:
        print(f"{timezone.now()} - Domain {domain_name} not found in Watcher database.")
        return None
    except Exception as e:
        print(f"{timezone.now()} - Error while retrieving ticket_id for domain {domain_name}: {e}")
        return None


def post_to_thehive(url, data, headers, proxies):
    """
    Send a POST request to TheHive API and handle errors.

    :param url: The URL for TheHive API.
    :param data: The data to send in the POST request.
    :param headers: Headers to include in the request.
    :param proxies: Proxies to use for the request.
    :return: Response from TheHive as a JSON object if successful, None if failed.
    :rtype: dict or None
    """
    try:
        response = requests.post(url, headers=headers, json=data, verify=False, proxies=proxies)
        response.raise_for_status()  
        return response.json()
    except requests.exceptions.RequestException as e:
        return None


def send_thehive_alert(title, description, severity, tags, app_name, domain_name, observables=None, customFields=None, thehive_url=None, api_key=None):
    from common.core import generate_ref
    """
    Send or update an alert in TheHive based on the application and ticket_id.

    :param title: The title of the alert.
    :param description: The description of the alert.
    :param severity: The severity level of the alert (integer).
    :param tags: A list of tags associated with the alert.
    :param app_name: The application triggering the alert (e.g., 'website_monitoring').
    :param domain_name: The domain name related to the alert (used for ticket_id lookup).
    :param observables: Any observables (default is None).
    :param customFields: Custom fields for the alert (default is None).
    :param thehive_url: The URL of TheHive instance (default uses settings).
    :param api_key: The API key for authenticating with TheHive (default uses settings).
    :return: None
    :rtype: None
    """

    if not settings.THE_HIVE_KEY or not settings.THE_HIVE_URL:
        print(f"{str(timezone.now())} - No configuration for TheHive, notifications disabled. Configure it in the '.env' file.")
        return

    thehive_url = thehive_url or settings.THE_HIVE_URL
    api_key = api_key or settings.THE_HIVE_KEY

    ticket_id = None

    if app_name == 'website_monitoring' and domain_name:
        ticket_id = get_ticket_id_for_domain(domain_name)

    if ticket_id is None:
        ticket_id = generate_ref()

    if app_name == 'website_monitoring' and domain_name:
        site = Site.objects.get(domain_name=domain_name)
        site.ticket_id = ticket_id 
        site.save()

    if app_name == 'website_monitoring' and not ticket_id:
        return
    
    current_time = timezone.now().strftime("%H:%M:%S")
    current_date = timezone.now().strftime("%d/%m/%y")

    # Handle the alert for 'website_monitoring' if ticket_id is found
    if app_name == 'website_monitoring':
        handle_alert_or_case(
            ticket_id=ticket_id,
            title=title,
            description=description,
            severity=severity,
            tags=tags,
            app_name=app_name,
            observables=observables,
            customFields=customFields,
            comment=(
                f"A change was processed by {app_name} application at {current_time} on {current_date}.\n"
                "The associated observables have been handled in the dedicated section."
            ),
            thehive_url=thehive_url,
            api_key=api_key
        )

    # Create a new alert if the application is not 'website_monitoring'
    else:
        create_new_alert(
            ticket_id=ticket_id, 
            title=title,
            description=description,
            severity=severity,
            tags=tags,
            app_name=app_name,
            observables=observables,
            customFields=customFields,
            comment=(
                f"An alert was processed by {app_name} application at {current_time} on {current_date}.\n"
                "The associated observables have been handled in the dedicated section."
            ),
            thehive_url=thehive_url,
            api_key=api_key
        )
        