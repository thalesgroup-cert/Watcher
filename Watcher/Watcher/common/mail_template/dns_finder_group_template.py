from .base import defang, link_to, render_email


def get_dns_finder_group_template(dns_monitored, alerts_number, link_url=None):
    corporate_domain = defang(dns_monitored.domain_name)
    return render_email(
        title="DNS Threats Monitored",
        intro=f"{alerts_number} new suspicious domains were detected for {corporate_domain}.",
        rows=[('Corporate domain', corporate_domain), ('New alerts', alerts_number)],
        link=link_url or link_to('dns_finder'),
    )
