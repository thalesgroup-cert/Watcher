from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import smtplib
from django.conf import settings
from datetime import datetime


def send_email_notifications(subject, body, emails_to, app_name):
    """
    Send e-mail notifications to the list of recipients.
    
    Args:
        subject (str): Subject of the email.
        body (str): HTML body content of the email.
        emails_to (list): List of recipient emails.
        app_name (str): Name of the application sending the notification.
    """

    emails_to = [str(email) for email in emails_to if isinstance(email, str) or hasattr(email, 'email')]

    try:
        msg = MIMEMultipart()
        msg['From'] = settings.EMAIL_FROM
        msg['To'] = ','.join(emails_to) 
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'html', _charset='utf-8'))
        text = msg.as_string()
        
        smtp_server = smtplib.SMTP(settings.SMTP_SERVER)
        smtp_server.sendmail(settings.EMAIL_FROM, emails_to, text)
        smtp_server.quit()
        
        print(f"{datetime.now()} - Email sent successfully for {app_name}.")
        
    except Exception as e:
        print(f"{datetime.now()} - Failed to send email: {str(e)}")
