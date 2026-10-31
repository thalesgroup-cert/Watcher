# coding=utf-8
from django.db import models
from django.utils import timezone
from django_mysql.models import ListCharField
from django.contrib.auth.models import User
from django.db.models.signals import pre_save, post_delete
from django.dispatch import receiver
from django.contrib.contenttypes.fields import GenericRelation

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
    server_banner = models.CharField(max_length=255, blank=True, null=True)
    x_powered_by = models.CharField(max_length=255, blank=True, null=True)

    registrar = models.CharField(max_length=255, blank=True, null=True)
    legitimacy = models.IntegerField(choices=[
        (1, "Unknown"),
        (2, "Suspicious, not harmful"),
        (3, "Suspicious, likely harmful (registered)"),
        (4, "Suspicious, likely harmful (available/disabled)"),
        (5, "Malicious (registered)"),
        (6, "Malicious (available/disabled)"),
    ], blank=True, null=True)
    takedown_request = models.BooleanField(default=False)
    legal_team = models.BooleanField(default=False)
    blocking_request = models.BooleanField(default=False)
    
    # /16 networks this site's addresses were seen in, with the date they were last seen
    # ({"54.157.0.0/16": "2026-10-02T13:16:02"}): an address pool that rotates between networks
    # already seen is not a change of hosting (see core.known_networks).
    network_history = models.JSONField(default=dict, blank=True, editable=False)

    created_at = models.DateTimeField(default=timezone.now)
    expiry = models.DateTimeField(blank=True, null=True)  # End of monitoring
    domain_expiry = models.DateField(blank=True, null=True)  # Domain expiration date
    domain_created_at = models.DateField(blank=True, null=True)  # Domain registration date
    ssl_expiry = models.DateField(blank=True, null=True)  # SSL certificate expiration date

    UDRP_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('won', 'Won (transferred/cancelled)'),
        ('lost', 'Lost'),
        ('unknown', 'Unknown'),
    ]
    udrp_status = models.CharField(
        max_length=20,
        choices=UDRP_STATUS_CHOICES,
        blank=True,
        null=True,
        help_text="UDRP case status - populated automatically when legal_team=True.",
    )
    udrp_last_checked = models.DateTimeField(
        blank=True,
        null=True,
        help_text="Timestamp of the last automatic UDRP status check.",
    )
    timeline_events = GenericRelation('timeline.TimelineEvent', related_query_name='site')

    def auto_update_legitimacy_on_registration(self):
        """
        Auto-update legitimacy when domain becomes registered (registrar found)
        """
        if self.registrar:
            if self.legitimacy == 6:
                self.legitimacy = 5
                return True
            elif self.legitimacy == 4: 
                self.legitimacy = 3
                return True
        return False

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
    
    new_registrar = models.CharField(max_length=255, blank=True, null=True)
    old_registrar = models.CharField(max_length=255, blank=True, null=True)
    new_expiry_date = models.DateField(blank=True, null=True)
    old_expiry_date = models.DateField(blank=True, null=True)
    new_ssl_expiry = models.DateField(blank=True, null=True)
    old_ssl_expiry = models.DateField(blank=True, null=True)
    old_server_banner = models.CharField(max_length=255, blank=True, null=True)
    new_server_banner = models.CharField(max_length=255, blank=True, null=True)
    old_x_powered_by = models.CharField(max_length=255, blank=True, null=True)
    new_x_powered_by = models.CharField(max_length=255, blank=True, null=True)

    status = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.site.domain_name} - {self.type}"

    @property
    def is_rdap_alert(self):
        """Check if this is an RDAP/WHOIS alert"""
        return (self.new_registrar is not None or self.old_registrar is not None or 
                self.new_expiry_date is not None or self.old_expiry_date is not None)
    
    @property
    def is_ssl_alert(self):
        """Check if this is an SSL certificate alert"""
        return (self.new_ssl_expiry is not None or self.old_ssl_expiry is not None)

    @property
    def is_banner_alert(self):
        return (
            self.new_server_banner is not None or self.old_server_banner is not None
            or self.new_x_powered_by is not None or self.old_x_powered_by is not None
        )


class Subscriber(models.Model):
    """
    List of the alert subscriber(s).
    """
    user_rec = models.ForeignKey(User, on_delete=models.CASCADE, related_name='site_monitoring')
    created_at = models.DateTimeField(default=timezone.now)

    email = models.BooleanField(default=False, verbose_name="E-mail")

    class Meta:
        verbose_name_plural = 'subscribers'

    def __str__(self):
        return f'{self.user_rec.username} - {self.created_at}'


class MonitoredPage(models.Model):
    """
    A precise web page (a researcher's blog without RSS feed, a vendor advisory page…) whose text is watched.
    Each time the text changes a :model:`site_monitoring.PageVersion` is kept; a change at least as big as
    `threshold` is notified. Independent from :model:`site_monitoring.Site`, which watches a whole domain.
    """
    url = models.URLField(max_length=700, unique=True)
    name = models.CharField(max_length=150, blank=True, default='')
    css_selector = models.CharField(
        max_length=200, blank=True, default='',
        help_text="Only the text of this part of the page is compared (e.g. 'article', '#content'); empty: the whole page")
    ignore_patterns = models.TextField(
        blank=True, default='', help_text="One regular expression per line: matching text is ignored (counters, dates…)")
    threshold = models.PositiveSmallIntegerField(
        default=5, help_text="Share of the text (in %) that has to change for a notification")
    check_interval = models.PositiveIntegerField(default=60, help_text="Minutes between two checks")
    retention = models.PositiveIntegerField(default=50, help_text="Number of versions kept")
    capture_screenshots = models.BooleanField(
        default=True, help_text="Take a screenshot of the page at each new version (needs the screenshot service)")
    is_active = models.BooleanField(default=True)

    last_checked = models.DateTimeField(blank=True, null=True)
    last_status = models.IntegerField(blank=True, null=True, help_text="HTTP status of the last check, None: unreachable")
    last_changed = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['name', 'url']

    def __str__(self):
        return self.name or self.url


class PageVersion(models.Model):
    """The extracted text of a monitored page, kept each time it differs from the previous version."""
    page = models.ForeignKey(MonitoredPage, on_delete=models.CASCADE, related_name='versions')
    created_at = models.DateTimeField(default=timezone.now)
    text = models.TextField()
    content_hash = models.CharField(max_length=64)
    size = models.PositiveIntegerField(default=0)
    # Share (%) of the text that differs from the version before; None for the first version
    change_ratio = models.FloatField(blank=True, null=True)
    notified = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.page_id} @ {self.created_at:%Y-%m-%d %H:%M}'


class PageScreenshot(models.Model):
    """
    The screenshot of a monitored page when a version was kept (a JPEG, taken by the screenshot service). Kept apart
    from the version so that listing versions never reads the images; deleted with its version.
    """
    version = models.OneToOneField(PageVersion, on_delete=models.CASCADE, related_name='screenshot')
    image = models.BinaryField(editable=False)
    size = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f'screenshot of version {self.version_id} ({self.size // 1024} KB)'


@receiver(post_delete, sender=Site)
def handle_site_deletion(sender, instance, **kwargs):
    """
    Signal triggered after deleting a site.
    Checks if the domain is still monitored elsewhere, otherwise removes the MISP mapping.
    """
    from common.models import MISPEventUuidLink
    MISPEventUuidLink.check_and_delete_unused_domain(instance.domain_name)