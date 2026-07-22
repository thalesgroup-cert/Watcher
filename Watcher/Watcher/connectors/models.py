from django.db import models


class ConnectorOverride(models.Model):
    """Stores per-connector field overrides entered via the UI."""
    connector_id = models.CharField(max_length=100, primary_key=True)
    overrides = models.JSONField(default=dict, blank=True)

    auto_seeded_fields = models.JSONField(default=list, blank=True)

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
