from rest_framework import serializers
from .models import Alert, Keyword
import re


# Keyword Serializer
class KeywordSerializer(serializers.ModelSerializer):
    class Meta:
        model = Keyword
        fields = '__all__'
    
    def validate(self, data):
        """
        Validate regex pattern if is_regex is True
        """
        if data.get('is_regex', False):
            try:
                re.compile(data['name'])
            except re.error as e:
                raise serializers.ValidationError({
                    'name': f'Invalid regex pattern: {str(e)}'
                })
        return data


# Alert Serializer
class AlertSerializer(serializers.ModelSerializer):
    keyword = KeywordSerializer()

    class Meta:
        model = Alert
        fields = '__all__'
