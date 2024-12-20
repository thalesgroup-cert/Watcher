import requests
from django.utils import timezone
from django.conf import settings


def search_thehive_for_ticket_id(watcher_id, thehive_url, api_key, item_type=None):
    """
    Search TheHive for an item (alert or case) based on customFields.<THE_HIVE_CUSTOM_FIELD>.

    :param watcher_id: The ID to search for.
    :param thehive_url: The URL of TheHive instance.
    :param api_key: The API key for authenticating with TheHive.
    :param item_type: The type of item to search for ("alert" or "case").
    :return: The type and the first result if found, else None, None.
    """
    headers = {'Content-Type': 'application/json', 'Authorization': f'Bearer {api_key}'}
    proxies = {"http": None, "https": None}

    query = {
        "query": [
            {"_name": f"list{item_type.capitalize()}"},
            {"_name": "filter", "_and": [
                {"_field": f"customFields.{settings.THE_HIVE_CUSTOM_FIELD}.string", "_value": watcher_id}
            ]}
        ]
    } if item_type else None

    if not query:
        return None, None

    url = f"{thehive_url}/api/v1/query"
    try:
        response = requests.post(url, headers=headers, json=query, verify=False, proxies=proxies)
        response.raise_for_status()
        results = response.json()

        if results:
            return item_type, results[0]
    except requests.exceptions.RequestException as e:
        print(f"{timezone.now()} - Error searching for {item_type} with {settings.THE_HIVE_CUSTOM_FIELD} {watcher_id}: {e}")
    
    return None, None


def add_observables_to_item(item_type, item_id, observables_data, thehive_url, api_key):
    """
    Add observables to an existing item (alert or case) in TheHive.

    :param item_type: The type of item ("alert" or "case").
    :param item_id: The ID of the item to add observables to.
    :param observables_data: A list of observables to add.
    :param thehive_url: The URL of TheHive instance.
    :param api_key: The API key for authenticating with TheHive.
    :return: None
    """
    url = f"{thehive_url}/api/v1/{item_type}/{item_id}/observable"
    headers = {'Content-Type': 'application/json', 'Authorization': f'Bearer {api_key}'}
    proxies = {"http": None, "https": None}
    
    added_observables = [] 

    for observable in observables_data:
        try:
            # Send a POST request to add each observable to the item
            response = requests.post(url, headers=headers, json=observable, verify=False, proxies=proxies)
            response.raise_for_status()
            added_observables.append(observable['data'])
        except requests.exceptions.RequestException as e:
            print(f"{timezone.now()} - Error while adding observable {observable['data']}: {e}")


def add_comment_to_item(item_type, item_id, comment, thehive_url, api_key):
    """
    Add a comment to an existing item (alert or case) in TheHive.

    :param item_type: The type of item ("alert" or "case").
    :param item_id: The ID of the item to add a comment to.
    :param comment: The comment to add to the item.
    :param thehive_url: The URL of TheHive instance.
    :param api_key: The API key for authenticating with TheHive.
    :return: None
    """
    url = f"{thehive_url}/api/v1/{item_type}/{item_id}/comment"
    headers = {'Content-Type': 'application/json', 'Authorization': f'Bearer {api_key}'}
    proxies = {"http": None, "https": None}
    data = {"message": comment}

    try:
        response = requests.post(url, headers=headers, json=data, verify=False, proxies=proxies)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"{timezone.now()} - Error while adding comment: {e}")


def create_observables(observables):
    """
    Format observables for TheHive API.

    :param observables: A list of raw observables.
    :return: A list of formatted observables ready for TheHive.
    :rtype: list
    """

    current_time = timezone.now().strftime("%H:%M:%S")
    current_date = timezone.now().strftime("%d/%m/%y")

    observables_data = []
    for obs in observables:
        observable_data = {
            "dataType": obs['dataType'],
            "data": obs['data'],
            "message": f"An observable was added on {current_date} at {current_time}.",
            "ioc": True,
            "sighted": True,
            "tlp": 2
        }
        observables_data.append(observable_data)
    return observables_data


def update_existing_alert_case(item_type, existing_item, observables, comment, thehive_url, api_key):
    """
    Update an existing alert or case by adding observables and a comment.

    :param item_type: The type of item ("alert" or "case").
    :param existing_item: The existing item to update.
    :param observables: The observables to add to the item.
    :param comment: The comment to add to the item.
    :param thehive_url: The URL of TheHive instance.
    :param api_key: The API key for authenticating with TheHive.
    :return: None
    """
    item_id = existing_item["_id"]
    
    if observables:
        observables_data = create_observables(observables)
        add_observables_to_item(item_type, item_id, observables_data, thehive_url, api_key)

    if comment:
        add_comment_to_item(item_type, item_id, comment, thehive_url, api_key)


