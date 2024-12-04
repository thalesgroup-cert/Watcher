import requests
from django.conf import settings
from django.utils import timezone

def send_slack_message(content, channel, app_name):
    """
    Sends a message to the specified Slack channel.
    
    Args:
        content (str): The content of the message to send.
        channel (str): The Slack channel where the message will be sent.
    """
    
    # if not settings.SLACK_API_TOKEN or not settings.SLACK_CHANNEL:
    if not settings.SLACK_API_TOKEN or not settings.SLACK_CHANNEL:
        print("No configuration for Slack, not notifications sending")
        return

    url = 'https://slack.com/api/chat.postMessage'
    headers = {
        'Authorization': f'Bearer {settings.SLACK_API_TOKEN}',
        'Content-Type': 'application/json',
    }
    
    payload = {
        'channel': channel,
        'text': content,
    }

    response = requests.post(url, headers=headers, json=payload)

    if response.status_code == 200:
        print(f"{str(timezone.now())} - Message sent to Slack successfully for {app_name}.")
    else:
        print(f"{str(timezone.now())} - Failed to send message to Slack: {response.status_code} - {response.text}")
