from rest_framework import serializers
from .models import TimelineEvent


class TimelineEventSerializer(serializers.ModelSerializer):
    username = serializers.SerializerMethodField()
    first_name = serializers.SerializerMethodField()
    last_name = serializers.SerializerMethodField()
    avatar_color = serializers.SerializerMethodField()
    action_label = serializers.SerializerMethodField()

    class Meta:
        model = TimelineEvent
        fields = [
            'id',
            'action',
            'action_label',
            'user',
            'username',
            'first_name',
            'last_name',
            'avatar_color',
            'timestamp',
            'diff',
            'object_repr',
        ]

    def get_username(self, obj):
        return obj.user.username if obj.user else 'system'

    def get_first_name(self, obj):
        return obj.user.first_name if obj.user else ''

    def get_last_name(self, obj):
        return obj.user.last_name if obj.user else ''

    def get_avatar_color(self, obj):
        if not obj.user:
            return None
        try:
            return obj.user.profile.avatar_color or None
        except Exception:
            return None

    def get_action_label(self, obj):
        return obj.get_action_display()
