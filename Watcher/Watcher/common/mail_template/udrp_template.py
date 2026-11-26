import html

from .base import Raw, link_to, render_email


def get_udrp_template(site, decision, label, today, link_url=None):
    """
    Email of a UDRP decision.

    :param site: The Site instance concerned by the decision.
    :param decision: 'won' or 'lost'.
    :param label: Human-readable label for the decision.
    :param today: ISO date string of the decision date.
    """
    won = decision == 'won'
    colour = '#38a169' if won else '#e53e3e'
    icon = '✅' if won else '❌'
    domain = html.escape(site.domain_name.replace('.', '[.]'))

    transfer_note = ''
    if won:
        transfer_note = (
            '<p style="color:#38a169;font-weight:bold;">'
            'This domain has been automatically added to the Legitimate Domains list.</p>'
        )

    return render_email(
        title="UDRP Decision",
        intro="A UDRP decision was detected for a domain monitored in Site Monitoring.",
        rows=[
            ('Domain', Raw(f'<span style="font-family:monospace;">{domain}</span>')),
            ('Decision', Raw(f'<span style="color:{colour};font-weight:bold;">{icon} {html.escape(label)}</span>')),
            ('Date', today),
            ('Ticket', site.ticket_id),
            ('Source', Raw('<a href="https://www.wipo.int/amc/en/domains/search/">WIPO UDRP Database</a>')),
        ],
        blocks=transfer_note,
        link=link_url or link_to('website_monitoring'),
    )
