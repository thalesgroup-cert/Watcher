from .models import Keyword, Alert
from rest_framework import viewsets, permissions
from rest_framework.pagination import PageNumberPagination
from .serializers import KeywordSerializer, AlertSerializer


# Pagination
class StandardResultsSetPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 1000


# Keyword Viewset
class KeywordViewSet(viewsets.ModelViewSet):
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = KeywordSerializer
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        return Keyword.objects.all().order_by('-created_at')


# Alert Viewset
class AlertViewSet(viewsets.ModelViewSet):
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = AlertSerializer
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        return Alert.objects.select_related('keyword').order_by('-created_at')
