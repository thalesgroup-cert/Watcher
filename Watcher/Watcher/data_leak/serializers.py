from rest_framework import serializers
from .models import Alert, Keyword
import re
from urllib.parse import urlparse


def _get_last_event(obj):
    events = getattr(obj, '_timeline_events', None)
    if events is not None:
        event = events[0] if events else None
    else:
        event = obj.timeline_events.select_related('user__profile').first()
    if not event:
        return None
    u = event.user
    avatar_color = None
    avatar = None
    if u:
        try:
            avatar_color = u.profile.avatar_color or None
            avatar = u.profile.avatar or None
        except Exception:
            pass
    return {
        'username':    u.username if u else 'system',
        'first_name':  u.first_name if u else '',
        'last_name':   u.last_name if u else '',
        'avatar_color': avatar_color,
        'avatar': avatar,
        'action':      event.action,
        'timestamp':   event.timestamp,
    }


# Keyword Serializer
class KeywordSerializer(serializers.ModelSerializer):
    last_event = serializers.SerializerMethodField()
    # Annotated by KeywordViewSet.get_queryset (left out when the keyword comes from elsewhere)
    alerts_count = serializers.IntegerField(read_only=True)
    active_alerts_count = serializers.IntegerField(read_only=True)
    last_alert_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Keyword
        fields = ['id', 'name', 'is_regex', 'created_at', 'last_event',
                  'alerts_count', 'active_alerts_count', 'last_alert_at']

    def get_last_event(self, obj):
        return _get_last_event(obj)

    def validate(self, data):
        """
        Validate regex pattern if is_regex is True
        """
        # A PATCH may change only one of the two fields: check the pattern as it will be saved.
        is_regex = data.get('is_regex', getattr(self.instance, 'is_regex', False))
        name = data.get('name', getattr(self.instance, 'name', ''))
        if is_regex:
            try:
                re.compile(name)
            except re.error:
                raise serializers.ValidationError({
                    'name': 'Invalid regular expression pattern.'
                })
        return data


class AlertKeywordSerializer(serializers.ModelSerializer):
    class Meta:
        model = Keyword
        fields = ['id', 'name', 'is_regex']


def alert_source(url):
    """Host an alert was found on, e.g. `github.com`."""
    return urlparse(url or '').netloc.lower()


# Alert Serializer
class AlertSerializer(serializers.ModelSerializer):
    keyword = AlertKeywordSerializer(read_only=True)
    source = serializers.SerializerMethodField()

    class Meta:
        model = Alert
        fields = ['id', 'keyword', 'url', 'source', 'status', 'content', 'created_at']

    def get_source(self, obj):
        return alert_source(obj.url)


class AlertListSerializer(AlertSerializer):
    """Rows of the alert list: the raw content (pastes can be large) is only sent with a single alert."""
    has_content = serializers.SerializerMethodField()

    class Meta(AlertSerializer.Meta):
        fields = ['id', 'keyword', 'url', 'source', 'status', 'has_content', 'created_at']

    def get_has_content(self, obj):
        return bool(obj.content)
