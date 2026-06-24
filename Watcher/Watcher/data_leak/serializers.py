from rest_framework import serializers
from .models import Alert, Keyword
import re


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
    if u:
        try:
            avatar_color = u.profile.avatar_color or None
        except Exception:
            pass
    return {
        'username':    u.username if u else 'system',
        'first_name':  u.first_name if u else '',
        'last_name':   u.last_name if u else '',
        'avatar_color': avatar_color,
        'action':      event.action,
        'timestamp':   event.timestamp,
    }


# Keyword Serializer
class KeywordSerializer(serializers.ModelSerializer):
    last_event = serializers.SerializerMethodField()

    class Meta:
        model = Keyword
        fields = ['id', 'name', 'is_regex', 'created_at', 'last_event']

    def get_last_event(self, obj):
        return _get_last_event(obj)

    def validate(self, data):
        """
        Validate regex pattern if is_regex is True
        """
        if data.get('is_regex', False):
            try:
                re.compile(data['name'])
            except re.error:
                raise serializers.ValidationError({
                    'name': 'Invalid regular expression pattern.'
                })
        return data


# Alert Serializer
class AlertSerializer(serializers.ModelSerializer):
    keyword = KeywordSerializer()

    class Meta:
        model = Alert
        fields = '__all__'
