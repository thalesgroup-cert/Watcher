from abc import ABC

from rest_framework import serializers
from .models import TrendyWord, PostUrl, BannedWord, Summary, MonitoredKeyword


class TrackListingField(serializers.RelatedField, ABC):
    queryset = PostUrl.objects.all()

    def to_representation(self, value):
        return '%s,%s' % (value.url, value.created_at)


# TrendyWord Serializer
class TrendyWordSerializer(serializers.ModelSerializer):
    posturls = TrackListingField(many=True)

    class Meta:
        model = TrendyWord
        fields = '__all__'


# BannedWord Serializer
class BannedWordSerializer(serializers.ModelSerializer):
    class Meta:
        model = BannedWord
        fields = '__all__'

# Summary Serializer
class SummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Summary
        fields = '__all__'


# MonitoredKeyword Serializer
class MonitoredKeywordSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    temperature_display = serializers.CharField(source='get_temperature_display', read_only=True)
    
    class Meta:
        model = MonitoredKeyword
        fields = [
            'id', 'name', 'temperature', 'temperature_display', 'description',
            'created_at', 'created_by', 'created_by_username',
            'total_detections', 'last_detected_at'
        ]
        read_only_fields = ['created_at', 'total_detections', 'last_detected_at', 'created_by']