# coding=utf-8
from django.db import models
from django.utils import timezone
from django_mysql.models import ListCharField
from django.contrib.auth.models import User
from django.db.models.signals import pre_save, post_delete
from django.dispatch import receiver

class Site(models.Model):
    """
    Stores a site which will be monitor (discrepancy in the hosting or in its DNS resolution, content hosted).
    """
    domain_name = models.CharField(max_length=100, unique=True)
    ticket_id = models.CharField(max_length=20, blank=True, null=True)
    rtir = models.IntegerField(unique=True, blank=True, null=True)
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
    created_at = models.DateTimeField(default=timezone.now)
    expiry = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ["-rtir"]
        verbose_name = 'Website'
        verbose_name_plural = 'Suspicious Websites Monitored'

    def __str__(self):
        return self.domain_name


@receiver(pre_save, sender=Site)
def set_rtir(sender, instance, **kwargs):
    if instance.rtir is None:
        last_site = Site.objects.order_by('-rtir').first()
        instance.rtir = 1 if not last_site else last_site.rtir + 1


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
    List of the alert subscriber(s).
    """
    user_rec = models.ForeignKey(User, on_delete=models.CASCADE, related_name='site_monitoring')
    created_at = models.DateTimeField(default=timezone.now)

    email = models.BooleanField(default=False, verbose_name="E-mail")
    thehive = models.BooleanField(default=False, verbose_name="TheHive")
    slack = models.BooleanField(default=False, verbose_name="Slack")
    citadel = models.BooleanField(default=False, verbose_name="Citadel")

    class Meta:
        verbose_name_plural = 'subscribers'

    def __str__(self):
        return f'{self.user_rec.username} - {self.created_at}'


@receiver(post_delete, sender=Site)
def handle_site_deletion(sender, instance, **kwargs):
    """
    Signal triggered after deleting a site.
    Checks if the domain is still monitored elsewhere, otherwise removes the MISP mapping.
    """
    from common.models import MISPEventUuidLink
    MISPEventUuidLink.check_and_delete_unused_domain(instance.domain_name)