from rest_framework import serializers
from .models import LegitimateDomain

# Legitimate Domain Serializer
class LegitimateDomainSerializer(serializers.ModelSerializer):
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
            'ssl_expiry',
            'repurchased',
            'comments',
            'misp_event_uuid'
        ]

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
        # Convert "" to None for date fields
        if data.get("expiry") == "":
            data["expiry"] = None
        if data.get("domain_created_at") == "":
            data["domain_created_at"] = None
        if data.get("ssl_expiry") == "":
            data["ssl_expiry"] = None
        return super().to_internal_value(data)