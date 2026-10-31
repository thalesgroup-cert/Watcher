from abc import ABC

from rest_framework import serializers
from .models import Source, TrendyWord, PostUrl, BannedWord, Summary, MonitoredKeyword, KeywordHit


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
    avatar = None
    if u:
        try:
            avatar_color = u.profile.avatar_color or None
            avatar = u.profile.avatar or None
        except Exception:
            pass
    return {
        'username': u.username if u else 'system',
        'first_name': u.first_name if u else '',
        'last_name': u.last_name if u else '',
        'avatar_color': avatar_color,
        'avatar': avatar,
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


class PostSerializer(serializers.ModelSerializer):
    class Meta:
        model = PostUrl
        fields = ['url', 'created_at']


class TrendyWordListSerializer(serializers.ModelSerializer):
    """Rows of the trend list: the articles are counted (annotated by the viewset), not listed."""
    posts_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = TrendyWord
        fields = ['id', 'name', 'occurrences', 'score', 'created_at', 'posts_count']


class TrendyWordDetailSerializer(TrendyWordListSerializer):
    """One trending word with its articles, newest first, and whether it is also a monitored keyword."""
    posts = serializers.SerializerMethodField()
    monitored = serializers.SerializerMethodField()

    class Meta(TrendyWordListSerializer.Meta):
        fields = TrendyWordListSerializer.Meta.fields + ['posts', 'monitored']

    def get_posts(self, obj):
        return PostSerializer(obj.posturls.order_by('-created_at'), many=True).data

    def get_monitored(self, obj):
        return MonitoredKeyword.objects.filter(name__iexact=obj.name).exists()


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
    posts = serializers.SerializerMethodField()
    last_event = serializers.SerializerMethodField()
    # Annotated by MonitoredKeywordViewSet.get_queryset
    posts_count = serializers.IntegerField(read_only=True)
    hits_count = serializers.IntegerField(read_only=True, default=0)
    open_hits_count = serializers.IntegerField(read_only=True, default=0)
    is_rule = serializers.BooleanField(read_only=True)

    @staticmethod
    def _words(value):
        if not isinstance(value, list) or not all(isinstance(word, str) for word in value):
            raise serializers.ValidationError("A list of words is expected")
        words = [word.strip() for word in value if word.strip()]
        if len(words) > 50 or any(len(word) > 150 for word in words):
            raise serializers.ValidationError("At most 50 words of 150 characters")
        return words

    def validate_all_of(self, value):
        return self._words(value)

    def validate_any_of(self, value):
        return self._words(value)

    def validate_exceptions(self, value):
        return self._words(value)

    def get_posturls(self, obj):
        return ['%s,%s' % (p.url, p.created_at) for p in obj.posturls.all()]

    def get_posts(self, obj):
        return PostSerializer(obj.posturls.order_by('-created_at'), many=True).data

    def get_last_event(self, obj):
        return _get_last_event(obj)

    class Meta:
        model = MonitoredKeyword
        fields = ['id', 'name', 'level', 'level_display', 'threshold', 'last_seen',
                  'occurrences', 'posturls', 'posts', 'posts_count', 'created_at', 'last_event',
                  'all_of', 'any_of', 'exceptions', 'whole_words', 'is_active', 'is_rule', 'hits_count',
                  'open_hits_count']


class MonitoredKeywordListSerializer(MonitoredKeywordSerializer):
    """Rows of the keyword list: the articles are counted, not listed."""

    class Meta(MonitoredKeywordSerializer.Meta):
        fields = ['id', 'name', 'level', 'level_display', 'threshold', 'last_seen',
                  'occurrences', 'posts_count', 'created_at', 'last_event',
                  'all_of', 'any_of', 'exceptions', 'whole_words', 'is_active', 'is_rule', 'hits_count',
                  'open_hits_count']


class KeywordHitSerializer(serializers.ModelSerializer):
    keyword_name = serializers.CharField(source='keyword.name', read_only=True)

    class Meta:
        model = KeywordHit
        fields = ['id', 'keyword', 'keyword_name', 'url', 'title', 'matched', 'hit_at', 'is_archived']
        read_only_fields = ['keyword', 'url', 'title', 'matched', 'hit_at']
