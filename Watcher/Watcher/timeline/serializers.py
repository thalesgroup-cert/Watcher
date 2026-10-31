from rest_framework import serializers
from accounts.core import avatar_of
from .models import TimelineEvent


class TimelineEventSerializer(serializers.ModelSerializer):
    username = serializers.SerializerMethodField()
    first_name = serializers.SerializerMethodField()
    last_name = serializers.SerializerMethodField()
    avatar_color = serializers.SerializerMethodField()
    avatar = serializers.SerializerMethodField()
    action_label = serializers.SerializerMethodField()
    content_type = serializers.SerializerMethodField()

    class Meta:
        model = TimelineEvent
        fields = [
            'id',
            'content_type',
            'object_id',
            'action',
            'action_label',
            'user',
            'username',
            'first_name',
            'last_name',
            'avatar_color',
            'avatar',
            'timestamp',
            'diff',
            'object_repr',
        ]

    def get_content_type(self, obj):
        """`app_label.model`, the same form the history endpoint takes as a filter."""
        return f'{obj.content_type.app_label}.{obj.content_type.model}'

    def get_username(self, obj):
        return obj.user.username if obj.user else 'system'

    def get_first_name(self, obj):
        return obj.user.first_name if obj.user else ''

    def get_last_name(self, obj):
        return obj.user.last_name if obj.user else ''

    def get_avatar(self, obj):
        if not obj.user:
            return None
        return avatar_of(obj.user)

    def get_avatar_color(self, obj):
        if not obj.user:
            return None
        try:
            return obj.user.profile.avatar_color or None
        except Exception:
            return None

    def get_action_label(self, obj):
        return obj.get_action_display()
