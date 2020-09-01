# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.contrib import admin
from .models import Source, TrendyWord, BannedWord, PostUrl, Subscriber


@admin.register(Source)
class SourceAdmin(admin.ModelAdmin):
    list_display = ['url', 'created_at']
    list_filter = ['created_at']
    search_fields = ['url']


@admin.register(BannedWord)
class BannedWordAdmin(admin.ModelAdmin):
    list_display = ['name', 'created_at']
    list_filter = ['created_at']
    search_fields = ['name']


@admin.register(TrendyWord)
class TrendyWordAdmin(admin.ModelAdmin):
    list_display = ('name', 'occurrences', 'created_at')
    list_filter = ['created_at']
    search_fields = ['name']

    def make_delete_blacklist(self, request, queryset):
        rows_updated = 0
        for trendy_word in queryset:
            BannedWord.objects.create(name=trendy_word.name)
            rows_updated += 1
        super().delete_queryset(request, queryset)

        if rows_updated == 1:
            message_bit = "1 trendy word was"
        else:
            message_bit = "%s trendy words were" % rows_updated
        self.message_user(request, "%s successfully Deleted & Blacklisted." % message_bit)

    make_delete_blacklist.short_description = "Delete & Blacklist selected trendy words"

    actions = [make_delete_blacklist]


@admin.register(PostUrl)
class PostUrl(admin.ModelAdmin):
    list_display = ('url', 'created_at')
    list_filter = ['created_at']
    search_fields = ['url']


@admin.register(Subscriber)
class Subscriber(admin.ModelAdmin):
    list_display = ['user_rec', 'created_at']
    list_filter = ['created_at']
    search_fields = ['user_rec']
