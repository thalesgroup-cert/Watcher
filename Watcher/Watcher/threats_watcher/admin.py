# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.contrib import admin
from .models import Source, TrendyWord, BannedWord, Summary, Subscriber, MonitoredKeyword
from import_export import resources
from import_export.admin import ImportExportModelAdmin, ExportMixin
from django.utils.html import format_html


class SourceResource(resources.ModelResource):
    class Meta:
        model = Source
        exclude = ('created_at',)


@admin.register(Source)
class SourceAdmin(ImportExportModelAdmin):
    list_display = ['url', 'created_at']
    list_filter = ['created_at']
    search_fields = ['url']
    resource_class = SourceResource


class BannedWordResource(resources.ModelResource):
    class Meta:
        model = BannedWord
        exclude = ('created_at',)


@admin.register(BannedWord)
class BannedWordAdmin(ImportExportModelAdmin):
    list_display = ['name', 'created_at']
    list_filter = ['created_at']
    search_fields = ['name']
    resource_class = BannedWordResource


@admin.register(Summary)
class SummaryAdmin(admin.ModelAdmin):
    list_display = ('type', 'keywords', 'created_at')
    list_filter = ('type', 'created_at')
    search_fields = ('keywords', 'summary_text')
    readonly_fields = ('created_at', 'updated_at')


class TrendyWordResource(resources.ModelResource):
    class Meta:
        model = TrendyWord
        exclude = ('posturls',)


@admin.register(TrendyWord)
class TrendyWordAdmin(ExportMixin, admin.ModelAdmin):
    list_display = ('name', 'occurrences', 'score', 'created_at', 'has_summary')
    list_filter = ['created_at']
    search_fields = ['name']
    resource_class = TrendyWordResource
    readonly_fields = ('summary_preview',)

    def has_add_permission(self, request):
        return False

    def has_summary(self, obj):
        """Check if TrendyWord has an associated summary"""
        return Summary.objects.filter(
            type='trendy_word_summary',
            keywords=obj.name
        ).exists()
    has_summary.boolean = True
    has_summary.short_description = 'Summary'

    def summary_preview(self, obj):
        """Display the associated summary in read-only field (plain text, no design)"""
        summary = Summary.objects.filter(
            type='trendy_word_summary',
            keywords=obj.name
        ).first()
        if summary:
            return summary.summary_text
        return "-"
    summary_preview.short_description = 'Associated Summary'

    fieldsets = (
        ('Word Information', {
            'fields': ('name', 'occurrences', 'score', 'created_at')
        }),
        ('Associated Data', {
            'fields': ('posturls', 'summary_preview')
        }),
    )

    def make_delete_blocklist(self, request, queryset):
        rows_updated = 0
        for trendy_word in queryset:
            BannedWord.objects.create(name=trendy_word.name)
            rows_updated += 1
        super(TrendyWordAdmin, self).delete_queryset(request, queryset)

        if rows_updated == 1:
            message_bit = "1 trendy word was"
        else:
            message_bit = "%s trendy words were" % rows_updated
        self.message_user(request, "%s successfully Deleted & Blocklisted." % message_bit)

    make_delete_blocklist.short_description = "Delete & Blocklist selected trendy words"

    actions = [make_delete_blocklist]

    def get_actions(self, request):
        actions = super(TrendyWordAdmin, self).get_actions(request)
        if 'delete_selected' in actions:
            del actions['delete_selected']
        return actions


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

admin.site.register(Subscriber, SubscriberAdmin)


@admin.register(MonitoredKeyword)
class MonitoredKeywordAdmin(admin.ModelAdmin):
    list_display = ('name', 'temperature', 'total_detections', 'last_detected_at', 'created_by', 'created_at')
    list_filter = ('created_at', 'created_by', 'temperature')
    search_fields = ('name', 'description')
    readonly_fields = ('total_detections', 'last_detected_at', 'created_at', 'created_by')
    
    fieldsets = (
        ('Keyword Information', {
            'fields': ('name', 'description', 'temperature', 'created_at')
        }),
        ('Associated Data', {
            'fields': ('posturls', 'total_detections', 'last_detected_at')
        }),
    )
    
    def has_add_permission(self, request):
        return True
    
    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)