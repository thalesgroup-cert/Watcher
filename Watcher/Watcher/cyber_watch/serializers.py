from rest_framework import serializers
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import CVEAlert, RansomwareGroup, RansomwareVictim, WatchRule, WatchRuleHit


# CVE Alert Serializer
class CVEAlertSerializer(serializers.ModelSerializer):
    """
    Serializer for CVE Alert objects.
    Provides read/write access to CVE vulnerability data, with the number of watch rule hits to review.
    """

    hits_count = serializers.SerializerMethodField()

    class Meta:
        model = CVEAlert
        fields = '__all__'

    def get_hits_count(self, obj):
        count = getattr(obj, 'hits_count', None)
        if count is None:
            count = WatchRuleHit.objects.filter(hit_type='cve', object_id=obj.cve_id, is_archived=False).count()
        return count


# Ransomware Group Serializers
class RansomwareGroupSerializer(serializers.ModelSerializer):
    """
    Serializer for Ransomware Group objects.
    Includes the victim count and the date of the latest attack of each group.
    """

    victim_count = serializers.SerializerMethodField()
    last_attack_at = serializers.SerializerMethodField()

    class Meta:
        model = RansomwareGroup
        fields = '__all__'

    def get_victim_count(self, obj):
        """
        Calculate the number of victims associated with this group.

        :param obj: RansomwareGroup instance.
        :return: Count of related victims.
        :rtype: int
        """
        count = getattr(obj, 'victims_count', None)
        return obj.victims.count() if count is None else count

    def get_last_attack_at(self, obj):
        return getattr(obj, 'last_attack_at', None)


# Ransomware Victim Serializer
class RansomwareVictimSerializer(serializers.ModelSerializer):
    """
    Serializer for Ransomware Victim objects.
    Includes related group name for convenience, and the number of watch rule hits to review.
    """

    group_name = serializers.CharField(source='group.name', read_only=True)
    hits_count = serializers.SerializerMethodField()

    class Meta:
        model = RansomwareVictim
        fields = '__all__'

    def get_hits_count(self, obj):
        count = getattr(obj, 'hits_count', None)
        if count is None:
            from .core import victim_key
            count = WatchRuleHit.objects.filter(hit_type='ransomware_victim', object_id=victim_key(obj), is_archived=False).count()
        return count


# Watch Rule Serializers
class WatchRuleSerializer(serializers.ModelSerializer):
    """
    Serializer for Watch Rule objects.
    Monitoring rules that detect keywords in CVE descriptions or ransomware victim names.
    Includes its hits (all, still to review, latest) and last timeline event for monitoring visibility.
    """

    hits_count = serializers.SerializerMethodField()
    open_hits_count = serializers.SerializerMethodField()
    last_hit_at = serializers.SerializerMethodField()
    last_event  = serializers.SerializerMethodField()

    class Meta:
        model = WatchRule
        fields = ['id', 'name', 'keywords', 'exceptions', 'scope', 'is_active',
                  'created_at', 'hits_count', 'open_hits_count', 'last_hit_at', 'last_event']

    def get_hits_count(self, obj):
        """
        Calculate the number of hits/matches for this rule.

        :param obj: WatchRule instance.
        :return: Count of related hits.
        :rtype: int
        """
        count = getattr(obj, 'hits_count', None)
        return obj.hits.count() if count is None else count

    def get_open_hits_count(self, obj):
        count = getattr(obj, 'open_hits_count', None)
        return obj.hits.filter(is_archived=False).count() if count is None else count

    def get_last_hit_at(self, obj):
        if hasattr(obj, 'last_hit_at'):
            return obj.last_hit_at
        last = obj.hits.order_by('-hit_at').first()
        return last.hit_at if last else None

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
            'username':    u.username if u else 'system',
            'first_name':  u.first_name if u else '',
            'last_name':   u.last_name if u else '',
            'avatar_color': avatar_color,
            'avatar': avatar,
            'action':      event.action,
            'timestamp':   event.timestamp,
        }

    def validate(self, attrs):
        instance = self.instance
        if instance is None:
            tmp = WatchRule(**attrs)
        else:
            for k, v in attrs.items():
                setattr(instance, k, v)
            tmp = instance
        try:
            tmp.clean()
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.message)

        attrs['keywords']   = tmp.keywords
        attrs['exceptions'] = tmp.exceptions
        return attrs


class WatchRulePreviewSerializer(serializers.Serializer):
    """Keywords, exceptions and scope of a rule being written, to preview what it would match."""

    keywords = serializers.ListField(child=serializers.CharField(max_length=200), allow_empty=False, max_length=50)
    exceptions = serializers.ListField(child=serializers.CharField(max_length=200), required=False, default=list, max_length=50)
    scope = serializers.ChoiceField(choices=WatchRule.SCOPE_CHOICES, default='both')

    def validate(self, attrs):
        attrs['keywords'] = WatchRule._normalize_keywords(attrs['keywords'])
        attrs['exceptions'] = WatchRule._normalize_keywords(attrs.get('exceptions', []))
        if not attrs['keywords']:
            raise serializers.ValidationError({'keywords': 'At least one keyword is required.'})
        return attrs


class WatchRuleHitSerializer(serializers.ModelSerializer):
    """
    Serializer for Watch Rule Hit objects.
    Records individual matches between watch rules and detected threats (CVEs / ransomware victims).
    Includes rule name for human-readable display, and the CVE or victim it points at when the view looked it up.
    """

    rule_name = serializers.CharField(source='rule.name', read_only=True)
    rule_scope = serializers.CharField(source='rule.scope', read_only=True)
    target = serializers.SerializerMethodField()

    class Meta:
        model = WatchRuleHit
        fields = '__all__'

    def get_target(self, obj):
        targets = self.context.get('targets')
        if targets is None:
            from .core import hit_targets
            targets = hit_targets([obj])
        return targets.get(obj.id)
