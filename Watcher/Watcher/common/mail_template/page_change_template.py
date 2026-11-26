import html

from .base import render_email


def _lines(label, lines, more, colour):
    """A list of changed lines (text of a web page: escaped), or nothing."""
    if not lines:
        return ''
    items = ''.join(f'<li>{html.escape(line)}</li>' for line in lines)
    rest = f'<li><em>… and {more} more</em></li>' if more else ''
    return f'<p style="margin-bottom:4px;color:{colour};font-weight:bold;">{label}</p><ul class="block">{items}{rest}</ul>'


def get_page_change_template(ctx):
    """
    Email of a change of a monitored page.

    :param ctx: page_name, page_url, change_percent, added_lines, removed_lines, more_added, more_removed, details_url.
    """
    blocks = (_lines('Added', ctx.get('added_lines'), ctx.get('more_added'), '#38a169')
              + _lines('Removed', ctx.get('removed_lines'), ctx.get('more_removed'), '#e53e3e'))
    return render_email(
        title="Monitored page change",
        intro="A web page monitored in Website Monitoring changed.",
        rows=[('Page', ctx.get('page_name')), ('URL', ctx.get('page_url')), ('Change', ctx.get('change_percent'))],
        blocks=blocks,
        link=ctx.get('details_url'),
    )
