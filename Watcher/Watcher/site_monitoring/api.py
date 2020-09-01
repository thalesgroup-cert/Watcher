from .models import Site, Alert
from rest_framework import viewsets, permissions
from .serializers import SiteSerializer, AlertSerializer, ThehiveSerializer, MISPSerializer


# Site Viewset
class SiteViewSet(viewsets.ModelViewSet):
    queryset = Site.objects.all()
    permission_classes = [
        permissions.IsAuthenticated
    ]
    serializer_class = SiteSerializer


# Alert Viewset
class AlertViewSet(viewsets.ModelViewSet):
    queryset = Alert.objects.all()
    permission_classes = [
        permissions.IsAuthenticated
    ]
    serializer_class = AlertSerializer


# Thehive Viewset
class ThehiveViewSet(viewsets.ModelViewSet):
    permission_classes = [
        permissions.IsAuthenticated
    ]
    serializer_class = ThehiveSerializer


# MISP Viewset
class MISPViewSet(viewsets.ModelViewSet):
    permission_classes = [
        permissions.IsAuthenticated
    ]
    serializer_class = MISPSerializer
