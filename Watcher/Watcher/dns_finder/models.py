from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User
from django.db.models.signals import post_delete
from django.dispatch import receiver

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


class KeywordMonitored(models.Model):
    """
    Keyword stored in order to find new certificates issued matching these keywords
    """
    name = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["name"]
        verbose_name = 'Corporate Keyword'
        verbose_name_plural = 'Corporate Keywords Monitored'

    def __str__(self):
        return self.name


class DnsTwisted(models.Model):
    """
    Twisted dns: typosquatting, phishing attacks, fraud, and brand impersonation.
    """
    domain_name = models.CharField(max_length=100, unique=True)
    dns_monitored = models.ForeignKey(DnsMonitored, on_delete=models.CASCADE, blank=True, null=True)
    keyword_monitored = models.ForeignKey(KeywordMonitored, on_delete=models.CASCADE, blank=True, null=True)
    fuzzer = models.CharField(max_length=100, blank=True, null=True)
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
    List of the alert subscriber(s).
    """
    user_rec = models.ForeignKey(User, on_delete=models.CASCADE, related_name='dns_finder')
    created_at = models.DateTimeField(default=timezone.now)

    email = models.BooleanField(default=False, verbose_name="E-mail")
    thehive = models.BooleanField(default=False, verbose_name="TheHive")
    slack = models.BooleanField(default=False, verbose_name="Slack")
    citadel = models.BooleanField(default=False, verbose_name="Citadel")

    class Meta:
        verbose_name_plural = 'subscribers'

    def __str__(self):
        return f'{self.user_rec.username} - {self.created_at}'


@receiver(post_delete, sender=DnsTwisted)
def handle_dns_twisted_deletion(sender, instance, **kwargs):
    """
    Signal triggered after deleting a twisted DNS domain.
    Checks if the domain is still being monitored elsewhere, otherwise removes the MISP mapping.
    """
    from common.models import MISPEventUuidLink
    MISPEventUuidLink.check_and_delete_unused_domain(instance.domain_name)
