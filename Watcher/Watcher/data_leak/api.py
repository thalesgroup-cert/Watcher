from .models import Keyword, Alert
from rest_framework import viewsets, permissions
from .serializers import KeywordSerializer, AlertSerializer


# Keyword Viewset
class KeywordViewSet(viewsets.ModelViewSet):
    queryset = Keyword.objects.all()
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = KeywordSerializer


# Alert Viewset
class AlertViewSet(viewsets.ModelViewSet):
    queryset = Alert.objects.all()
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = AlertSerializer
