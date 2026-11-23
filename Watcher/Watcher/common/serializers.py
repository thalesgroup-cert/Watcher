from rest_framework import serializers
from .bulk import normalize_domain_data
from .models import LegitimateDomain, PendingAction, Screenshot

# Legitimate Domain Serializer
class LegitimateDomainSerializer(serializers.ModelSerializer):
    last_event = serializers.SerializerMethodField()
    # Whether a registry confirmed the expiry date lately (see LegitimateDomain.expiry_confirmed); the other fields tell where
    # the date comes from and what the last lookup said. All read-only: the job and the typing of the date set them.
    expiry_confirmed = serializers.BooleanField(read_only=True)

    class Meta:
        model = LegitimateDomain
        fields = [
            'id',
            'domain_name',
            'ticket_id',
            'contact',
            'created_at',
            'domain_created_at',
            'expiry',
            'expiry_source',
            'expiry_checked_at',
            'expiry_check',
            'expiry_confirmed',
            'ssl_expiry',
            'repurchased',
            'comments',
            'misp_event_uuid',
            'last_event',
        ]

    # A date typed by hand is nobody's verdict: it is marked as such and nothing waits for a registry any more
    TYPED_BY_HAND = {'expiry_source': 'manual', 'expiry_check': None, 'expiry_checked_at': None,
                     'expiry_pending': None, 'expiry_pending_source': None, 'expiry_pending_at': None}

    def create(self, validated_data):
        if validated_data.get('expiry'):
            validated_data.update(self.TYPED_BY_HAND)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if 'expiry' in validated_data and validated_data['expiry'] != instance.expiry:
            validated_data.update(self.TYPED_BY_HAND)
        return super().update(instance, validated_data)

    # The list is public (read-only for anonymous visitors); these fields are internal.
    INTERNAL_FIELDS = ('ticket_id', 'comments', 'misp_event_uuid', 'last_event')

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get('request')
        if request is not None and not request.user.is_authenticated:
            for name in self.INTERNAL_FIELDS:
                fields.pop(name, None)
        return fields

    def get_last_event(self, obj):
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

    def validate_domain_name(self, value):
        """
        Check if the domain already exists in Legitimate Domains
        """
        if self.instance is None:
            if LegitimateDomain.objects.filter(domain_name=value).exists():
                raise serializers.ValidationError(
                    f'{value} Already exists in Legitimate Domains'
                )
        else:
            current = getattr(self.instance, 'domain_name', None)
            if value != current and LegitimateDomain.objects.filter(domain_name=value).exists():
                raise serializers.ValidationError(
                    f'{value} Already exists in Legitimate Domains'
                )
        return value

    def to_internal_value(self, data):
        data = normalize_domain_data(data)
        # Convert "" to None for date fields
        if data.get("expiry") == "":
            data["expiry"] = None
        if data.get("domain_created_at") == "":
            data["domain_created_at"] = None
        if data.get("ssl_expiry") == "":
            data["ssl_expiry"] = None
        return super().to_internal_value(data)


# PendingAction Serializer
class PendingActionSerializer(serializers.ModelSerializer):
    resolved_by_username = serializers.SerializerMethodField()
    action_type_label = serializers.SerializerMethodField()

    class Meta:
        model = PendingAction
        fields = [
            'id',
            'action_type',
            'action_type_label',
            'status',
            'title',
            'description',
            'metadata',
            'created_at',
            'resolved_at',
            'resolved_by',
            'resolved_by_username',
        ]
        read_only_fields = ['id', 'created_at', 'resolved_at', 'resolved_by']

    def get_resolved_by_username(self, obj):
        return obj.resolved_by.username if obj.resolved_by else None

    def get_action_type_label(self, obj):
        return obj.get_action_type_display()


class ScreenshotSerializer(serializers.ModelSerializer):
    taken_by = serializers.CharField(source='taken_by.username', read_only=True, default=None)

    class Meta:
        model = Screenshot
        fields = ['id', 'url', 'size', 'created_at', 'taken_by']
