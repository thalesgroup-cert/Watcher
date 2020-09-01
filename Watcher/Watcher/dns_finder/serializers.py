from rest_framework import serializers
from .models import Alert, DnsMonitored, DnsTwisted


# DnsMonitored Serializer
class DnsMonitoredSerializer(serializers.ModelSerializer):
    class Meta:
        model = DnsMonitored
        fields = '__all__'


# DnsTwisted Serializer
class DnsTwistedSerializer(serializers.ModelSerializer):
    dns_monitored = DnsMonitoredSerializer()

    class Meta:
        model = DnsTwisted
        fields = '__all__'


# Alert Serializer
class AlertSerializer(serializers.ModelSerializer):
    dns_twisted = DnsTwistedSerializer()

    class Meta:
        model = Alert
        fields = '__all__'
