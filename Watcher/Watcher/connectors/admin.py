from django.contrib import admin
from .models import ConnectorOverride, ConnectorHealthCheck


class NoAddModelAdmin(admin.ModelAdmin):
    """Rows are only ever created programmatically (via the /connectors API
    or the scheduled health check), never by hand - hide the 'Add' button."""

    def has_add_permission(self, request):
        return False


@admin.register(ConnectorOverride)
class ConnectorOverrideAdmin(NoAddModelAdmin):
    pass


@admin.register(ConnectorHealthCheck)
class ConnectorHealthCheckAdmin(NoAddModelAdmin):
    pass
