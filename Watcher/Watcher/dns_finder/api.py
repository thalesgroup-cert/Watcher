import logging
from .models import DnsMonitored, DnsTwisted, Alert, KeywordMonitored

logger = logging.getLogger('watcher.dns_finder')
from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django.db.models import Count, Max, Prefetch, Q
from django.db.models.functions import TruncDate
from rest_framework import filters
from django.utils import timezone
from datetime import timedelta
from .serializers import AlertSerializer, DnsMonitoredSerializer, DnsTwistedSerializer, \
    MISPSerializer, KeywordMonitoredSerializer
from .threats import OPEN_STATUSES, serialize_threats, threats_queryset
from common.bulk import BulkActionMixin, BulkCreateMixin, normalize_domain


# Pagination
class StandardResultsSetPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 1000


def threat_counts(prefix):
    """Annotations of a watched asset (domain or keyword): its threats, the open ones, the last one."""
    alert = f'{prefix}__alert'
    return {
        'threats_count': Count(alert),
        'open_threats_count': Count(alert, filter=Q(**{f'{alert}__status__in': OPEN_STATUSES})),
        'last_threat_at': Max(f'{alert}__created_at'),
    }


# DnsMonitored Viewset
class DnsMonitoredViewSet(BulkCreateMixin, BulkActionMixin, viewsets.ModelViewSet):
    bulk_field = 'domain_name'
    bulk_normalizer = staticmethod(normalize_domain)
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = DnsMonitoredSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['domain_name']
    ordering_fields = ['domain_name', 'created_at', 'threats_count', 'open_threats_count', 'takeover_count', 'last_threat_at']

    def get_queryset(self):
        from timeline.models import TimelineEvent
        return DnsMonitored.objects.annotate(
            **threat_counts('dnstwisted'),
            takeover_count=Count('dnstwisted__alert', filter=Q(
                dnstwisted__alert__source=Alert.SOURCE_SUBDOMAIN_TAKEOVER,
                dnstwisted__alert__status__in=OPEN_STATUSES,
            )),
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
        Return statistics for the DNS Threats Monitored module: counters, threats per status and per source,
        threats per day and source over the last 30 days, and the certificate issuers and dnstwist fuzzers
        with the most threats. The assets with the most threats come from their own lists (?ordering=-threats_count):
        counting threats per asset means aggregating every alert, too slow for a request made by every page.
        """
        try:
            today = timezone.now().date()
            week_ago = timezone.now() - timedelta(days=7)
            days = [today - timedelta(days=i) for i in range(29, -1, -1)]
            sources = [value for value, _ in Alert.SOURCE_CHOICES]
            per_day = {d: dict.fromkeys(sources, 0) for d in days}
            for row in (Alert.objects.filter(created_at__gte=days[0])
                        .annotate(day=TruncDate('created_at')).values('day', 'source').annotate(n=Count('id'))):
                if row['day'] in per_day and row['source'] in sources:
                    per_day[row['day']][row['source']] = row['n']

            # Only certificate-sourced rows carry an issuer and only dnstwist rows a fuzzer (see DnsTwisted):
            # no join on the alerts is needed to rank them.
            def top(queryset, field):
                return [{'name': row[field], 'count': row['n']} for row in
                        queryset.exclude(**{f'{field}__isnull': True}).exclude(**{field: ''})
                        .values(field).annotate(n=Count('id')).order_by('-n', field)[:8]]

            # One pass over the alerts: every status / source counter is derived from (status, source) pairs.
            pairs = {(s, src): n for s, src, n in
                     Alert.objects.values_list('status', 'source').annotate(n=Count('id')).order_by()}

            def total(status=None, source=None, statuses=None):
                return sum(n for (s, src), n in pairs.items()
                           if (status is None or s == status) and (statuses is None or s in statuses)
                           and (source is None or src == source))

            by_status, by_source = {}, {}
            for (s, src), n in pairs.items():
                by_status[s] = by_status.get(s, 0) + n
                by_source[src] = by_source.get(src, 0) + n
            takeover = Alert.SOURCE_SUBDOMAIN_TAKEOVER
            return Response({
                'openAlerts':       total(statuses=OPEN_STATUSES),
                'confirmedAlerts':  total(status=Alert.STATUS_CONFIRMED),
                'openTakeover':     total(statuses=OPEN_STATUSES, source=takeover),
                'byStatus':         by_status,
                'bySource':         by_source,
                'perDay':           [{'date': d.isoformat(), **per_day[d]} for d in days],
                'topIssuers':       top(DnsTwisted.objects.all(), 'issuer'),
                'topFuzzers':       top(DnsTwisted.objects.all(), 'fuzzer'),
                'totalAlerts':      total(),
                'newToday':         sum(per_day[today].values()),
                'newThisWeek':      Alert.objects.filter(created_at__gte=week_ago).count(),
                'totalDnsMonitored': DnsMonitored.objects.count(),
                'totalKeywords':    KeywordMonitored.objects.count(),
                'totalDanglingSubdomains': total(source=takeover),
                'totalDanglingConfirmed':  total(status=Alert.STATUS_CONFIRMED, source=takeover),
                'totalDanglingSuspected':  total(status=Alert.STATUS_SUSPECTED, source=takeover),
            }, status=status.HTTP_200_OK)
        except Exception:
            logger.exception("Error computing DNS Threats Monitored statistics")
            return Response({'error': 'An internal error occurred.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'], permission_classes=[permissions.IsAuthenticated], url_path='dangling_subdomains')
    def get_dangling_subdomains(self, request, pk=None):
        """Return every dangling-subdomain-detection DnsTwisted row tracked
        for this Corporate DNS asset (rows with a subdomain_takeover Alert)."""
        dns_monitored = self.get_object()
        subdomains = DnsTwisted.objects.filter(
            dns_monitored=dns_monitored, alert__source=Alert.SOURCE_SUBDOMAIN_TAKEOVER
        ).order_by('-created_at')
        serializer = DnsTwistedSerializer(subdomains, many=True)
        return Response(serializer.data)


# KeywordMonitored Viewset
class KeywordMonitoredViewSet(BulkCreateMixin, BulkActionMixin, viewsets.ModelViewSet):
    bulk_field = 'name'
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = KeywordMonitoredSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name', 'created_at', 'threats_count', 'open_threats_count', 'last_threat_at']

    def get_queryset(self):
        from timeline.models import TimelineEvent
        return KeywordMonitored.objects.annotate(**threat_counts('dnstwisted')).order_by('-created_at').prefetch_related(
            Prefetch(
                'timeline_events',
                queryset=TimelineEvent.objects.select_related('user__profile').order_by('-timestamp'),
                to_attr='_timeline_events',
            )
        )


# DnsTwisted Viewset
class DnsTwistedViewSet(viewsets.ModelViewSet):
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = DnsTwistedSerializer
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        return DnsTwisted.objects.select_related(
            'dns_monitored',
            'keyword_monitored'
        ).order_by('-created_at')


# Alert Viewset
class AlertViewSet(BulkActionMixin, viewsets.ModelViewSet):
    bulk_update_fields = ('status',)

    def bulk_label(self, obj):
        return obj.dns_twisted.domain_name

    permission_classes = [
        permissions.DjangoModelPermissions
    ]    
    serializer_class = AlertSerializer
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        return Alert.objects.select_related(
            'dns_twisted',
            'dns_twisted__dns_monitored',
            'dns_twisted__keyword_monitored'
        ).order_by('-created_at')


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


# MISP Viewset
class MISPViewSet(viewsets.ModelViewSet):
    permission_classes = [
        ExportPermission
    ]
    serializer_class = MISPSerializer


# Unified DNS Threats Monitored view (all 3 sources via a single Alert queryset)
class ThreatsMonitoredView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # Paginated in the database, then only the page is serialized.
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(threats_queryset(request.query_params), request, view=self)
        return paginator.get_paginated_response(serialize_threats(page))


class ThreatDetailView(APIView):
    """One item of the DNS Threats Monitored feed, in the same shape as the list."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        alert = threats_queryset({}).filter(pk=pk).first()
        if alert is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(serialize_threats([alert])[0])
