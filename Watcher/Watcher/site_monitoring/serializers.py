import logging
from rest_framework import serializers

logger = logging.getLogger('watcher.site_monitoring')
from connectors.core import get_misp_config

from .core import compile_ignore_patterns, monitoring_init
from .models import Alert, MonitoredPage, PageVersion, Site

from pymisp import PyMISP, MISPEvent
from common.bulk import normalize_domain_data
from common.misp import create_misp_tags, create_or_update_objects, get_misp_uuid, update_misp_uuid

import urllib3
import tldextract
import threading

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
    avatar = None
    if u:
        try:
            avatar_color = u.profile.avatar_color or None
            avatar = u.profile.avatar or None
        except Exception:
            pass
    return {
        'username':    u.username if u else 'system',
        'first_name':  u.first_name if u else '',
        'last_name':   u.last_name if u else '',
        'avatar_color': avatar_color,
        'avatar': avatar,
        'action':      event.action,
        'timestamp':   event.timestamp,
    }


# Site Serializer
class SiteSerializer(serializers.ModelSerializer):
    misp_event_uuid = serializers.SerializerMethodField()
    last_event      = serializers.SerializerMethodField()
    # Annotated by SiteViewSet.get_queryset (left out when the site comes from elsewhere)
    alerts_count      = serializers.IntegerField(read_only=True)
    open_alerts_count = serializers.IntegerField(read_only=True)
    last_alert_at     = serializers.DateTimeField(read_only=True)

    def get_misp_event_uuid(self, obj):
        return get_misp_uuid(obj.domain_name)

    def get_last_event(self, obj):
        return _get_last_event(obj)
        
    def validate_domain_name(self, value):
        from common.models import LegitimateDomain
        
        extracted = tldextract.extract(value)
        
        if not extracted.domain or not extracted.suffix:
            raise serializers.ValidationError("The domain name is not valid")
        
        if self.instance is None:
            if LegitimateDomain.objects.filter(domain_name=value).exists():
                raise serializers.ValidationError(
                    f'{value} Already exists in Legitimate Domains'
                )
        else:
            current = getattr(self.instance, 'domain_name', None)
            if value != current and LegitimateDomain.objects.filter(domain_name=value).exists():
                raise serializers.ValidationError(
                    f'{value} Already exists in Legitimate Domains'
                )
        
        return value

    def to_internal_value(self, data):
        data = normalize_domain_data(data)
        # Convert "" to None for date fields
        if data.get("expiry") == "":
            data["expiry"] = None
        if data.get("domain_expiry") == "":
            data["domain_expiry"] = None
        if data.get("domain_created_at") == "":
            data["domain_created_at"] = None
        if data.get("ssl_expiry") == "":
            data["ssl_expiry"] = None
        return super().to_internal_value(data)

    def create(self, validated_data):
        site = super().create(validated_data)
        if not self.context.get('defer_monitoring_init'):
            thread = threading.Thread(target=monitoring_init, args=(site,))
            thread.start()
        return site

    class Meta:
        model = Site
        exclude = ('network_history',)


# Alert Serializer
class AlertSerializer(serializers.ModelSerializer):
    site = SiteSerializer()

    class Meta:
        model = Alert
        fields = '__all__'


class AlertSiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Site
        fields = ['id', 'domain_name', 'legitimacy']


class AlertListSerializer(serializers.ModelSerializer):
    """Rows of the alert list: the site is named, not serialized in full (that cost a MISP lookup per row)."""
    site = AlertSiteSerializer(read_only=True)

    class Meta:
        model = Alert
        fields = '__all__'


# MISP Serializer
class MISPSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    event_uuid = serializers.CharField(required=False, allow_blank=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        
        misp = get_misp_config()
        self.misp_api = PyMISP(
            misp['url'],
            misp['key'],
            misp['verify_ssl'],
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
                Site.objects.get(pk=site_id)
            except Site.DoesNotExist:
                raise serializers.ValidationError({"id": "Site not found"})

            if event_uuid:
                try:
                    event = self.misp_api.get_event(event_uuid)
                    if not event:
                        raise serializers.ValidationError(
                            {"event_uuid": "MISP event not found"}
                        )
                except Exception:
                    logger.exception("Error fetching MISP event for UUID %s", event_uuid)
                    raise serializers.ValidationError(
                        {"event_uuid": "Invalid or unreachable MISP event UUID."}
                    )

            return data

        except serializers.ValidationError:
            raise
        except Exception:
            logger.exception("Unexpected validation error in Site Monitoring MISP serializer")
            raise serializers.ValidationError("An internal error occurred during validation.")

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

        except serializers.ValidationError:
            raise
        except Exception:
            logger.exception("Unexpected error in Site Monitoring MISP serializer")
            raise serializers.ValidationError("An internal error occurred while processing the MISP event.")

    @property
    def data(self):
        site_id = self.validated_data['id']
        site = Site.objects.get(pk=site_id)
        return {
            'id': site_id,
            'misp_event_uuid': get_misp_uuid(site.domain_name),
            'message': self._message
        }

class MonitoredPageSerializer(serializers.ModelSerializer):
    """A monitored page, with the figures of its history (annotated by the viewset)."""
    versions_count = serializers.IntegerField(read_only=True, default=0)
    last_ratio = serializers.FloatField(read_only=True, default=None)

    class Meta:
        model = MonitoredPage
        fields = ['id', 'url', 'name', 'css_selector', 'ignore_patterns', 'threshold', 'check_interval', 'retention',
                  'capture_screenshots', 'is_active', 'last_checked', 'last_status', 'last_changed', 'created_at',
                  'versions_count', 'last_ratio']
        read_only_fields = ['last_checked', 'last_status', 'last_changed', 'created_at']

    def validate_url(self, value):
        from urllib.parse import urlparse
        value = value.strip()
        if urlparse(value).scheme not in ('http', 'https'):
            raise serializers.ValidationError("Only http(s) addresses can be monitored")
        return value

    def validate_css_selector(self, value):
        if value.strip():
            import soupsieve
            try:
                soupsieve.compile(value.strip())
            except Exception as exc:
                raise serializers.ValidationError(f"Invalid CSS selector: {exc}")
        return value.strip()

    def validate_ignore_patterns(self, value):
        try:
            compile_ignore_patterns(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))
        return value

    def validate_threshold(self, value):
        if not 1 <= value <= 100:
            raise serializers.ValidationError("Between 1 and 100")
        return value

    def validate_check_interval(self, value):
        if not 15 <= value <= 10080:
            raise serializers.ValidationError("Between 15 minutes and 7 days")
        return value

    def validate_retention(self, value):
        if not 2 <= value <= 500:
            raise serializers.ValidationError("Between 2 and 500 versions")
        return value


class PageVersionSerializer(serializers.ModelSerializer):
    """A version in the history of a page (without its text, which is long, nor its screenshot)."""
    # Annotated by MonitoredPageViewSet.page_versions
    has_screenshot = serializers.BooleanField(read_only=True, default=False)

    class Meta:
        model = PageVersion
        fields = ['id', 'created_at', 'size', 'change_ratio', 'notified', 'has_screenshot']
