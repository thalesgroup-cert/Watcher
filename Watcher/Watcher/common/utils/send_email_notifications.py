import logging
from django.core.mail import EmailMessage, get_connection
from datetime import datetime
from django.utils import timezone
from connectors.core import get_smtp_config

# Configure logger
logger = logging.getLogger('watcher.common')

def send_email_notifications(subject, body, emails_to, app_name):
    """
    Sends email notifications using Django EmailMessage.

    Args:
        subject (str): The subject of the email.
        body (str): The HTML content of the email.
        emails_to (list): List of recipients.
        app_name (str): The name of the sending application.
    """

    smtp = get_smtp_config()

    if not smtp['host'] or not smtp['from_email']:
        logger.warning("No configuration for Email, notifications disabled. Configure it in the '.env' file or the Connectors page.")
        return

    # Filter valid email addresses
    emails_to = [email if isinstance(email, str) else getattr(email, 'email', None) for email in emails_to]
    emails_to = [email for email in emails_to if email]

    if not emails_to:
        logger.warning(f"No valid recipients for {app_name}.")
        return

    try:
        connection = get_connection(
            host=smtp['host'],
            port=smtp['port'],
            username=smtp['user'],
            password=smtp['password'],
            use_tls=smtp['use_tls'],
            use_ssl=smtp['use_ssl'],
        )
        # Create the email
        email = EmailMessage(
            subject=f"{subject}",
            body=body,
            from_email=smtp['from_email'],
            to=emails_to,
            connection=connection,
        )
        email.content_subtype = "html"
        email.send(fail_silently=False)
        logger.info(f"Email successfully sent for {app_name}.")
    except Exception as e:
        logger.error(f"Failed to send email for {app_name}: {e}")