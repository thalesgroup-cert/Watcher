from abc import ABC

from rest_framework import serializers
from .models import TrendyWord, PostUrl, BannedWord, Summary


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