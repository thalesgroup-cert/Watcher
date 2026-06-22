import requests
import logging
from django.conf import settings
from django.utils import timezone
from datetime import datetime

# Configure logger
logger = logging.getLogger('watcher.common')

def send_slack_message(content, channel, app_name):
    """
    Sends a message to the specified Slack channel.
    
    Args:
        content (str): The content of the message to send.
        channel (str): The Slack channel where the message will be sent.
    """
    
    if not settings.SLACK_API_TOKEN or not settings.SLACK_CHANNEL:
        logger.warning("No configuration for Slack, notifications disabled. Configure it in the '.env' file.")
        return

    url = 'https://slack.com/api/chat.postMessage'
    headers = {
        'Authorization': f'Bearer {settings.SLACK_API_TOKEN}',
        'Content-Type': 'application/json',
    }
    
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    payload = {
        'channel': channel,
        'text': f"[{timestamp}] {content}",
    }

    response = requests.post(url, headers=headers, json=payload)

    if response.status_code == 200:
        logger.info(f"Message sent to Slack successfully for {app_name}.")
    else:
        logger.error(f"Failed to send message to Slack: {response.status_code} - {response.text}")
