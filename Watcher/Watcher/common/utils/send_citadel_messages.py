import logging
import threading
import time

import requests
from connectors.core import get_citadel_config

# Configure logger
logger = logging.getLogger('watcher.common')

# A Matrix server limits how fast a user may post (Synapse: a burst of 10 messages, then one every 5 seconds). The messages
# of every job go through one lock, a little apart, and a message refused with "Too Many Requests" is sent again once the
# server says it may (`retry_after_ms`), a few times, instead of being lost.
MIN_INTERVAL = 0.5
MAX_ATTEMPTS = 5
MAX_WAIT = 20.0
_lock = threading.Lock()
_last_sent = 0.0


def _retry_after(response):
    """Seconds the server asks us to wait after a 429 (2 seconds when it does not say), never more than MAX_WAIT."""
    try:
        wait = float(response.json().get('retry_after_ms', 2000)) / 1000
    except (ValueError, TypeError, AttributeError):
        wait = 2.0
    return min(max(wait, 0.2), MAX_WAIT)


def send_citadel_message(content, room_id, app_name):
    """
    Sends a message to the specified Citadel room.

    Args:
        content (dict): The content of the message (must contain 'msgtype' and 'body').
        room_id (str): The ID of the Citadel room to send the message to.

    Returns:
        (sent, reason): whether the message was accepted, and why not (empty when it was).
    """
    global _last_sent

    citadel = get_citadel_config()
    if not citadel['token'] or not citadel['room_id']:
        logger.warning("No configuration for Citadel, notifications disabled. Configure it in the '.env' file or the Connectors page.")
        return False, 'Citadel is not configured'

    url = f"{citadel['url']}/_matrix/client/r0/rooms/{room_id}/send/m.room.message"

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {citadel["token"]}',
    }

    # The room shows the time of every message: the text is sent as it is
    payload = {
        'msgtype': content.get('msgtype', 'm.text'),
        'body': content.get('body', ''),
        'format': content.get('format', None),
        'formatted_body': content.get('formatted_body', None),
    }

    with _lock:
        for attempt in range(1, MAX_ATTEMPTS + 1):
            pause = MIN_INTERVAL - (time.monotonic() - _last_sent)
            if pause > 0:
                time.sleep(pause)
            try:
                response = requests.post(url, headers=headers, json=payload, timeout=30)
            except requests.exceptions.RequestException as exc:
                logger.error(f"Failed to send message to Citadel for {app_name}: {type(exc).__name__}: {exc}")
                return False, f'{type(exc).__name__}'
            finally:
                _last_sent = time.monotonic()

            if response.status_code == 200:
                logger.info(f"Message sent to Citadel successfully for {app_name}.")
                return True, ''
            if response.status_code == 429 and attempt < MAX_ATTEMPTS:
                wait = _retry_after(response)
                logger.info(f"Citadel asks to slow down for {app_name}: sending again in {wait:.1f} s (attempt {attempt} of {MAX_ATTEMPTS}).")
                time.sleep(wait)
                continue
            logger.error(f"Failed to send message to Citadel: {response.status_code} - {response.text}")
            return False, f'{response.status_code}'
    return False, 'Failed'
