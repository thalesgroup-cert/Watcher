import requests
import logging
from django.conf import settings
from django.utils import timezone
from datetime import datetime

# Configure logger
logger = logging.getLogger('watcher.common')

def send_citadel_message(content, room_id, app_name):
    """
    Sends a message to the specified Citadel room.
    
    Args:
        content (dict): The content of the message (must contain 'msgtype' and 'body').
        room_id (str): The ID of the Citadel room to send the message to.
    """
    
    if not settings.CITADEL_API_TOKEN or not settings.CITADEL_ROOM_ID:
        logger.warning("No configuration for Citadel, notifications disabled. Configure it in the '.env' file.")
        return

    url = f"{settings.CITADEL_URL}/_matrix/client/r0/rooms/{room_id}/send/m.room.message"

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {settings.CITADEL_API_TOKEN}',
    }

    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    body = content.get('body', '')
    formatted_body = content.get('formatted_body', None)

    payload = {
        'msgtype': content.get('msgtype', 'm.text'),
        'body': f"[{timestamp}] {body}",
        'format': content.get('format', None),
        'formatted_body': f"<b>[{timestamp}]</b> {formatted_body}" if formatted_body else None,
    }

    response = requests.post(url, headers=headers, json=payload)

    if response.status_code == 200:
        logger.info(f"Message sent to Citadel successfully for {app_name}.")
    else:
        logger.error(f"Failed to send message to Citadel: {response.status_code} - {response.text}")