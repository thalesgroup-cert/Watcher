from rest_framework import serializers
from django.conf import settings
from django.utils import timezone
import requests
from rest_framework.exceptions import NotFound, AuthenticationFailed

from dns_finder.models import DnsTwisted
from .core import monitoring_init
from .models import Alert, Site

from pymisp import PyMISP, MISPEvent
from common.misp import create_misp_tags, create_or_update_objects, get_misp_uuid, update_misp_uuid

import urllib3
import tldextract
import threading

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


# Site Serializer
class SiteSerializer(serializers.ModelSerializer):
    misp_event_uuid = serializers.SerializerMethodField()
    
    def get_misp_event_uuid(self, obj):
        return get_misp_uuid(obj.domain_name)
        
    def validate_domain_name(self, value):
        from common.models import LegitimateDomain
        
        extracted = tldextract.extract(value)
        
        if not extracted.domain or not extracted.suffix:
            raise serializers.ValidationError("The domain name is not valid")
        
        # Check if domain exists in Legitimate Domains
        if LegitimateDomain.objects.filter(domain_name=value).exists():
            raise serializers.ValidationError(
                f'{value} Already exists in Legitimate Domains'
            )
        
        return value

    def to_internal_value(self, data):
        # Convert "" to None for expiry
        if data.get("expiry") == "":
            data["expiry"] = None
        return super().to_internal_value(data)

    def create(self, validated_data):
        site = super().create(validated_data)
        thread = threading.Thread(target=monitoring_init, args=(site,))
        thread.start()
        return site

    class Meta:
        model = Site
        fields = '__all__'


# Alert Serializer
class AlertSerializer(serializers.ModelSerializer):
    site = SiteSerializer()

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
            site_id = data['id']
            event_uuid = data.get('event_uuid', '')
            
            try:
                site = Site.objects.get(pk=site_id)
            except Site.DoesNotExist:
                raise serializers.ValidationError({"id": "Site not found"})

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
            site_id = self.validated_data['id']
            event_uuid = self.validated_data.get('event_uuid')
            site = Site.objects.get(pk=site_id)
            
            if event_uuid:
                event = self.misp_api.get_event(event_uuid)
                success, message = create_or_update_objects(
                    self.misp_api, 
                    event, 
                    site
                )
                
                if success:
                    update_misp_uuid(site.domain_name, event_uuid)
                    
            else:
                event = MISPEvent()
                event.distribution = 0
                event.threat_level_id = 2
                event.analysis = 0
                event.info = f"Suspicious domain name {site.domain_name}"
                event.tags = create_misp_tags(self.misp_api)

                event = self.misp_api.add_event(event, pythonify=True)
                success, message = create_or_update_objects(
                    self.misp_api,
                    {'Event': {'id': event.id, 'uuid': event.uuid}},
                    site
                )

                if success:
                    update_misp_uuid(site.domain_name, event.uuid)

            if not success:
                raise serializers.ValidationError(message)

            self._message = message
            return {
                "message": message,
                "misp_event_uuid": get_misp_uuid(site.domain_name),
                "status": "success"
            }

        except Exception as e:
            raise serializers.ValidationError(f"Error with MISP: {str(e)}")

    @property
    def data(self):
        site_id = self.validated_data['id']
        site = Site.objects.get(pk=site_id)
        return {
            'id': site_id,
            'misp_event_uuid': get_misp_uuid(site.domain_name),
            'message': self._message
        }