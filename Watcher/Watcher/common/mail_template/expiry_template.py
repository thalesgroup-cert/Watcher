import html

from .base import Raw, link_to, render_email


def get_expiring_template(ctx, link_url=None):
    """Email of a legitimate domain whose registry-confirmed expiry date is close."""
    return render_email(
        title="Domain close to expiry",
        intro="A legitimate domain is about to expire. Its date was confirmed by the registry.",
        rows=[
            ('Domain', Raw(f'<span style="font-family:monospace;">{html.escape(ctx["domain_name_sanitized"])}</span>')),
            ('Expires on', ctx['expiry']),
            ('Days left', ctx['days_left']),
            ('Checked with the registry', ctx['checked']),
        ],
        link=link_url or link_to('legitimate_domains'),
    )


def get_regression_template(ctx, link_url=None):
    """Email of a legitimate domain whose expiry date the registry moved earlier."""
    return render_email(
        title="Expiry date moved earlier",
        intro="The registry gave the same earlier expiry date twice in a row, so Watcher wrote it. Check the domain.",
        rows=[
            ('Domain', Raw(f'<span style="font-family:monospace;">{html.escape(ctx["domain_name_sanitized"])}</span>')),
            ('Previous date', ctx['old_expiry']),
            ('New date', ctx['new_expiry']),
            ('Now', ctx['status_text']),
        ],
        link=link_url or link_to('legitimate_domains'),
    )


def get_site_expiring_template(ctx, link_url=None):
    """Email of a monitored website whose domain, confirmed by the registry, is close to expiry."""
    return render_email(
        title="Monitored website close to expiry",
        intro=("The domain of a monitored website is about to expire. Once it lapses it may become available: "
               "decide whether to register it before someone else does."),
        rows=[
            ('Domain', Raw(f'<span style="font-family:monospace;">{html.escape(ctx["domain_name_sanitized"])}</span>')),
            ('Legitimacy', ctx['legitimacy_label']),
            ('Expires on', ctx['expiry']),
            ('Days left', ctx['days_left']),
            ('Registrar', ctx['registrar']),
            ('Actions in progress', ctx['actions']),
            ('Ticket', ctx['ticket']),
            ('Checked with the registry', ctx['checked']),
        ],
        link=link_url or link_to('website_monitoring'),
    )


def get_site_available_template(ctx, link_url=None):
    """Email of a monitored website whose domain the registry no longer knows."""
    return render_email(
        title="Monitored website domain now available",
        intro=("The registry no longer knows the domain of a monitored website: it was registered and now it is available. "
               "Register it now if you want to keep it out of the attacker's hands."),
        rows=[
            ('Domain', Raw(f'<span style="font-family:monospace;">{html.escape(ctx["domain_name_sanitized"])}</span>')),
            ('Legitimacy', ctx['legitimacy_label']),
            ('Last registrar', ctx['registrar']),
            ('Last expiry date', ctx['expiry']),
            ('Actions in progress', ctx['actions']),
            ('Ticket', ctx['ticket']),
            ('Checked with the registry', ctx['checked']),
        ],
        link=link_url or link_to('website_monitoring'),
    )
