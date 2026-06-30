from django.contrib import admin
from .models import TimelineEvent


@admin.register(TimelineEvent)
class TimelineEventAdmin(admin.ModelAdmin):
    list_display = ['timestamp', 'action', 'object_repr', 'user', 'content_type']
    list_filter = ['action', 'content_type']
    search_fields = ['object_repr', 'user__username']
    readonly_fields = ['content_type', 'object_id', 'action', 'user', 'timestamp', 'diff', 'object_repr']
