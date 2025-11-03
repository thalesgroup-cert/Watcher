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
            'repurchased',
            'comments',
            'misp_event_uuid'
        ]
    
    def to_internal_value(self, data):
        # Convert "" to None for both date fields
        if data.get("expiry") == "":
            data["expiry"] = None
        if data.get("domain_created_at") == "":
            data["domain_created_at"] = None
        return super().to_internal_value(data)
    
    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        
        if not request or not request.user.is_authenticated:
            return {
                'id': data.get('id'),
                'domain_name': data.get('domain_name'),
                'created_at': data.get('created_at'),
                'domain_created_at': data.get('domain_created_at'),
                'expiry': data.get('expiry'),
            }
        
        return data