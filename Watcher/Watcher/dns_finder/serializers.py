from rest_framework import serializers
from django.conf import settings
from django.utils import timezone
from .models import Alert, DnsMonitored, DnsTwisted, KeywordMonitored
from site_monitoring.models import Site
from site_monitoring.core import monitoring_init
import requests
from rest_framework.exceptions import NotFound, AuthenticationFailed
from pymisp import PyMISP, MISPEvent
from common.misp import create_misp_tags, create_or_update_objects, get_misp_uuid, update_misp_uuid

import urllib3
import tldextract

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def _get_last_event(obj):
    events = getattr(obj, '_timeline_events', None)
    if events is not None:
        event = events[0] if events else None
    else:
        event = obj.timeline_events.select_related('user__profile').first()
    if not event:
        return None
    u = event.user
    avatar_color = None
    if u:
        try:
            avatar_color = u.profile.avatar_color or None
        except Exception:
            pass
    return {
        'username':    u.username if u else 'system',
        'first_name':  u.first_name if u else '',
        'last_name':   u.last_name if u else '',
        'avatar_color': avatar_color,
        'action':      event.action,
        'timestamp':   event.timestamp,
    }


# DnsMonitored Serializer
class DnsMonitoredSerializer(serializers.ModelSerializer):
    last_event = serializers.SerializerMethodField()

    def get_last_event(self, obj):
        return _get_last_event(obj)

    def validate_domain_name(self, value):
        extracted = tldextract.extract(value)

        if not extracted.domain or not extracted.suffix:
            raise serializers.ValidationError("The domain name is not valid")

        return value

    class Meta:
        model = DnsMonitored
        fields = ['id', 'domain_name', 'created_at', 'last_event']

# KeywordMonitored Serializer
class KeywordMonitoredSerializer(serializers.ModelSerializer):
    last_event = serializers.SerializerMethodField()

    def get_last_event(self, obj):
        return _get_last_event(obj)

    class Meta:
        model = KeywordMonitored
        fields = ['id', 'name', 'created_at', 'last_event']

# DnsTwisted Serializer
class DnsTwistedSerializer(serializers.ModelSerializer):
    dns_monitored = DnsMonitoredSerializer(read_only=True)
    keyword_monitored = KeywordMonitoredSerializer(read_only=True)
    misp_event_uuid = serializers.SerializerMethodField()
    
    def get_misp_event_uuid(self, obj):
        return get_misp_uuid(obj.domain_name)
    
    class Meta:
        model = DnsTwisted
        fields = '__all__'


# Alert Serializer
class AlertSerializer(serializers.ModelSerializer):
    dns_twisted = DnsTwistedSerializer()

    class Meta:
        model = Alert
        fields = '__all__'


# MISP Serializer
class MISPSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    event_uuid = serializers.CharField(required=False, allow_blank=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.misp_api = PyMISP(
            settings.MISP_URL,
            settings.MISP_KEY,
            settings.MISP_VERIFY_SSL,
        )
        self._message = ""

    def validate(self, data):
        """
        Validate the input data.
        """
        try:
            dns_id = data['id']
            event_uuid = data.get('event_uuid', '')
            
            try:
                dns_twisted = DnsTwisted.objects.get(pk=dns_id)
            except DnsTwisted.DoesNotExist:
                raise serializers.ValidationError({"id": "DNS twisted domain not found"})

            if event_uuid:
                try:
                    event = self.misp_api.get_event(event_uuid)
                    if not event:
                        raise serializers.ValidationError(
                            {"event_uuid": "MISP event not found"}
                        )
                except Exception as e:
                    raise serializers.ValidationError(
                        {"event_uuid": f"Invalid MISP event UUID: {str(e)}"}
                    )

            return data
            
        except Exception as e:
            raise serializers.ValidationError(f"Validation error: {str(e)}")

    def save(self):
        """
        Create or update MISP event.
        """
        try:
            dns_id = self.validated_data['id']
            event_uuid = self.validated_data.get('event_uuid')
            dns_twisted = DnsTwisted.objects.get(pk=dns_id)
            
            if event_uuid:
                event = self.misp_api.get_event(event_uuid)
                success, message = create_or_update_objects(
                    self.misp_api, 
                    event, 
                    dns_twisted
                )
                
                if success:
                    update_misp_uuid(dns_twisted.domain_name, event_uuid)
                    
            else:
                event = MISPEvent()
                event.distribution = 0
                event.threat_level_id = 2
                event.analysis = 0
                event.info = f"Suspicious domain name {dns_twisted.domain_name}"
                event.tags = create_misp_tags(self.misp_api)

                event = self.misp_api.add_event(event, pythonify=True)
                success, message = create_or_update_objects(
                    self.misp_api,
                    {'Event': {'id': event.id, 'uuid': event.uuid}},
                    dns_twisted
                )

                if success:
                    update_misp_uuid(dns_twisted.domain_name, event.uuid)

            if not success:
                raise serializers.ValidationError(message)

            self._message = message
            return {
                "message": message,
                "misp_event_uuid": get_misp_uuid(dns_twisted.domain_name),
                "status": "success"
            }

        except Exception as e:
            raise serializers.ValidationError(f"Error with MISP: {str(e)}")

    @property
    def data(self):
        dns_id = self.validated_data['id']
        dns_twisted = DnsTwisted.objects.get(pk=dns_id)
        return {
            'id': dns_id,
            'misp_event_uuid': get_misp_uuid(dns_twisted.domain_name),
            'message': self._message
        }