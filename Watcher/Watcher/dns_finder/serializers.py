import logging
from rest_framework import serializers

logger = logging.getLogger('watcher.dns_finder')
from django.utils import timezone
from connectors.core import get_misp_config
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


from django.core.exceptions import ObjectDoesNotExist

# MISP Serializer
class MISPSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    event_uuid = serializers.CharField(required=False, allow_blank=True)
    domain_name = serializers.CharField(required=False, allow_blank=True)
    fuzzer = serializers.CharField(required=False, allow_blank=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        misp = get_misp_config()
        self.misp_api = PyMISP(
            misp['url'],
            misp['key'],
            misp['verify_ssl'],
        )
        self._message = ""

    def _get_target_obj(self, obj_id, domain_name, fuzzer):
        """
        Retrieve the target domain object from the appropriate database model.

        Routes the query to either the LegitimateDomain/Site model or the 
        DnsTwisted model based on the 'fuzzer' context. Prioritizes resolution 
        by domain_name with a fallback to the primary key (obj_id).

        Args:
            obj_id (int): The primary key of the object (fallback lookup).
            domain_name (str): The domain name to search for (primary lookup).
            fuzzer (str): The origin context string (e.g., 'legitimate_domain').

        Returns:
            Object: An instance of LegitimateDomain, Site, or DnsTwisted.
        """
        if fuzzer == 'legitimate_domain':
            from site_monitoring.models import Site
            try:
                from common.models import LegitimateDomain
                if domain_name: return LegitimateDomain.objects.get(domain_name=domain_name)
                return LegitimateDomain.objects.get(pk=obj_id)
            except (ImportError, ObjectDoesNotExist):
                if domain_name: return Site.objects.get(domain_name=domain_name)
                return Site.objects.get(pk=obj_id)
        else:
            if domain_name: return DnsTwisted.objects.get(domain_name=domain_name)
            return DnsTwisted.objects.get(pk=obj_id)

    def validate(self, data):
        dns_id = data.get('id')
        event_uuid = data.get('event_uuid', '')
        domain_name = data.get('domain_name')
        fuzzer = data.get('fuzzer')

        try:
            target_obj = self._get_target_obj(dns_id, domain_name, fuzzer)
            
            data['id'] = target_obj.id
            
        except ObjectDoesNotExist:
            raise serializers.ValidationError({"id": f"Domain not found in the database: {domain_name or dns_id}"})

        if event_uuid:
            try:
                event = self.misp_api.get_event(event_uuid)
                if not event:
                    raise serializers.ValidationError({"event_uuid": "MISP event not found"})
            except Exception:
                logger.exception("Error fetching MISP event for UUID %s", event_uuid)
                raise serializers.ValidationError({"event_uuid": "Invalid or unreachable MISP event UUID."})

        return data

    def save(self):
        try:
            dns_id = self.validated_data['id']
            domain_name = self.validated_data.get('domain_name')
            fuzzer = self.validated_data.get('fuzzer')
            event_uuid = self.validated_data.get('event_uuid')
            target_obj = self._get_target_obj(dns_id, domain_name, fuzzer)

            if not event_uuid:
                known_uuids = get_misp_uuid(target_obj.domain_name)
                if known_uuids and len(known_uuids) > 0:
                    event_uuid = known_uuids[-1] 
            
            if event_uuid:
                event = self.misp_api.get_event(event_uuid)
                success, message = create_or_update_objects(
                    self.misp_api, 
                    event, 
                    target_obj 
                )
                
                if success:
                    update_misp_uuid(target_obj.domain_name, event_uuid)
                    
            else:
                event = MISPEvent()
                event.distribution = 0
                event.threat_level_id = 2
                event.analysis = 0
                event.info = f"Suspicious domain name {target_obj.domain_name}"
                event.tags = create_misp_tags(self.misp_api)

                event = self.misp_api.add_event(event, pythonify=True)
                success, message = create_or_update_objects(
                    self.misp_api,
                    {'Event': {'id': event.id, 'uuid': event.uuid}},
                    target_obj 
                )

                if success:
                    update_misp_uuid(target_obj.domain_name, event.uuid)

            if not success:
                raise serializers.ValidationError(message)

            self._message = message
            return {
                "message": message,
                "misp_event_uuid": get_misp_uuid(target_obj.domain_name),
                "status": "success"
            }

        except serializers.ValidationError:
            raise
        except Exception:
            logger.exception("Unexpected error in DNS Finder MISP save")
            raise serializers.ValidationError("An internal error occurred while processing the MISP event.")

    @property
    def data(self):
        dns_id = self.validated_data['id']
        domain_name = self.validated_data.get('domain_name')
        fuzzer = self.validated_data.get('fuzzer')
        
        target_obj = self._get_target_obj(dns_id, domain_name, fuzzer)
        
        return {
            'id': dns_id,
            'misp_event_uuid': get_misp_uuid(target_obj.domain_name),
            'message': self._message
        }