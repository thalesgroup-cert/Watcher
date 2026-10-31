import re

from ..core import get_all_connectors
from ..models import NotificationSetting
from . import template
from .catalogue import CHANNELS, CHANNEL_CONNECTORS, render_text, render_title
from .registry import all_types, get_type

UNSET = object()  # "leave as it is", where None means "back to the default"

_DOTTED = re.compile(r'\{([A-Za-z_]\w*(?:\.\w+)+)\}')
_SCALARS = (str, int, float, bool, type(None))
# Context entries that are plumbing, not something a message says.
_HIDDEN_VARIABLES = {'app_name', 'alert_data', 'notification_type', 'event_summary'}


def _row(type_id, channel):
    return NotificationSetting.objects.filter(notification_type=type_id, channel=channel).first()


def _setting(ntype, channel, row):
    defaults = ntype.default_fields(channel)
    if row is None:
        return False, defaults
    if row.selected_fields is None:
        return row.enabled, defaults
    chosen = [f.id for f in ntype.fields_for(channel) if f.required or f.id in row.selected_fields]
    return row.enabled, chosen


def get_setting(type_id, channel):
    """(enabled, ids of the fields shown) of a notification on a channel. No row yet: off, every field."""
    ntype = get_type(type_id)
    return _setting(ntype, channel, _row(type_id, channel))


def is_enabled(type_id, channel):
    return get_setting(type_id, channel)[0]


def check_fields(ntype, channel, fields):
    """Ids to show, in catalogue order. Raises ValueError for anything the catalogue does not allow."""
    if not isinstance(fields, list) or not all(isinstance(i, str) for i in fields):
        raise ValueError("'fields' must be a list of field ids")
    available = ntype.fields_for(channel)
    if not available:
        if fields:
            raise ValueError(f"'{ntype.id}' on {channel} has no fields to choose")
        return []
    unknown = sorted(set(fields) - {f.id for f in available})
    if unknown:
        raise ValueError(f"Unknown field(s): {', '.join(unknown)}")
    missing = [f.id for f in available if f.required and f.id not in fields]
    if missing:
        raise ValueError(f"Required field(s) cannot be removed: {', '.join(missing)}")
    return [f.id for f in available if f.id in fields]


def default_template(ntype, channel, selected=None):
    """The message of the catalogue as editable text: the starting point of a message written by hand."""
    layout = ntype.layouts[channel]
    ids = ntype.default_fields(channel) if selected is None else selected
    return layout.head + ''.join(f.line(channel) for f in ntype.fields_for(channel) if f.id in ids) + layout.tail


def default_title(ntype, channel):
    """Title of the TheHive alert or subject of the email, as the catalogue has it ('' when the channel has none)."""
    if channel == 'thehive':
        layout = ntype.layouts.get('thehive')
        return layout.title if layout else ''
    if channel == 'email' and ntype.email:
        return ntype.email.subject
    return ''


def variables(ntype):
    """What a message of this notification can read: [{'name', 'sample'}], from the fictional sample."""
    ctx = ntype.sample()
    names = {k for k, v in ctx.items() if isinstance(v, _SCALARS) and k not in _HIDDEN_VARIABLES}
    texts = [default_title(ntype, c) for c in ('thehive', 'email')]
    for layout in ntype.layouts.values():
        texts += [layout.head, layout.tail, layout.title]
    if ntype.thehive_per_alert:
        texts += [ntype.thehive_per_alert.head, ntype.thehive_per_alert.title]
    for f in ntype.fields:
        texts += [f.line(c) or '' for c in ('slack', 'citadel', 'thehive')]
    for text in texts:
        names.update(_DOTTED.findall(text))
    return [{'name': n, 'sample': _sample_text(template.resolve(ctx, n))} for n in sorted(names)]


def _sample_text(value):
    if value is None:
        return ''
    text = str(value)
    return text if len(text) <= 80 else text[:77] + '...'


def _allowed(ntype):
    return {v['name'] for v in variables(ntype)}


def save_setting(type_id, channel, enabled=None, fields=None, template_text=UNSET, title=UNSET):
    """
    Switch a notification on or off on a channel, choose the fields of its message, or replace its message (and the
    title of the TheHive alert or subject of the email) with text written by hand. None as `template_text` or `title`
    goes back to the catalogue's. Returns what is stored.
    KeyError: unknown notification or channel. ValueError: the notification has no such message, or a bad value.
    """
    ntype = get_type(type_id)
    if channel not in CHANNELS:
        raise KeyError(f"Channel '{channel}' not found")
    if channel not in ntype.channels:
        raise ValueError(f"'{type_id}' has no {channel} message")
    if enabled is not None and not isinstance(enabled, bool):
        raise ValueError("'enabled' must be true or false")
    chosen = None if fields is None else check_fields(ntype, channel, fields)
    new_template = _check_template(ntype, channel, template_text)
    new_title = _check_title(channel, ntype, title)

    row, _ = NotificationSetting.objects.get_or_create(notification_type=type_id, channel=channel)
    if enabled is not None:
        row.enabled = enabled
    if chosen is not None:
        # Kept as "not chosen" when it is the default, so fields added to the catalogue later show up by themselves.
        row.selected_fields = None if chosen == ntype.default_fields(channel) else chosen
    if template_text is not UNSET:
        row.custom_template = new_template
    if title is not UNSET:
        row.custom_title = new_title
    row.save()
    return get_setting(type_id, channel)


