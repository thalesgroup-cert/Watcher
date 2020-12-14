from .models import Site, Alert
from rest_framework import viewsets, permissions
from .serializers import SiteSerializer, AlertSerializer, ThehiveSerializer, MISPSerializer


# Site Viewset
class SiteViewSet(viewsets.ModelViewSet):
    queryset = Site.objects.all()
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = SiteSerializer


# Alert Viewset
class AlertViewSet(viewsets.ModelViewSet):
    queryset = Alert.objects.all()
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = AlertSerializer


class ExportPermission(permissions.DjangoModelPermissions):
    """
    Check for export permission.
    """

    def has_permission(self, request, view):
        has_permission = False
        # If User have permission to add website, then user have permission to export it
        if request.user.has_perm('site_monitoring.add_site'):
            has_permission = True
        return has_permission


# Thehive Viewset
class ThehiveViewSet(viewsets.ModelViewSet):
    permission_classes = [
        ExportPermission
    ]
    serializer_class = ThehiveSerializer


# MISP Viewset
class MISPViewSet(viewsets.ModelViewSet):
    permission_classes = [
        ExportPermission
    ]
    serializer_class = MISPSerializer
