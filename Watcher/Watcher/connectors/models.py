from django.db import models


class ConnectorOverride(models.Model):
    """Stores per-connector field overrides entered via the UI."""
    connector_id = models.CharField(max_length=100, primary_key=True)
    overrides = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = 'Connector Override'
        verbose_name_plural = 'Connector Overrides'

    def __str__(self):
        return self.connector_id
