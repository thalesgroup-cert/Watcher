"""
The layout of every email Watcher sends: the header, one sentence on what happened, a table of facts, and a button
to the object in Watcher. A fact without a value is left out of the table.
"""
import html

from django.conf import settings

# What the modules write when they have nothing to say
_NO_VALUE = ('', 'none', 'n/a', 'unknown', '-')


class Raw(str):
    """A value that already is HTML (a coloured word, a link): it is not escaped."""


def has_value(value):
    return value is not None and str(value).strip().lower() not in _NO_VALUE


def defang(value):
    """A domain written so that no mail client turns it into a link: example[.]com. None when there is none."""
    text = '' if value is None else str(value).strip()
    return text.replace('.', '[.]') if has_value(text) else None


def _cell(value):
    if isinstance(value, Raw):
        return str(value)
    text = html.escape(str(value))
    if text.startswith(('http://', 'https://')):
        return f'<a href="{text}">{text}</a>'
    return text


def facts_table(rows):
    """`rows` are (label, value) pairs. Empty when no pair has a value."""
    lines = [
        f'<tr><td class="label">{html.escape(str(label))}</td><td class="value">{_cell(value)}</td></tr>'
        for label, value in rows if has_value(value)
    ]
    return '<table class="facts" width="100%">' + ''.join(lines) + '</table>' if lines else ''


def link_to(path):
    """The page of a module in Watcher, for the notifications that have no object to open."""
    return settings.WATCHER_URL.rstrip('/') + '/#/' + path.lstrip('/#')


_STYLE = """
body, p, table, td, div { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; line-height: 1.6; }
body { background-color: #f5f7fa; color: #2d3748; font-size: 14px; }
.container { width: 100%; max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 30px;
             overflow: hidden; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); }
.header { background: #00267F; padding: 30px 20px; text-align: center; }
.header h1 { color: #ffffff; font-size: 24px; font-weight: 600; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
.header img { width: 80px; height: auto; margin-bottom: 15px; }
.content { padding: 30px; }
.content p { margin-bottom: 18px; color: #4a5568; }
.facts { border-collapse: collapse; margin: 6px 0 22px; background: #f3f4f6; border-left: 4px solid #00267F; }
.facts td { padding: 8px 12px; vertical-align: top; font-size: 14px; border-bottom: 1px solid #e2e8f0; }
.facts tr:last-child td { border-bottom: none; }
.facts .label { width: 38%; color: #4a5568; font-weight: bold; }
.facts .value { color: #2d3748; word-break: break-word; }
.block { background: #f3f4f6; border-left: 4px solid #00267F; padding: 14px 16px; margin: 6px 0 22px; color: #2d3748; }
.button { display: inline-block; background: #00267F; color: #ffffff !important; text-decoration: none;
          padding: 10px 22px; border-radius: 6px; font-weight: bold; }
.footer { background: #58c3d7; padding: 24px 20px; text-align: center; }
.classification { text-align: center; font-size: 12px; color: #718096; margin-top: 20px; }
"""


def render_email(*, title, intro, rows=(), blocks='', link=None):
    """
    HTML body of an email.

    :param title: heading of the header band.
    :param intro: one sentence on what happened (plain text).
    :param rows: (label, value) pairs of the table of facts.
    :param blocks: HTML shown after the table (a summary, a list of words…).
    :param link: where the button leads (the object in Watcher when it is known).
    """
    button = f'<p><a class="button" href="{html.escape(link)}">Open in Watcher</a></p>' if link else ''
    return (
        '<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8">'
        f'<style>{_STYLE}</style></head><body>'
        '<table class="container" align="center">'
        f'<tr><td class="header"><img src="{settings.WATCHER_LOGO}" alt="Watcher"><h1>{html.escape(title)}</h1></td></tr>'
        f'<tr><td class="content"><p>{html.escape(intro)}</p>{facts_table(rows)}{blocks}{button}</td></tr>'
        '<tr><td class="footer"><a href="https://github.com/thalesgroup-cert/Watcher">'
        f'<img src="{settings.GITHUB_LOGO}" alt="GitHub"></a></td></tr>'
        '</table>'
        f'<p class="classification">[{settings.EMAIL_CLASSIFICATION}]</p>'
        '</body></html>'
    )
