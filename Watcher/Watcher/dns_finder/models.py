from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User
from django.contrib.contenttypes.fields import GenericRelation
from django.db.models.signals import post_delete
from django.dispatch import receiver

class DnsMonitored(models.Model):
    """
    Dns stored in order to find twisted related dns
    """
    domain_name = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(default=timezone.now)
    timeline_events = GenericRelation('timeline.TimelineEvent', related_query_name='dnsmonitored')

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
    timeline_events = GenericRelation('timeline.TimelineEvent', related_query_name='keywordmonitored')

    class Meta:
        ordering = ["name"]
        verbose_name = 'Corporate Keyword'
        verbose_name_plural = 'Corporate Keywords Monitored'

    def __str__(self):
        return self.name


class DnsTwisted(models.Model):
    """
    A detected domain: typosquatting/phishing (dnstwist), a newly-issued
    certificate matching a corporate keyword (certstream_keyword), or a
    dangling subdomain at takeover risk (subdomain_takeover) - see the
    `source` choices on Alert, which owns the FK to this model. One table
    for all three so the unified feed (threats.py) is a single query.
    """
    domain_name = models.CharField(max_length=100, unique=True)
    dns_monitored = models.ForeignKey(DnsMonitored, on_delete=models.CASCADE, blank=True, null=True)
    keyword_monitored = models.ForeignKey(KeywordMonitored, on_delete=models.CASCADE, blank=True, null=True)
    fuzzer = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)
    # Populated for certstream_keyword-sourced rows from the CertStream leaf
    # certificate/chain (see core.extract_certificate_metadata); always empty
    # for dnstwist-sourced rows, which have no certificate to read from.
    issuer = models.CharField(max_length=255, blank=True, null=True)
    san_list = models.JSONField(blank=True, null=True)
    cname_target = models.CharField(max_length=255, blank=True, null=True)
    provider = models.CharField(max_length=100, blank=True, null=True)
    http_status_code = models.IntegerField(null=True, blank=True)
    last_checked_at = models.DateTimeField(null=True, blank=True)
    timeline_events = GenericRelation('timeline.TimelineEvent', related_query_name='dnstwisted')

    class Meta:
        ordering = ["-created_at"]
        verbose_name = 'Detected Domain'
        verbose_name_plural = 'Detected Domains'

    def __str__(self):
        return self.domain_name


class Alert(models.Model):
    """
    Triggered when a DnsTwisted row is newly detected (dnstwist/certstream_keyword)
    or transitions into a dangling status worth paging on (subdomain_takeover).
    """
    SOURCE_DNSTWIST = 'dnstwist'
    SOURCE_CERTSTREAM_KEYWORD = 'certstream_keyword'
    SOURCE_SUBDOMAIN_TAKEOVER = 'subdomain_takeover'
    SOURCE_CHOICES = [
        (SOURCE_DNSTWIST, 'Dnstwist Algorithm'),
        (SOURCE_CERTSTREAM_KEYWORD, 'Certificate Transparency Stream'),
        (SOURCE_SUBDOMAIN_TAKEOVER, 'Subdomain Takeover Detection'),
    ]

    STATUS_PENDING = 'pending'
    STATUS_SUSPECTED = 'suspected'
    STATUS_CONFIRMED = 'confirmed'
    STATUS_RESOLVED = 'resolved'
    STATUS_FALSE_POSITIVE = 'false_positive'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_SUSPECTED, 'Suspected'),
        (STATUS_CONFIRMED, 'Confirmed'),
        (STATUS_RESOLVED, 'Resolved'),
        (STATUS_FALSE_POSITIVE, 'False Positive'),
    ]

    dns_twisted = models.ForeignKey(DnsTwisted, on_delete=models.CASCADE)
    # SOC triage lifecycle, same 5 states across all 3 sources. Also driven
    # automatically for subdomain_takeover (see core.evaluate_dangling_subdomain).
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    comments = models.TextField(blank=True, null=True, max_length=300)
    created_at = models.DateTimeField(default=timezone.now)
    source = models.CharField(max_length=30, choices=SOURCE_CHOICES, default=SOURCE_CERTSTREAM_KEYWORD)
    # Only meaningful for source=subdomain_takeover: 'certstream' (first
    # discovery) or 'periodic_recheck' (recheck_dangling_subdomains job).
    trigger = models.CharField(max_length=50, blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = 'Alert'
        verbose_name_plural = 'Alerts'


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
        verbose_name = 'Subscriber'
        verbose_name_plural = 'Subscribers'

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
