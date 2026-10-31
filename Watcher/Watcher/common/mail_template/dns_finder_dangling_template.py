from .base import defang, link_to, render_email


def get_dns_finder_dangling_template(alert, link_url=None):
    from common.core import DANGLING_STATUS_DETAILS

    dns_twisted = alert.dns_twisted
    takeover_status = 'Suspected' if alert.status == 'suspected' else 'Confirmed'
    return render_email(
        title="Subdomain Takeover",
        intro="A monitored subdomain points to a resource that someone else may be able to claim.",
        rows=[
            ('Status', DANGLING_STATUS_DETAILS[takeover_status]),
            ('Subdomain', defang(dns_twisted.domain_name)),
            ('Corporate domain', defang(dns_twisted.dns_monitored)),
            ('CNAME target', defang(dns_twisted.cname_target)),
            ('Provider', dns_twisted.provider),
        ],
        link=link_url or link_to('dns_finder'),
    )