def _check_template(ntype, channel, text):
    if text is UNSET or text is None:
        return None
    if channel == 'email':
        raise ValueError("The body of the email is fixed; only its subject can be changed")
    template.validate(text, _allowed(ntype))
    return text


def _check_title(channel, ntype, text):
    if text is UNSET or text is None:
        return None
    if channel not in ('thehive', 'email'):
        raise ValueError(f"A {channel} message has no title")
    if not isinstance(text, str) or not text.strip() or '\n' in text:
        raise ValueError("The title must be a single, non-empty line")
    template.validate(text, _allowed(ntype))
    return text.strip()


def render_message(type_id, channel, ctx):
    """Text of a notification on Slack, Citadel or TheHive (description), with the fields saved in the settings."""
    ntype = get_type(type_id)
    row = _row(type_id, channel)
    if row is not None and row.custom_template:
        return template.render(row.custom_template, ctx)
    return render_text(ntype, channel, ctx, _setting(ntype, channel, row)[1])


def render_thehive_title(type_id, ctx):
    row = _row(type_id, 'thehive')
    if row is not None and row.custom_title:
        return template.render(row.custom_title, ctx)
    return render_title(get_type(type_id), ctx)


def render_per_alert(type_id, ctx):
    """(title, description) of the fixed TheHive alert opened for each alert of a group notification."""
    layout = get_type(type_id).thehive_per_alert
    # The description goes through the template engine: a row whose value is missing is left out
    return layout.title.format(**ctx), template.render(layout.head, {'object_url': ctx.get('details_url'), **ctx})


def email_subject(type_id, ctx):
    row = _row(type_id, 'email')
    if row is not None and row.custom_title:
        return template.render(row.custom_title, ctx)
    return get_type(type_id).email.subject.format(**ctx)


def thehive_meta(type_id):
    return get_type(type_id).thehive_meta


def _describe(ntype, connectors, rows):
    channels = {}
    shared_variables = variables(ntype)
    for channel in ntype.channels:
        row = rows.get((ntype.id, channel))
        enabled, selected = _setting(ntype, channel, row)
        connector_id = CHANNEL_CONNECTORS[channel]
        connector = connectors.get(connector_id, {})
        has_body = channel != 'email'
        has_title = channel in ('thehive', 'email')
        channels[channel] = {
            'enabled': enabled,
            'fields': selected,
            'available': [{'id': f.id, 'label': f.label, 'required': f.required} for f in ntype.fields_for(channel)],
            'template': row.custom_template if row else None,
            'default_template': default_template(ntype, channel, selected) if has_body else None,
            'title': row.custom_title if row else None,
            'default_title': default_title(ntype, channel) if has_title else None,
            'variables': shared_variables,
            'connector': {
                'id': connector_id,
                'status': connector.get('status', 'disabled'),
                'health': (connector.get('health') or {}).get('status', 'unknown'),
            },
        }
    return {'id': ntype.id, 'label': ntype.label, 'module': ntype.module, 'channels': channels}


def _rows(type_ids=None):
    queryset = NotificationSetting.objects.all()
    if type_ids is not None:
        queryset = queryset.filter(notification_type__in=type_ids)
    return {(r.notification_type, r.channel): r for r in queryset}


def describe(type_id):
    """One notification as the API shows it: its channels, what is on, the fields, the state of each connector."""
    connectors = {c['id']: c for c in get_all_connectors()}
    return _describe(get_type(type_id), connectors, _rows([type_id]))


def describe_all():
    connectors = {c['id']: c for c in get_all_connectors()}
    rows = _rows()
    return [_describe(ntype, connectors, rows) for ntype in all_types()]


def preview(type_id, channel, fields=None, template_text=UNSET, title=UNSET):
    """
    The message of a notification on a channel, built from the fictional sample, as it would be sent. `fields` are the
    ids to show (None: the saved ones); `template_text` and `title` are a message not saved yet (None: the catalogue's;
    left out: the saved one). Saves and sends nothing. Same errors as `save_setting`.
    """
    ntype = get_type(type_id)
    if channel not in CHANNELS:
        raise KeyError(f"Channel '{channel}' not found")
    if channel not in ntype.channels:
        raise ValueError(f"'{type_id}' has no {channel} message")
    ctx = ntype.sample()
    row = _row(type_id, channel)
    custom_title = row.custom_title if row else None
    if title is not UNSET:
        custom_title = _check_title(channel, ntype, title)

    if channel == 'email':
        subject = template.render(custom_title, ctx) if custom_title else ntype.email.subject.format(**ctx)
        return {'kind': 'html', 'format': 'html', 'title': subject, 'content': ntype.email.sample_body(ctx)}

    custom = row.custom_template if row else None
    if template_text is not UNSET:
        custom = _check_template(ntype, channel, template_text)
    if custom:
        content = template.render(custom, ctx)
    else:
        selected = _setting(ntype, channel, row)[1] if fields is None else check_fields(ntype, channel, fields)
        content = render_text(ntype, channel, ctx, selected)
    if channel == 'citadel':
        # The sender turns newlines into <br> before posting the HTML.
        return {'kind': 'html', 'format': 'html', 'content': content.replace('\n', '<br>')}
    result = {'kind': 'text', 'format': 'markdown' if channel == 'thehive' else 'slack', 'content': content}
    if channel == 'thehive':
        result['title'] = template.render(custom_title, ctx) if custom_title else render_title(ntype, ctx)
    return result
