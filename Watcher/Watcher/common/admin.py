from django.contrib import admin
from .models import LegitimateDomain
from django.utils import timezone
from import_export import resources
from import_export.admin import ImportExportModelAdmin, ExportMixin


@admin.register(LegitimateDomain)
class LegitimateDomainAdmin(ImportExportModelAdmin):
    list_display = (
        'domain_name', 'ticket_id', 'contact',
        'created_at', 'expiry', 'repurchased'
    )
    search_fields = ('domain_name', 'ticket_id', 'contact')
    list_filter = ('repurchased', 'expiry')
    readonly_fields = ('created_at',)