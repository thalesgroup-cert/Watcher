import requests
import logging
from connectors.core import get_slack_config

# Configure logger
logger = logging.getLogger('watcher.common')


def send_slack_message(content, channel, app_name):
    """
    Sends a message to the specified Slack channel.

    Args:
        content (str): The content of the message to send.
        channel (str): The Slack channel where the message will be sent.
        app_name (str): The module the message comes from, for the log.
    """

    slack = get_slack_config()
    if not slack['token'] or not slack['channel']:
        logger.warning("No configuration for Slack, notifications disabled. Configure it in the '.env' file or the Connectors page.")
        return

    url = 'https://slack.com/api/chat.postMessage'
    headers = {
        'Authorization': f'Bearer {slack["token"]}',
        'Content-Type': 'application/json',
    }

    # Slack shows the time of every message: the text is sent as it is
    response = requests.post(url, headers=headers, json={'channel': channel, 'text': content}, timeout=15)

    # Slack answers 200 even when it refuses a message: the verdict is in the body
    try:
        accepted = response.status_code == 200 and response.json().get('ok', False)
    except ValueError:
        accepted = False

    if accepted:
        logger.info(f"Message sent to Slack successfully for {app_name}.")
    else:
        logger.error(f"Failed to send message to Slack: {response.status_code} - {response.text}")
