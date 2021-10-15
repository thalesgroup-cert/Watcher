from .models import DnsMonitored, DnsTwisted, Alert, KeywordMonitored
from rest_framework import viewsets, permissions
from .serializers import AlertSerializer, DnsMonitoredSerializer, DnsTwistedSerializer, ThehiveSerializer, \
    MISPSerializer, KeywordMonitoredSerializer


# DnsMonitored Viewset
class DnsMonitoredViewSet(viewsets.ModelViewSet):
    queryset = DnsMonitored.objects.all()
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = DnsMonitoredSerializer


# KeywordMonitored Viewset
class KeywordMonitoredViewSet(viewsets.ModelViewSet):
    queryset = KeywordMonitored.objects.all()
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = KeywordMonitoredSerializer


# DnsTwisted Viewset
class DnsTwistedViewSet(viewsets.ModelViewSet):
    queryset = DnsTwisted.objects.all()
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = DnsTwistedSerializer


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
