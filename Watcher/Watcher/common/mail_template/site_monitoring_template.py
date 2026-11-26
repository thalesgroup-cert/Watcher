from .base import link_to, render_email


def _joined(value):
    """DNS records are stored as a list; a table cell shows them on one line."""
    if isinstance(value, (list, tuple)):
        return ', '.join(str(item) for item in value)
    return value


def get_site_monitoring_template(website_status, website_url, alert_id, link_url=None):
    """
    Email of a change on a monitored domain.

    :param website_status: the domain name.
    :param website_url: unused, kept for the callers.
    :param alert_id: the alert data: its type and the old and new values; the missing ones are left out.
    """
    data = alert_id or {}
    rows = [('Domain', str(website_status).replace('.', '[.]'))]
    for label, key in (
        ('Content difference score', 'difference_score'),
        ('New IP address', 'new_ip'), ('Previous IP address', 'old_ip'),
        ('New second IP address', 'new_ip_second'), ('Previous second IP address', 'old_ip_second'),
        ('New MX records', 'new_MX_records'), ('Previous MX records', 'old_MX_records'),
        ('New mail server address', 'new_mail_A_record_ip'), ('Previous mail server address', 'old_mail_A_record_ip'),
    ):
        rows.append((label, _joined(data.get(key))))
    return render_email(
        title="Website Monitoring",
        intro=f"{data.get('type') or 'A change was detected'} on a monitored domain.",
        rows=rows,
        link=link_url or link_to('website_monitoring'),
    )
