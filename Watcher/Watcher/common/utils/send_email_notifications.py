from django.core.mail import EmailMessage
from datetime import datetime
from django.conf import settings
from django.utils import timezone

def send_email_notifications(subject, body, emails_to, app_name):
    """
    Sends email notifications using Django EmailMessage.

    Args:
        subject (str): The subject of the email.
        body (str): The HTML content of the email.
        emails_to (list): List of recipients.
        app_name (str): The name of the sending application.
    """

    if not settings.EMAIL_HOST or not settings.EMAIL_FROM:
        print(f"{str(timezone.now())} - No configuration for Email, notifications disabled. Configure it in the '.env' file.")
        return

    # Filter valid email addresses
    emails_to = [email if isinstance(email, str) else getattr(email, 'email', None) for email in emails_to]
    emails_to = [email for email in emails_to if email] 

    if not emails_to:
        print(f"{datetime.now()} - No valid recipients for {app_name}.")
        return

    try:
        # Create the email
        email = EmailMessage(
            subject=f"{subject}",
            body=body,
            from_email=settings.EMAIL_FROM,
            to=emails_to,
        )
        email.content_subtype = "html" 
        email.send(fail_silently=False)
        print(f"{datetime.now()} - Email successfully sent for {app_name}.")
    except Exception as e:
        print(f"{datetime.now()} - Failed to send email for {app_name}: {e}")