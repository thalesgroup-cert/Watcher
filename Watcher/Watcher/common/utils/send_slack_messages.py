import requests
import logging
from django.utils import timezone
from datetime import datetime
from connectors.core import get_slack_config

# Configure logger
logger = logging.getLogger('watcher.common')

def send_slack_message(content, channel, app_name, attachments=None):
    """
    Sends a message to the specified Slack channel.

    Args:
        content (str): The content of the message to send.
        channel (str): The Slack channel where the message will be sent.
        app_name (str): The app name.
        attachments (list, optional): JSON array for rich formatting (Block Kit).
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
    
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    payload = {
        'channel': channel,
        'text': f"[{timestamp}] {content}",
    }

    if attachments:
        payload['attachments'] = attachments

    response = requests.post(url, headers=headers, json=payload)

    if response.status_code == 200:
        logger.info(f"Message sent to Slack successfully for {app_name}.")
    else:
        logger.error(f"Failed to send message to Slack: {response.status_code} - {response.text}")
