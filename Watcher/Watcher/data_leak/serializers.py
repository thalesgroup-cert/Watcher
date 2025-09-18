from rest_framework import serializers
from .models import Alert, Keyword
from django.core.exceptions import ValidationError


# Keyword Serializer
class KeywordSerializer(serializers.ModelSerializer):
    class Meta:
        model = Keyword
        fields = '__all__'
    
    def validate(self, data):
        """
        Custom validation to ensure regex pattern is provided when is_regex is True.
        """
        is_regex = data.get('is_regex', False)
        regex_pattern = data.get('regex_pattern', '')
        
        if is_regex and not regex_pattern:
            raise serializers.ValidationError({
                'regex_pattern': 'Regex pattern is required when "Use as Regex Pattern" is enabled.'
            })
        
        # Test the regex pattern if provided
        if regex_pattern:
            try:
                import re
                re.compile(regex_pattern)
            except re.error as e:
                raise serializers.ValidationError({
                    'regex_pattern': f'Invalid regex pattern: {e}'
                })
        
        return data


# Alert Serializer
class AlertSerializer(serializers.ModelSerializer):
    keyword = KeywordSerializer()

    class Meta:
        model = Alert
        fields = '__all__'
