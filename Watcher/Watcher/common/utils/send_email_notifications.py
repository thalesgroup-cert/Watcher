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
    # Check SMTP and email configuration
    if not settings.SMTP_SERVER or not settings.EMAIL_FROM:
        print(f"{str(timezone.now())} - [ERROR] Missing SMTP or EMAIL_FROM configuration.")
        print("Ensure SMTP_SERVER and EMAIL_FROM are set in the '.env' file.")
        return

    # Filter valid email addresses
    print(f"{datetime.now()} - [INFO] Initial recipient list: {emails_to}")
    emails_to = [email if isinstance(email, str) else getattr(email, 'email', None) for email in emails_to]
    emails_to = [email for email in emails_to if email]
    print(f"{datetime.now()} - [INFO] Valid recipient list after filtering: {emails_to}")

    if not emails_to:
        print(f"{datetime.now()} - [WARNING] No valid recipients for {app_name}.")
        return

    try:
        # Create and send the email
        print(f"{datetime.now()} - [INFO] Sending email...")
        print(f"Subject: {subject}")
        print(f"From: {settings.EMAIL_FROM}")
        print(f"To: {emails_to}")
        print(f"Email body preview: {body[:100]}... (truncated to 100 characters)")

        email = EmailMessage(
            subject=f"{subject}",
            body=body,
            from_email=settings.EMAIL_FROM,
            to=emails_to,
        )
        email.content_subtype = "html"  # Specify that the content is HTML
        email.send(fail_silently=False)
        print(f"{datetime.now()} - [SUCCESS] Email sent successfully for {app_name}.")
    except Exception as e:
        print(f"{datetime.now()} - [ERROR] Failed to send email for {app_name}.")
        print(f"Exception: {e}")
