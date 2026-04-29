from django.contrib import admin
from .models import CVEAlert, RansomwareGroup, RansomwareVictim, WatchRule, WatchRuleHit, Subscriber


@admin.register(CVEAlert)
class CVEAlertAdmin(admin.ModelAdmin):
    list_display = ['cve_id', 'severity', 'cvss_score', 'published', 'is_archived', 'fetched_at']
    list_filter = ['severity', 'is_archived', 'published']
    search_fields = ['cve_id', 'description']
    readonly_fields = ['fetched_at']


@admin.register(RansomwareGroup)
class RansomwareGroupAdmin(admin.ModelAdmin):
    list_display = ['name', 'source', 'first_seen', 'fetched_at']
    list_filter = ['source', 'fetched_at']
    search_fields = ['name']
    readonly_fields = ['fetched_at']


@admin.register(RansomwareVictim)
class RansomwareVictimAdmin(admin.ModelAdmin):
    list_display = ['victim_name', 'group', 'country', 'sector', 'attacked_at', 'is_archived']
    list_filter = ['is_archived', 'country', 'attacked_at']
    search_fields = ['victim_name', 'group__name', 'country', 'sector']
    readonly_fields = ['fetched_at']


@admin.register(WatchRule)
class WatchRuleAdmin(admin.ModelAdmin):
    list_display = ['name', 'scope', 'is_active', 'created_at']
    list_filter = ['scope', 'is_active']
    search_fields = ['name']
    readonly_fields = ['created_at']


@admin.register(WatchRuleHit)
class WatchRuleHitAdmin(admin.ModelAdmin):
    list_display = ['rule', 'hit_type', 'object_id', 'matched_keyword', 'is_archived', 'hit_at']
    list_filter = ['hit_type', 'is_archived', 'rule']
    search_fields = ['object_id', 'matched_keyword', 'rule__name']
    readonly_fields = ['hit_at']


@admin.register(Subscriber)
class SubscriberAdmin(admin.ModelAdmin):
    list_display = ('user_rec', 'created_at', 'email', 'thehive', 'slack', 'citadel',
                    'notify_all_cves', 'notify_cve_hits', 'notify_all_victims', 'notify_victim_hits')
    list_filter  = ('email', 'thehive', 'slack', 'citadel',
                    'notify_all_cves', 'notify_cve_hits', 'notify_all_victims', 'notify_victim_hits')
    search_fields = ('user_rec__username',)
    readonly_fields = ['created_at']
    fieldsets = (
        (None, {
            'fields': ('user_rec', 'created_at'),
        }),
        ('Notification Channels', {
            'fields': ('email', 'thehive', 'slack', 'citadel'),
            'description': "Select the notification channels for this subscriber.",
        }),
        ('Subscription Types', {
            'fields': ('notify_all_cves', 'notify_cve_hits', 'notify_all_victims', 'notify_victim_hits'),
            'description': "Choose which event types trigger a notification.",
        }),
    )