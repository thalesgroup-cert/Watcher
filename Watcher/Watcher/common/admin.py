from django.contrib import admin
from .models import JobRun, LegitimateDomain, PendingAction
from import_export.admin import ImportExportModelAdmin


@admin.register(LegitimateDomain)
class LegitimateDomainAdmin(ImportExportModelAdmin):
    list_display = (
        'domain_name', 'ticket_id', 'contact',
        'domain_created_at', 'created_at', 'expiry',
        'ssl_expiry', 'repurchased', 'comments'
    )
    search_fields = ('domain_name', 'ticket_id', 'contact')
    list_filter = ('repurchased', 'expiry_check', 'expiry', 'ssl_expiry')
    readonly_fields = ('created_at',)


@admin.register(PendingAction)
class PendingActionAdmin(admin.ModelAdmin):
    list_display  = ('title', 'action_type', 'status', 'created_at', 'resolved_at', 'resolved_by')
    list_filter   = ('action_type', 'status')
    search_fields = ('title', 'description')
    readonly_fields = ('created_at', 'resolved_at', 'resolved_by')


@admin.register(JobRun)
class JobRunAdmin(admin.ModelAdmin):
    """The passes of the scheduled jobs, as the Scheduled jobs page shows them: read only."""
    list_display = ('started_at', 'job', 'label', 'duration', 'failed')
    list_filter = ('failed', 'job')
    search_fields = ('job', 'label', 'error')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
