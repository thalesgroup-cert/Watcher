# -*- coding: utf-8 -*-
from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User


class CVEAlert(models.Model):
    """
    Stores CVE alerts fetched from cve.circl.lu.
    """
    cve_id      = models.CharField(max_length=30, unique=True)
    description = models.TextField(blank=True)
    cvss_score  = models.FloatField(null=True, blank=True)
    severity    = models.CharField(max_length=20, blank=True)
    published   = models.DateTimeField(null=True, blank=True)
    references  = models.JSONField(default=list)
    fetched_at   = models.DateTimeField(default=timezone.now)
    is_archived  = models.BooleanField(default=False)

    class Meta:
        ordering = ['-published']
        verbose_name = 'CVE Alert'
        verbose_name_plural = 'CVE Alerts'

    def __str__(self):
        return self.cve_id


class RansomwareGroup(models.Model):
    """
    Stores ransomware groups fetched from ransomware.live.
    """
    name        = models.CharField(max_length=200, unique=True)
    description = models.TextField(blank=True)
    source      = models.CharField(max_length=50, default='ransomware.live')
    first_seen  = models.DateField(null=True, blank=True)
    fetched_at  = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['name']
        verbose_name = 'Ransomware Group'
        verbose_name_plural = 'Ransomware Groups'

    def __str__(self):
        return self.name


class RansomwareVictim(models.Model):
    """
    Stores ransomware victims fetched from ransomware.live.
    """
    group       = models.ForeignKey(RansomwareGroup, on_delete=models.CASCADE, related_name='victims')
    victim_name = models.CharField(max_length=300)
    country     = models.CharField(max_length=100, blank=True)
    sector      = models.CharField(max_length=150, blank=True)
    attacked_at = models.DateTimeField(null=True, blank=True)
    url         = models.URLField(max_length=750, blank=True)
    fetched_at   = models.DateTimeField(default=timezone.now)
    is_archived  = models.BooleanField(default=False)

    class Meta:
        ordering = ['-attacked_at']
        unique_together = [['group', 'victim_name', 'attacked_at']]
        verbose_name = 'Ransomware Victim'
        verbose_name_plural = 'Ransomware Victims'

    def __str__(self):
        return f"{self.victim_name} ({self.group.name})"


class WatchRule(models.Model):
    """
    A monitoring rule inspired by dls-monitoring watch_list.json.
    Matches keywords against CVE descriptions/IDs or ransomware victim names.
    """
    SCOPE_CHOICES = [
        ('cve',        'CVE'),
        ('ransomware', 'Ransomware'),
        ('both',       'Both'),
    ]

    name       = models.CharField(max_length=200, help_text="Label or case name for this rule")
    keywords   = models.JSONField(default=list, help_text="List of keywords to match (case-insensitive)")
    exceptions = models.JSONField(default=list, help_text="Keywords whose presence cancels a match")
    scope      = models.CharField(max_length=20, choices=SCOPE_CHOICES, default='both')
    is_active  = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['name']
        verbose_name = 'Watch Rule'
        verbose_name_plural = 'Watch Rules'

    def __str__(self):
        return self.name

    @staticmethod
    def _normalize_keywords(kw_list):
        """Strip whitespace and lowercase each keyword; remove empty entries and duplicates."""
        seen = set()
        result = []
        for kw in kw_list:
            norm = kw.strip().lower()
            if norm and norm not in seen:
                seen.add(norm)
                result.append(kw.strip())
        return result

    def clean(self):
        self.keywords   = self._normalize_keywords(self.keywords   if isinstance(self.keywords,   list) else [])
        self.exceptions = self._normalize_keywords(self.exceptions if isinstance(self.exceptions, list) else [])

        norm_set = {kw.lower() for kw in self.keywords}
        qs = WatchRule.objects.filter(scope=self.scope)
        if self.pk:
            qs = qs.exclude(pk=self.pk)
        for rule in qs:
            if {kw.lower() for kw in (rule.keywords or [])} == norm_set:
                raise ValidationError(
                    f"A watch rule with the same keywords and scope already exists: \"{rule.name}\"."
                )

    def save(self, *args, **kwargs):
        self.keywords   = self._normalize_keywords(self.keywords   if isinstance(self.keywords,   list) else [])
        self.exceptions = self._normalize_keywords(self.exceptions if isinstance(self.exceptions, list) else [])
        super().save(*args, **kwargs)


class WatchRuleHit(models.Model):
    """
    Records a match between a WatchRule and a CVEAlert or RansomwareVictim.
    """
    HIT_TYPE_CHOICES = [
        ('cve',               'CVE'),
        ('ransomware_victim', 'Ransomware Victim'),
    ]

    rule            = models.ForeignKey(WatchRule, on_delete=models.CASCADE, related_name='hits')
    hit_type        = models.CharField(max_length=20, choices=HIT_TYPE_CHOICES)
    object_id       = models.CharField(max_length=500)
    hit_display     = models.TextField()
    matched_keyword = models.CharField(max_length=200)
    hit_at          = models.DateTimeField(default=timezone.now)
    is_archived     = models.BooleanField(default=False)

    class Meta:
        ordering = ['-hit_at']
        unique_together = [['rule', 'hit_type', 'object_id', 'matched_keyword']]
        verbose_name = 'Watch Rule Hit'
        verbose_name_plural = 'Watch Rule Hits'

    def __str__(self):
        return f"{self.rule.name} → {self.object_id} [{self.matched_keyword}]"


class Subscriber(models.Model):
    """
    Notification subscriber for CyberWatch alerts.
    """
    user_rec   = models.ForeignKey(User, on_delete=models.CASCADE, related_name='cyber_watch')
    created_at = models.DateTimeField(default=timezone.now)

    # Notification channels
    email   = models.BooleanField(default=False, verbose_name="E-mail")
    thehive = models.BooleanField(default=False, verbose_name="TheHive")
    slack   = models.BooleanField(default=False, verbose_name="Slack")
    citadel = models.BooleanField(default=False, verbose_name="Citadel")

    # Subscription types
    notify_all_cves      = models.BooleanField(default=True,  verbose_name="All CVEs")
    notify_cve_hits      = models.BooleanField(default=True,  verbose_name="CVE Hits")
    notify_all_victims   = models.BooleanField(default=True,  verbose_name="All Victims")
    notify_victim_hits   = models.BooleanField(default=True,  verbose_name="Victim Hits")

    class Meta:
        verbose_name_plural = 'subscribers'

    def __str__(self):
        return f'{self.user_rec.username} - {self.created_at}'
