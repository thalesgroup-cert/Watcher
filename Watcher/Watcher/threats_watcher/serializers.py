from abc import ABC

from rest_framework import serializers
from .models import Source, TrendyWord, PostUrl, BannedWord, Summary, MonitoredKeyword


class TrackListingField(serializers.RelatedField, ABC):
    queryset = PostUrl.objects.all()

    def to_representation(self, value):
        return '%s,%s' % (value.url, value.created_at)


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
        'username': u.username if u else 'system',
        'first_name': u.first_name if u else '',
        'last_name': u.last_name if u else '',
        'avatar_color': avatar_color,
        'action': event.action,
        'timestamp': event.timestamp,
    }


# Source Serializer
class SourceSerializer(serializers.ModelSerializer):
    last_event = serializers.SerializerMethodField()

    def get_last_event(self, obj):
        return _get_last_event(obj)

    class Meta:
        model = Source
        fields = ['id', 'url', 'confident', 'country', 'country_code', 'last_status_code', 'last_checked', 'created_at', 'last_event']


class TrendyWordSerializer(serializers.ModelSerializer):
    posturls = TrackListingField(many=True)

    class Meta:
        model = TrendyWord
        fields = '__all__'


# BannedWord Serializer
class BannedWordSerializer(serializers.ModelSerializer):
    last_event = serializers.SerializerMethodField()

    def get_last_event(self, obj):
        return _get_last_event(obj)

    class Meta:
        model = BannedWord
        fields = ['id', 'name', 'created_at', 'last_event']

# Summary Serializer
class SummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Summary
        fields = '__all__'


# MonitoredKeyword Serializer
class MonitoredKeywordSerializer(serializers.ModelSerializer):
    level_display = serializers.CharField(source='get_level_display', read_only=True)
    posturls = serializers.SerializerMethodField()
    last_event = serializers.SerializerMethodField()

    def get_posturls(self, obj):
        return ['%s,%s' % (p.url, p.created_at) for p in obj.posturls.all()]

    def get_last_event(self, obj):
        return _get_last_event(obj)

    class Meta:
        model = MonitoredKeyword
        fields = ['id', 'name', 'level', 'level_display', 'threshold', 'last_seen',
                  'occurrences', 'posturls', 'created_at', 'last_event']