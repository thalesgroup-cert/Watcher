from .models import Keyword, Alert
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django.utils import timezone
from datetime import timedelta
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

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated], url_path='statistics')
    def get_statistics(self, request):
        """Return statistics for the Data Leak module."""
        try:
            today = timezone.now().date()
            week_ago = timezone.now() - timedelta(days=7)
            return Response({
                'totalAlerts':   Alert.objects.count(),
                'activeAlerts':  Alert.objects.filter(status=True).count(),
                'newToday':      Alert.objects.filter(created_at__date=today).count(),
                'newThisWeek':   Alert.objects.filter(created_at__gte=week_ago).count(),
                'totalKeywords': Keyword.objects.count(),
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# Alert Viewset
class AlertViewSet(viewsets.ModelViewSet):
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = AlertSerializer
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        return Alert.objects.select_related('keyword').order_by('-created_at')
