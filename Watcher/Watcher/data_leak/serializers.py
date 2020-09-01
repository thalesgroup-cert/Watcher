from rest_framework import serializers
from .models import Alert, Keyword


# Keyword Serializer
class KeywordSerializer(serializers.ModelSerializer):
    class Meta:
        model = Keyword
        fields = '__all__'


# Alert Serializer
class AlertSerializer(serializers.ModelSerializer):
    keyword = KeywordSerializer()

    class Meta:
        model = Alert
        fields = '__all__'
