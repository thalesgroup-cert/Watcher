from django.contrib import admin
from .models import Alert, Site, Subscriber
from import_export import resources
from import_export.admin import ExportMixin
from common.misp import get_misp_uuid


def custom_titled_filter(title):
    class Wrapper(admin.FieldListFilter):
        def __new__(cls, *args, **kwargs):
            instance = admin.FieldListFilter.create(*args, **kwargs)
            instance.title = title
            return instance

    return Wrapper


class AlertResource(resources.ModelResource):
    class Meta:
        model = Alert


@admin.register(Alert)
class Alert(ExportMixin, admin.ModelAdmin):
    list_display = ['id', 'type', 'site', 'new_ip', 'new_ip_second', 'new_MX_records', 'new_mail_A_record_ip', 'old_ip',
                    'old_ip_second', 'old_MX_records', 'old_mail_A_record_ip', 'difference_score',
                    'status', 'created_at']
    list_filter = ('site', ('status', custom_titled_filter('Active Status')))
    search_fields = ['id', 'new_ip', 'new_ip_second', 'old_ip', 'old_ip_second', 'difference_score', 'new_MX_records',
                     'new_mail_A_record_ip', 'old_MX_records', 'old_mail_A_record_ip']
    resource_class = AlertResource

    def has_add_permission(self, request):
        return False

    def make_disable(self, request, queryset):
        rows_updated = queryset.update(status=False)

        if rows_updated == 1:
            message_bit = "1 alert was"
        else:
            message_bit = "%s alerts were" % rows_updated
        self.message_user(request, "%s successfully marked as disable." % message_bit)

    make_disable.short_description = "Disable selected alerts"

    def make_enable(self, request, queryset):
        rows_updated = queryset.update(status=True)

        if rows_updated == 1:
            message_bit = "1 alert was"
        else:
            message_bit = "%s alerts were" % rows_updated
        self.message_user(request, "%s successfully marked as enable." % message_bit)

    make_enable.short_description = "Enable selected alerts"

    actions = [make_disable, make_enable]


class SiteResource(resources.ModelResource):
    class Meta:
        model = Site
        exclude = (
        'misp_event_uuid', 'monitored', 'content_monitoring', 'content_fuzzy_hash', 'mail_monitoring',
        'ip_monitoring')


@admin.register(Site)
class Site(ExportMixin, admin.ModelAdmin):
    list_display = ['rtir', 'domain_name', 'ticket_id','ip', 'ip_second', 'monitored', 'web_status', 'display_misp_uuid',
                    'created_at', 'expiry']
    list_filter = ['created_at', 'expiry', 'monitored', 'web_status']
    search_fields = ['rtir', 'domain_name', 'ip', 'ip_second']
    resource_class = SiteResource
    readonly_fields = ['display_misp_uuid']

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


@admin.register(Subscriber)
class Subscriber(admin.ModelAdmin):
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