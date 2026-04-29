from rest_framework import serializers
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import CVEAlert, RansomwareGroup, RansomwareVictim, WatchRule, WatchRuleHit


# CVE Alert Serializer
class CVEAlertSerializer(serializers.ModelSerializer):
    """
    Serializer for CVE Alert objects.
    Provides read/write access to CVE vulnerability data.
    """

    class Meta:
        model = CVEAlert
        fields = '__all__'


# Ransomware Group Serializers
class RansomwareGroupSerializer(serializers.ModelSerializer):
    """
    Serializer for Ransomware Group objects.
    Includes computed victim count for each group.
    """

    victim_count = serializers.SerializerMethodField()

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
        return obj.victims.count()


# Ransomware Victim Serializer
class RansomwareVictimSerializer(serializers.ModelSerializer):
    """
    Serializer for Ransomware Victim objects.
    Includes related group name for convenience.
    """

    group_name = serializers.CharField(source='group.name', read_only=True)

    class Meta:
        model = RansomwareVictim
        fields = '__all__'


# Watch Rule Serializers
class WatchRuleSerializer(serializers.ModelSerializer):
    """
    Serializer for Watch Rule objects.
    Monitoring rules that detect keywords in CVE descriptions or ransomware victim names.
    Includes computed hit count for monitoring visibility.
    """

    hits_count = serializers.SerializerMethodField()

    class Meta:
        model = WatchRule
        fields = '__all__'

    def get_hits_count(self, obj):
        """
        Calculate the number of hits/matches for this rule.

        :param obj: WatchRule instance.
        :return: Count of related hits.
        :rtype: int
        """
        return obj.hits.count()

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


class WatchRuleHitSerializer(serializers.ModelSerializer):
    """
    Serializer for Watch Rule Hit objects.
    Records individual matches between watch rules and detected threats (CVEs / ransomware victims).
    Includes rule name for human-readable display.
    """

    rule_name = serializers.CharField(source='rule.name', read_only=True)

    class Meta:
        model = WatchRuleHit
        fields = '__all__'
