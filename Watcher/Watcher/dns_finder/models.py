from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User


class DnsMonitored(models.Model):
    """
    Dns stored in order to find twisted related dns
    """
    domain_name = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["domain_name"]
        verbose_name = 'Corporate DNS'
        verbose_name_plural = "Corporate DNS Assets Monitored"

    def __str__(self):
        return self.domain_name


class DnsTwisted(models.Model):
    """
    Twisted dns: typosquatting, phishing attacks, fraud, and brand impersonation.
    """
    domain_name = models.CharField(max_length=100, unique=True)
    dns_monitored = models.ForeignKey(DnsMonitored, on_delete=models.CASCADE)
    fuzzer = models.CharField(max_length=100, blank=True, null=True)
    the_hive_case_id = models.CharField(max_length=100, unique=True, blank=True, null=True)
    misp_event_id = models.IntegerField(unique=True, blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = 'Twisted DNS'
        verbose_name_plural = "Twisted DNS"

    def __str__(self):
        return self.domain_name


class Alert(models.Model):
    """
    Triggered when there is a new twisted dns.
    """
    dns_twisted = models.ForeignKey(DnsTwisted, on_delete=models.CASCADE)
    status = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]


class Subscriber(models.Model):
    """
    List of the email alert subscriber(s).
    """
    user_rec = models.ForeignKey(User, on_delete=models.CASCADE, related_name='dns_finder')
    created_at = models.DateTimeField(default=timezone.now)
