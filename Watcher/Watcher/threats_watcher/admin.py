# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.contrib import admin
from .models import Source, TrendyWord, BannedWord, Subscriber
from import_export import resources
from import_export.admin import ImportExportModelAdmin, ExportMixin


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


class TrendyWordResource(resources.ModelResource):
    class Meta:
        model = TrendyWord
        exclude = ('posturls',)


@admin.register(TrendyWord)
class TrendyWordAdmin(ExportMixin, admin.ModelAdmin):
    list_display = ('name', 'occurrences', 'created_at')
    list_filter = ['created_at']
    search_fields = ['name']
    resource_class = TrendyWordResource

    def has_add_permission(self, request):
        return False

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


@admin.register(Subscriber)
class Subscriber(admin.ModelAdmin):
    list_display = ['user_rec', 'created_at']
    list_filter = ['created_at']
    search_fields = ['user_rec']
