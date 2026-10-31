from .base import defang, link_to, render_email


def get_dns_finder_template(alert, link_url=None):
    """Email of a suspicious domain found by a permutation of a corporate domain."""
    twisted = alert.dns_twisted
    return render_email(
        title="DNS Threats Monitored",
        intro="A domain that looks like a corporate asset was detected.",
        rows=[
            ('Suspicious domain', defang(twisted.domain_name)),
            ('Matches corporate domain', defang(twisted.dns_monitored)),
            ('Matches corporate keyword', twisted.keyword_monitored),
            ('Detection method', twisted.fuzzer),
        ],
        link=link_url or link_to('dns_finder'),
    )
