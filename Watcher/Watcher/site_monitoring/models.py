# coding=utf-8
from django.db import models
from django.utils import timezone
from django_mysql.models import ListCharField
from django.contrib.auth.models import User


class Site(models.Model):
    """
    Stores a site which will be monitor (discrepancy in the hosting or in its DNS resolution, content hosted).
    """
    domain_name = models.CharField(max_length=100, unique=True)
    rtir = models.IntegerField()
    ip = models.GenericIPAddressField(blank=True, null=True)
    ip_second = models.GenericIPAddressField(blank=True, null=True)
    ip_monitoring = models.BooleanField(default=True)
    mail_A_record_ip = models.GenericIPAddressField(blank=True, null=True)
    MX_records = ListCharField(
        base_field=models.CharField(max_length=100),
        size=10,
        max_length=(10 * 101),  # 6 * 100 character nominals, plus commas
        blank=True,
        null=True
    )
    mail_monitoring = models.BooleanField(default=True)
    content_fuzzy_hash = models.CharField(max_length=100, blank=True, null=True)
    content_monitoring = models.BooleanField(default=True)
    monitored = models.BooleanField(default=False, blank=True, null=True)
    web_status = models.IntegerField(blank=True, null=True)
    the_hive_case_id = models.CharField(max_length=100, unique=True, blank=True, null=True)
    misp_event_id = models.IntegerField(unique=True, blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)
    expiry = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ["-rtir"]
        verbose_name = 'Website'
        verbose_name_plural = 'Suspicious Websites Monitored'

    def __str__(self):
        return self.domain_name


class Alert(models.Model):
    """
    Triggered when there is a site status change.
    """
    site = models.ForeignKey(Site, on_delete=models.CASCADE)
    type = models.CharField(max_length=100, default="")
    difference_score = models.IntegerField(blank=True, null=True)
    new_ip = models.GenericIPAddressField(blank=True, null=True)
    new_ip_second = models.GenericIPAddressField(blank=True, null=True)
    new_MX_records = ListCharField(
        base_field=models.CharField(max_length=100),
        size=10,
        max_length=(10 * 101),  # 6 * 100 character nominals, plus commas
        blank=True,
        null=True
    )
    new_mail_A_record_ip = models.GenericIPAddressField(blank=True, null=True)
    old_ip = models.GenericIPAddressField(blank=True, null=True)
    old_ip_second = models.GenericIPAddressField(blank=True, null=True)
    old_MX_records = ListCharField(
        base_field=models.CharField(max_length=100),
        size=10,
        max_length=(10 * 101),  # 6 * 100 character nominals, plus commas
        blank=True,
        null=True
    )
    old_mail_A_record_ip = models.GenericIPAddressField(blank=True, null=True)
    status = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.site.domain_name


class Subscriber(models.Model):
    """
    List of the email alert subscriber(s).
    """
    user_rec = models.ForeignKey(User, on_delete=models.CASCADE, related_name='site_monitoring')
    created_at = models.DateTimeField(default=timezone.now)
