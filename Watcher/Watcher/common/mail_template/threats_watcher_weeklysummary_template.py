import html

from .base import link_to, render_email


def get_threats_watcher_weeklysummary_template(summary_text, link_url=None):
    summary_html = html.escape(summary_text).replace('\n', '<br>')
    return render_email(
        title="Weekly Threat Intelligence",
        intro="Here is the weekly threat intelligence summary.",
        blocks=f'<div class="block">{summary_html}</div>',
        link=link_url or link_to(''),
    )
