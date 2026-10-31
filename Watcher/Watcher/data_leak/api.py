import logging
from .models import Keyword, Alert

logger = logging.getLogger('watcher.data_leak')
from collections import Counter
from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django.utils import timezone
from django.db.models import Count, Max, Prefetch, Q
from datetime import timedelta
from common.bulk import BulkActionMixin, BulkCreateMixin
from common.api import ScreenshotMixin
from .serializers import KeywordSerializer, AlertSerializer, AlertListSerializer, alert_source


# Pagination
class StandardResultsSetPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 1000


# Keyword Viewset
class KeywordViewSet(BulkCreateMixin, BulkActionMixin, viewsets.ModelViewSet):
    bulk_field = 'name'
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = KeywordSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name', 'is_regex', 'created_at', 'alerts_count', 'active_alerts_count', 'last_alert_at']

    def get_queryset(self):
        from timeline.models import TimelineEvent
        return Keyword.objects.annotate(
            alerts_count=Count('alert'),
            active_alerts_count=Count('alert', filter=Q(alert__status=True)),
            last_alert_at=Max('alert__created_at'),
        ).order_by('-created_at').prefetch_related(
            Prefetch(
                'timeline_events',
                queryset=TimelineEvent.objects.select_related('user__profile').order_by('-timestamp'),
                to_attr='_timeline_events',
            )
        )

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated], url_path='statistics')
    def get_statistics(self, request):
        """
        Counters of the Data Leak module, alerts per day over the last 30 days, and the patterns and
        sources with the most alerts (all statuses; the 20 top sources also feed the source filter).
        """
        try:
            now = timezone.now()
            today = now.date()
            days = [today - timedelta(days=i) for i in range(29, -1, -1)]
            per_day = dict.fromkeys(days, 0)
            for created in Alert.objects.filter(created_at__date__gte=days[0]).values_list('created_at', flat=True):
                per_day[created.date()] = per_day.get(created.date(), 0) + 1
            sources = Counter(alert_source(url) for url in Alert.objects.values_list('url', flat=True))
            sources.pop('', None)
            top_keywords = Keyword.objects.annotate(count=Count('alert')).filter(count__gt=0).order_by('-count', 'name')[:8]
            return Response({
                'totalAlerts':   Alert.objects.count(),
                'activeAlerts':  Alert.objects.filter(status=True).count(),
                'archivedAlerts': Alert.objects.filter(status=False).count(),
                'newToday':      Alert.objects.filter(created_at__date=today).count(),
                'newThisWeek':   Alert.objects.filter(created_at__gte=now - timedelta(days=7)).count(),
                'totalKeywords': Keyword.objects.count(),
                'perDay':        [{'date': d.isoformat(), 'count': per_day[d]} for d in days],
                'topKeywords':   [{'id': k.id, 'name': k.name, 'count': k.count} for k in top_keywords],
                'topSources':    [{'source': s, 'count': n} for s, n in sources.most_common(20)],
            }, status=status.HTTP_200_OK)
        except Exception:
            logger.exception("Error computing Data Leak statistics")
            return Response({'error': 'An internal error occurred.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# Alert Viewset
class AlertViewSet(ScreenshotMixin, BulkActionMixin, viewsets.ModelViewSet):
    bulk_update_fields = ('status',)
    # A leak is often deleted afterwards: a screenshot of the page, taken on demand, keeps what it looked like
    screenshot_target = 'data_leak.alert'
    screenshot_permission = 'data_leak.change_alert'

    def screenshot_url(self, obj):
        return obj.url

    def bulk_label(self, obj):
        return f'{obj.keyword.name} - {obj.url}'

    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = AlertSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['url', 'content', 'keyword__name']
    ordering_fields = ['id', 'created_at', 'keyword__name', 'url']

    # ?period= : alerts found since
    PERIODS = {'today': 0, '7d': 7, '30d': 30}

    def get_serializer_class(self):
        return AlertListSerializer if self.action == 'list' else AlertSerializer

    def get_queryset(self):
        qs = Alert.objects.select_related('keyword').order_by('-created_at', '-id')
        if self.action != 'list':
            return qs

        # List filters: ?status=active|archived, ?keyword=<id>, ?source=<host>, ?period=today|7d|30d
        params = self.request.query_params
        state = params.get('status')
        if state in ('active', 'archived'):
            qs = qs.filter(status=state == 'active')
        keyword = params.get('keyword')
        if keyword and keyword.isdigit():
            qs = qs.filter(keyword_id=int(keyword))
        source = params.get('source', '').strip().lower()
        if source:
            qs = qs.filter(Q(url__icontains=f'://{source}/') | Q(url__iendswith=f'://{source}'))
        if params.get('period') in self.PERIODS:
            today = timezone.now().date()
            qs = qs.filter(created_at__date__gte=today - timedelta(days=self.PERIODS[params['period']]))
        return qs