def create_new_alert(ticket_id, title, description, severity, tags, app_name, observables, customFields, comment, thehive_url, api_key):
    from common.core import generate_ref
    """
    Create a new alert in TheHive with the provided details.

    :param ticket_id: The ticket ID for the new alert.
    :param title: The title of the alert.
    :param description: The description of the alert.
    :param severity: The severity level of the alert (integer).
    :param tags: A list of tags associated with the alert.
    :param app_name: The application triggering the alert.
    :param observables: A list of observables to associate with the alert.
    :param customFields: Custom fields to include in the alert.
    :param comment: The comment to add to the alert.
    :param thehive_url: The URL of TheHive instance.
    :param api_key: The API key for authenticating with TheHive.
    :return: The created alert if successful, None otherwise.
    :rtype: dict or None
    """
    if ticket_id is None:
        ticket_id = generate_ref()

    alert_data = {
        "title": title,
        "description": description,
        "severity": severity,
        "tags": tags,
        "type": app_name,
        "source": "watcher",
        "sourceRef": ticket_id,
        "customFields": customFields or {
            settings.THE_HIVE_CUSTOM_FIELD: {"string": ticket_id}, 
            "email-sender": {"string": settings.THE_HIVE_EMAIL_SENDER}
        }
    }

    headers = {'Content-Type': 'application/json', 'Authorization': f'Bearer {api_key}'}
    proxies = {"http": None, "https": None}

    url = f"{thehive_url}/api/v1/alert"
    try:
        response = requests.post(url, headers=headers, json=alert_data, verify=False, proxies=proxies)
        response.raise_for_status()
        alert = response.json()
        alert_id = alert.get('_id')
        print(f"{timezone.now()} - Alert successfully created on TheHive for {app_name}.")

        if observables:
            observables_data = create_observables(observables)
            add_observables_to_item("alert", alert_id, observables_data, thehive_url, api_key)

        if comment:
            add_comment_to_item("alert", alert_id, comment, thehive_url, api_key)

        return alert

    except requests.exceptions.RequestException as e:
        print(f"{timezone.now()} - Failed to create alert: {e}")
        return None


def handle_alert_or_case(ticket_id, observables, comment, title, description, severity, tags, app_name, customFields, thehive_url, api_key):
    """
    Handle the creation or updating of alerts and cases in TheHive.

    :param ticket_id: The ID of the ticket (can be used to search for existing alerts/cases).
    :param observables: A list of observables to add to the item.
    :param comment: A comment to add to the item.
    :param title: The title for the alert.
    :param description: The description for the alert.
    :param severity: The severity of the alert (integer).
    :param tags: A list of tags for the alert.
    :param app_name: The name of the application triggering the alert.
    :param customFields: Custom fields to be included in the alert.
    :param thehive_url: The URL of TheHive.
    :param api_key: The API key for authentication.
    :return: None
    """
    if app_name != 'website_monitoring':
        print(f"{timezone.now()} - Unsupported application: {app_name}.")
        return

    # Search in TheHive by customFields.<THE_HIVE_CUSTOM_FIELD>
    alert_type, alert_item = search_thehive_for_ticket_id(ticket_id, thehive_url, api_key, item_type="alert")
    case_type, case_item = search_thehive_for_ticket_id(ticket_id, thehive_url, api_key, item_type="case")

    if case_item:
        print(f"{timezone.now()} - Case found for {settings.THE_HIVE_CUSTOM_FIELD} {ticket_id}. Proceeding with update.")
        update_existing_alert_case("case", case_item, observables, comment, thehive_url, api_key)
    elif alert_item:
        print(f"{timezone.now()} - Alert found for {settings.THE_HIVE_CUSTOM_FIELD} {ticket_id}. Proceeding with update.")
        update_existing_alert_case("alert", alert_item, observables, comment, thehive_url, api_key)
    else:
        create_new_alert(
            ticket_id=ticket_id, title=title, description=description, severity=severity, 
            tags=tags, app_name=app_name, observables=observables, 
            customFields=customFields, comment=comment, thehive_url=thehive_url, api_key=api_key
        )