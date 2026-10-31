from .base import link_to, render_email


def get_dns_finder_cert_transparency_template(alert, link_url=None):
    """Email of a certificate issued for a domain that contains a corporate keyword."""
    twisted = alert.dns_twisted
    return render_email(
        title="DNS Threats Monitored",
        intro="A certificate was issued for a domain that contains a corporate keyword.",
        rows=[
            ('Suspicious domain', str(twisted.domain_name).replace('.', '[.]')),
            ('Matches corporate keyword', twisted.keyword_monitored),
        ],
        link=link_url or link_to('dns_finder'),
    )
