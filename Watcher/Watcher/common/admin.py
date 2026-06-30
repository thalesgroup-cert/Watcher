from django.contrib import admin
from .models import LegitimateDomain, PendingAction
from django.utils import timezone
from import_export import resources
from import_export.admin import ImportExportModelAdmin, ExportMixin


@admin.register(LegitimateDomain)
class LegitimateDomainAdmin(ImportExportModelAdmin):
    list_display = (
        'domain_name', 'ticket_id', 'contact',
        'domain_created_at', 'created_at', 'expiry',
        'ssl_expiry', 'repurchased', 'comments'
    )
    search_fields = ('domain_name', 'ticket_id', 'contact')
    list_filter = ('repurchased', 'expiry', 'ssl_expiry')
    readonly_fields = ('created_at',)


@admin.register(PendingAction)
class PendingActionAdmin(admin.ModelAdmin):
    list_display  = ('title', 'action_type', 'status', 'created_at', 'resolved_at', 'resolved_by')
    list_filter   = ('action_type', 'status')
    search_fields = ('title', 'description')
    readonly_fields = ('created_at', 'resolved_at', 'resolved_by')