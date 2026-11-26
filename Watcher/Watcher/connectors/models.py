from django.db import models
from django.utils import timezone


class ConnectorOverride(models.Model):
    """Stores per-connector field overrides entered via the UI."""
    connector_id = models.CharField(max_length=100, primary_key=True)
    overrides = models.JSONField(default=dict, blank=True)

    auto_seeded_fields = models.JSONField(default=list, blank=True)

    is_default_llm = models.BooleanField(
        default=False, 
        verbose_name="Default LLM",
        help_text="Check to set this AI as the default."
    )

    class Meta:
        verbose_name = 'Connector Override'
        verbose_name_plural = 'Connector Overrides'

    def __str__(self):
        return self.connector_id

    def save(self, *args, **kwargs):
        # The admin's JSON widget submits None when cleared; the columns are NOT NULL.
        if self.overrides is None:
            self.overrides = {}
        if self.auto_seeded_fields is None:
            self.auto_seeded_fields = []
        if self.is_default_llm:
            ConnectorOverride.objects.filter(is_default_llm=True).exclude(pk=self.pk).update(is_default_llm=False)
        super().save(*args, **kwargs)


class ConnectorHealthCheck(models.Model):
    """
    Stores the outcome of the most recent connectivity test for a connector,
    whether triggered manually (the dashboard's Test button) or by the
    weekly scheduled health-check job.
    """
    connector_id = models.CharField(max_length=100, primary_key=True)
    healthy = models.BooleanField(null=True, default=None)  # None = never tested yet
    message = models.TextField(blank=True, default='')
    checked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Connector Health Check'
        verbose_name_plural = 'Connector Health Checks'

    def __str__(self):
        return self.connector_id


class NotificationSetting(models.Model):
    """
    What one notification does on one channel: sent or not for the whole instance, and which fields its message
    shows. `selected_fields` is None until someone chooses, which means "every field of the catalogue".
    """
    notification_type = models.CharField(max_length=64)
    channel = models.CharField(max_length=16)
    enabled = models.BooleanField(default=False)
    selected_fields = models.JSONField(default=None, null=True, blank=True)
    # A message written by hand replaces the one built from the fields; None keeps the catalogue's message.
    custom_template = models.TextField(default=None, null=True, blank=True)
    # Title of the TheHive alert or subject of the email, written by hand.
    custom_title = models.CharField(max_length=500, default=None, null=True, blank=True)

    class Meta:
        unique_together = [('notification_type', 'channel')]
        verbose_name = 'Notification Setting'
        verbose_name_plural = 'Notification Settings'

    def __str__(self):
        return f'{self.notification_type} / {self.channel}'


class ConnectorEvent(models.Model):
    """
    What a connector did, for its Deliveries tab: a test, a notification sent through it, a call to an AI. The last
    ConnectorEvent.KEEP of each connector are kept; nothing here is read by Watcher itself.
    """
    KEEP = 100  # events kept per connector
    KINDS = [('test', 'Test'), ('health', 'Weekly check'), ('notification', 'Notification'), ('ai', 'AI call')]

    connector_id = models.CharField(max_length=100, db_index=True)
    kind = models.CharField(max_length=16, choices=KINDS)
    ok = models.BooleanField()
    message = models.CharField(max_length=300, blank=True, default='')
    # What it was about: the notification, the model that was called
    subject = models.CharField(max_length=150, blank=True, default='')
    duration = models.FloatField(null=True, blank=True, help_text='Seconds')
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [models.Index(fields=['connector_id', '-created_at'])]
        verbose_name = 'Connector Event'
        verbose_name_plural = 'Connector Events'

    def __str__(self):
        return f"{self.connector_id} {self.kind} {'ok' if self.ok else 'failed'}"
