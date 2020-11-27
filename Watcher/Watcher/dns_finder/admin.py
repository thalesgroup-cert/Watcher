from django.contrib import admin
from .models import DnsMonitored, DnsTwisted, Alert, Subscriber
from import_export import resources
from import_export.admin import ImportExportModelAdmin, ExportMixin


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
    list_display = ['id', 'dns_twisted', 'status', 'created_at']
    list_filter = ('created_at', ('status', custom_titled_filter('Active Status')))
    search_fields = ['id', 'dns_twisted']
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


class DnsMonitoredResource(resources.ModelResource):
    class Meta:
        model = DnsMonitored
        exclude = ('created_at',)


@admin.register(DnsMonitored)
class DnsMonitored(ImportExportModelAdmin):
    list_display = ['domain_name', 'created_at']
    list_filter = ['created_at']
    search_fields = ['domain_name']
    resource_class = DnsMonitoredResource


@admin.register(DnsTwisted)
class DnsTwisted(admin.ModelAdmin):
    list_display = ['domain_name', 'fuzzer', 'dns_monitored', 'created_at']
    list_filter = ['created_at', 'dns_monitored', 'fuzzer']
    search_fields = ['domain_name', 'dns_monitored', 'fuzzer']

    def has_add_permission(self, request):
        return False


@admin.register(Subscriber)
class Subscriber(admin.ModelAdmin):
    list_display = ['user_rec', 'created_at']
    list_filter = ['created_at']
    search_fields = ['user_rec']
