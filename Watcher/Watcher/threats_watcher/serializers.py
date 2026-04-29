from abc import ABC

from rest_framework import serializers
from .models import Source, TrendyWord, PostUrl, BannedWord, Summary, MonitoredKeyword


class TrackListingField(serializers.RelatedField, ABC):
    queryset = PostUrl.objects.all()

    def to_representation(self, value):
        return '%s,%s' % (value.url, value.created_at)


# Source Serializer
class SourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Source
        fields = ['id', 'url', 'confident', 'country', 'country_code', 'created_at']


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
    level_display = serializers.CharField(source='get_level_display', read_only=True)
    posturls = serializers.SerializerMethodField()

    def get_posturls(self, obj):
        return ['%s,%s' % (p.url, p.created_at) for p in obj.posturls.all()]

    class Meta:
        model = MonitoredKeyword
        fields = '__all__'