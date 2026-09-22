from django.contrib import admin
from .models import DnsMonitored, DnsTwisted, Alert, Subscriber, KeywordMonitored
from import_export import resources
from import_export.admin import ImportExportModelAdmin, ExportMixin
from common.misp import get_misp_uuid


class AlertResource(resources.ModelResource):
    class Meta:
        model = Alert


@admin.register(Alert)
class AlertAdmin(ExportMixin, admin.ModelAdmin):
    list_display = ['id', 'dns_twisted', 'source', 'trigger', 'status', 'created_at']
    list_filter = ('created_at', 'source', 'status')
    search_fields = ['id', 'dns_twisted__domain_name']
    resource_class = AlertResource

    def has_add_permission(self, request):
        return False


class DnsMonitoredResource(resources.ModelResource):
    class Meta:
        model = DnsMonitored
        exclude = ('created_at',)


class KeywordMonitoredResource(resources.ModelResource):
    class Meta:
        model = KeywordMonitored


class DnsTwistedResource(resources.ModelResource):
    class Meta:
        model = DnsTwisted


@admin.register(KeywordMonitored)
class KeywordMonitoredAdmin(ImportExportModelAdmin):
    list_display = ['name', 'created_at']
    list_filter = ['created_at']
    search_fields = ['name']
    resource_class = KeywordMonitoredResource


@admin.register(DnsMonitored)
class DnsMonitoredAdmin(ImportExportModelAdmin):
    list_display = ['domain_name', 'created_at']
    list_filter = ['created_at']
    search_fields = ['domain_name']
    resource_class = DnsMonitoredResource


@admin.register(DnsTwisted)
class DnsTwistedAdmin(ExportMixin, admin.ModelAdmin):
    list_display = [
        'domain_name', 'fuzzer', 'provider',
        'dns_monitored', 'keyword_monitored', 'display_misp_uuid', 'created_at',
    ]
    list_filter = ['created_at', 'dns_monitored', 'keyword_monitored', 'fuzzer', 'provider']
    search_fields = ['domain_name']
    readonly_fields = ['display_misp_uuid']
    resource_class = DnsTwistedResource

    def has_add_permission(self, request):
        return False

    def display_misp_uuid(self, obj):
        uuid = get_misp_uuid(obj.domain_name)
        if not uuid:
            return "-"

        if len(uuid) == 1:
            return uuid[0]
        else:
            return ", ".join(uuid)

    display_misp_uuid.short_description = "MISP Event UUID"

    def mark_recheck(self, request, queryset):
        rows_updated = Alert.objects.filter(
            dns_twisted__in=queryset, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER
        ).update(status=Alert.STATUS_PENDING)
        self.message_user(request, "%s domain(s) marked for re-check." % rows_updated)

    mark_recheck.short_description = "Mark selected domains for re-check"

    actions = [mark_recheck]


@admin.register(Subscriber)
class SubscriberAdmin(admin.ModelAdmin):
    list_display = ('user_rec', 'created_at', 'email', 'thehive', 'slack', 'citadel')
    list_filter = ('email', 'thehive', 'slack', 'citadel')
    search_fields = ('user_rec__username',)
    fieldsets = (
        (None, {
            'fields': ('user_rec', 'created_at')
        }),
        ('Notification Channels', {
            'fields': ('email', 'thehive', 'slack', 'citadel'),
            'description': "Select the notification channels for this subscriber."
        }),
    )
