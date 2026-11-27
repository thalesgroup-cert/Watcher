from datetime import timedelta
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.utils import timezone
from django.contrib.auth.models import User
from django.contrib.contenttypes.fields import GenericRelation
from django_mysql.models import ListCharField

class MISPEventUuidLink(models.Model):
    """
    Centralizes domain name to MISP event UUID mappings across the application.
    """
    domain_name = models.CharField(max_length=255, unique=True)
    misp_event_uuid = ListCharField(
        base_field=models.CharField(max_length=36),
        size=10,
        max_length=(10 * 37),
        blank=True,
        null=True
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Domain MISP Mapping'
        verbose_name_plural = 'Domain MISP Mappings'
        
    def __str__(self):
        return f"{self.domain_name} - {len(self.misp_event_uuid or [])} UUID"
        
    @staticmethod
    def check_and_delete_unused_domain(domain_name):
        """
        Checks if a domain is still used in any monitoring module.
        If not, deletes the associated MISP mapping.
        
        Args:
            domain_name: Domain name to check
        """
        from site_monitoring.models import Site
        from dns_finder.models import DnsTwisted
        
        still_in_site = Site.objects.filter(domain_name=domain_name).exists()
        still_in_dns = DnsTwisted.objects.filter(domain_name=domain_name).exists()
        
        if not still_in_site and not still_in_dns:
            try:
                mappings = MISPEventUuidLink.objects.filter(domain_name=domain_name)
                if mappings.exists():
                    mappings.delete()
                    return True
            except Exception:
                pass
        
        return False


class LegitimateDomain(models.Model):
    """
    List of company-approved legitimate domains used.
    """
    domain_name = models.CharField(max_length=255, unique=True)
    ticket_id = models.CharField(max_length=20, blank=True, null=True)
    contact = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)
    domain_created_at = models.DateTimeField(blank=True, null=True)    # Domain's own creation/registration date
    expiry = models.DateField(blank=True, null=True)
    ssl_expiry = models.DateField(blank=True, null=True)  # SSL certificate expiration date
    repurchased = models.BooleanField(default=False)
    comments = models.TextField(blank=True, null=True, max_length=300)
    misp_event_uuid = models.JSONField(blank=True, null=True, default=list)
    # An expiry date earlier than the stored one that a registry gave once and that waits for a second answer before it
    # replaces the stored date (see common.utils.expiry_check.decide). Internal: never shown, never edited by hand.
    expiry_pending = models.DateField(blank=True, null=True, editable=False)
    expiry_pending_source = models.CharField(max_length=10, blank=True, null=True, editable=False)
    expiry_pending_at = models.DateTimeField(blank=True, null=True, editable=False)
    # Where the expiry date comes from and what the last lookup said, so that the interface can tell a date a registry
    # confirmed from one nobody checked. Written by the job (queryset update, no timeline event) and by the API when
    # someone types the date. `expiry_check`: ok, contradicted (an earlier date waits for a second answer), not_registered,
    # no_date (the registry answered without one), unsupported (no RDAP server for the extension), unreachable (no answer).
    expiry_source = models.CharField(max_length=10, blank=True, null=True, editable=False)  # RDAP or manual
    expiry_checked_at = models.DateTimeField(blank=True, null=True, editable=False)  # last time a registry answered
    expiry_check = models.CharField(max_length=16, blank=True, null=True, editable=False)
    # The expiry date for which the "expires soon" notification was already sent: one per date, and a renewal (a new
    # date) can notify again. Internal.
    expiry_alerted = models.DateField(blank=True, null=True, editable=False)
    timeline_events = GenericRelation('timeline.TimelineEvent', related_query_name='legitimatedomain')

    # A date counts as confirmed when RDAP gave it and a registry answered less than this many days ago
    EXPIRY_VERIFIED_DAYS = 7

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Legitimate Domain'
        verbose_name_plural = 'Legitimate Domains'

    def __str__(self):
        return self.domain_name

    @property
    def expiry_confirmed(self):
        """The stored date is the one the registry gave, recently. A date typed by hand is not."""
        return (self.expiry_check == 'ok' and self.expiry_source == 'RDAP' and self.expiry_checked_at is not None
                and self.expiry_checked_at >= timezone.now() - timedelta(days=self.EXPIRY_VERIFIED_DAYS))


class PendingAction(models.Model):
    """
    Stores actions that require manual validation before being executed.
    """

    ACTION_TYPES = [
        ('udrp_transfer', 'UDRP - Transfer domain to Legitimate Domains'),
        ('connector_health_check', 'Connector - Health check failed'),
        ('site_domain_available', 'Website Monitoring - Domain now available'),
        ('legitimate_domain_lost', 'Legitimate Domains - Domain no longer registered'),
        ('source_failing', 'RSS source - Failing for weeks'),
    ]

    STATUS_CHOICES = [
        ('pending',  'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    action_type = models.CharField(max_length=50, choices=ACTION_TYPES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    title = models.CharField(max_length=255)
    description = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    resolved_at = models.DateTimeField(blank=True, null=True)
    resolved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='resolved_pending_actions',
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Pending Action'
        verbose_name_plural = 'Pending Actions'

    def __str__(self):
        return f"[{self.get_action_type_display()}] {self.title} ({self.status})"


class Screenshot(models.Model):
    """
    A screenshot of the page of an object of any module (a data leak, a domain…), taken on demand by the `screenshotter`
    container. `target` names the kind of object (`data_leak.alert`), `target_id` its id: the screenshots go away with
    their object (see `common.core.forget_screenshots`). The image is a JPEG, kept apart from what lists read.
    """
    target = models.CharField(max_length=60)
    target_id = models.PositiveIntegerField()
    url = models.URLField(max_length=1000)
    image = models.BinaryField(editable=False)
    size = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)
    taken_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [models.Index(fields=['target', 'target_id'])]

    def __str__(self):
        return f"{self.target} #{self.target_id} ({self.size // 1024} KB)"


@receiver(post_delete, sender=LegitimateDomain)
def forget_domain_screenshots(sender, instance, **kwargs):
    """The screenshots of a legitimate domain go away with it."""
    from .core import forget_screenshots
    forget_screenshots('common.legitimate_domain', instance.pk)


class JobRun(models.Model):
    """
    One pass of a scheduled job (see `common.utils.job_log.logged_job`): when it started, how long it took, what it counted and
    whether it failed. The last runs of each job are kept (JobRun.KEEP), for the Scheduled jobs page and the freshness shown
    in the modules.
    """
    KEEP = 50  # runs kept per job

    job = models.CharField(max_length=100, db_index=True, help_text="app.function of the job, e.g. threats_watcher.main_watch")
    label = models.CharField(max_length=150, help_text="Name of the job as the interface shows it")
    started_at = models.DateTimeField(db_index=True)
    duration = models.FloatField(help_text="Seconds")
    failed = models.BooleanField(default=False)
    counts = models.JSONField(default=dict, blank=True, help_text="What the job counted, e.g. {'feeds': 217}")
    error = models.CharField(max_length=300, blank=True, default='')

    class Meta:
        ordering = ['-started_at', '-id']
        indexes = [models.Index(fields=['job', '-started_at'])]

    def __str__(self):
        return f"{self.job} at {self.started_at:%Y-%m-%d %H:%M} ({self.duration:.0f}s{', failed' if self.failed else ''})"
