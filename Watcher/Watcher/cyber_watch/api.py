from datetime import timedelta

from django.db.models import Count, Exists, IntegerField, Max, OuterRef, Prefetch, Q, Subquery, Value
from django.db.models.functions import Coalesce, Concat, TruncDate
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from common.bulk import BulkActionMixin
from .models import CVEAlert, RansomwareGroup, RansomwareVictim, WatchRule, WatchRuleHit
from .serializers import (
    CVEAlertSerializer, RansomwareGroupSerializer, RansomwareVictimSerializer,
    WatchRuleSerializer, WatchRuleHitSerializer, WatchRulePreviewSerializer,
)
from .core import hit_targets, match_rule, record_rule_hits


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 1000


# ?period= : since (0 = today)
PERIODS = {'today': 0, '7d': 7, '30d': 30}
SEVERITIES = ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')


def since(queryset, params, field):
    """Keep the rows of ?period= (today, 7d, 30d), or of the legacy ?days=<n>."""
    if params.get('period') in PERIODS:
        start = timezone.now().date() - timedelta(days=PERIODS[params['period']])
        return queryset.filter(**{f'{field}__date__gte': start})
    days = params.get('days')
    if days:
        try:
            return queryset.filter(**{f'{field}__gte': timezone.now() - timedelta(days=int(days))})
        except (ValueError, TypeError):
            pass
    return queryset


def by_status(queryset, params):
    """?status=active (default) | archived | all; the legacy ?archived=true still works."""
    value = params.get('status')
    if value == 'all':
        return queryset
    if value == 'archived' or params.get('archived', 'false').lower() in ('true', '1', 'yes'):
        return queryset.filter(is_archived=True)
    return queryset.filter(is_archived=False)


def ordered(queryset, params, allowed, default):
    """?ordering= among `allowed` (with or without "-"), ties broken by id."""
    value = params.get('ordering', '')
    field = value if value.lstrip('-') in allowed else default
    tie = '-id' if field.startswith('-') else 'id'
    return queryset.order_by(field, tie)


def open_hits(**filters):
    """Number of hits still to review that point at the outer row."""
    hits = (WatchRuleHit.objects.filter(is_archived=False, **filters).order_by()
            .values('hit_type').annotate(n=Count('id')).values('n'))
    return Coalesce(Subquery(hits, output_field=IntegerField()), 0)


def with_victim_key(queryset):
    return queryset.annotate(hit_key=Concat('group__name', Value('::'), 'victim_name'))


class CVEAlertViewSet(BulkActionMixin, viewsets.ModelViewSet):
    """
    CVEs fetched from cve.circl.lu. Filters: ?status, ?severity=CRITICAL,HIGH (or "none" for not scored yet),
    ?period on the publication date, ?search on the id and description, ?matched=yes|no (a rule matched it).
    """
    permission_classes = [permissions.DjangoModelPermissionsOrAnonReadOnly]
    serializer_class = CVEAlertSerializer
    pagination_class = StandardResultsSetPagination
    bulk_update_fields = ('is_archived',)
    ORDERING = ('published', 'cvss_score', 'cve_id', 'hits_count')

    def get_queryset(self):
        params = self.request.query_params
        queryset = CVEAlert.objects.annotate(hits_count=open_hits(hit_type='cve', object_id=OuterRef('cve_id')))
        if self.action != 'list':
            return queryset
        queryset = by_status(queryset, params)
        severity = [s.strip().upper() for s in params.get('severity', '').split(',') if s.strip()]
        if severity:
            condition = Q(severity__in=[s for s in severity if s in SEVERITIES])
            if 'NONE' in severity:
                condition |= Q(severity='')
            queryset = queryset.filter(condition)
        queryset = since(queryset, params, 'published')
        search = params.get('search', '').strip()
        if search:
            queryset = queryset.filter(Q(cve_id__icontains=search) | Q(description__icontains=search))
        if params.get('matched') in ('yes', 'no'):
            matched = Exists(WatchRuleHit.objects.filter(hit_type='cve', object_id=OuterRef('cve_id')))
            queryset = queryset.filter(matched if params['matched'] == 'yes' else ~matched)
        return ordered(queryset, params, self.ORDERING, '-published')

    @action(detail=True, methods=['patch'], permission_classes=[permissions.DjangoModelPermissions])
    def archive(self, request, pk=None):
        """Toggle is_archived on a CVE alert."""
        cve = self.get_object()
        cve.is_archived = not cve.is_archived
        cve.save(update_fields=['is_archived'])
        return Response(self.get_serializer(cve).data)


class RansomwareGroupViewSet(viewsets.ModelViewSet):
    queryset = RansomwareGroup.objects.annotate(
        victims_count=Count('victims'), last_attack_at=Max('victims__attacked_at'),
    ).order_by('name')
    permission_classes = [permissions.DjangoModelPermissionsOrAnonReadOnly]
    serializer_class = RansomwareGroupSerializer


class RansomwareVictimViewSet(BulkActionMixin, viewsets.ModelViewSet):
    """
    Victims published on ransomware leak sites. Filters: ?status, ?group (name contains) or ?group_id,
    ?country (code), ?sector, ?period on the attack date, ?search on the victim and group, ?matched=yes|no.
    """
    permission_classes = [permissions.DjangoModelPermissionsOrAnonReadOnly]
    serializer_class = RansomwareVictimSerializer
    pagination_class = StandardResultsSetPagination
    bulk_update_fields = ('is_archived',)
    ORDERING = ('attacked_at', 'victim_name', 'group__name', 'country', 'sector', 'hits_count')

    def get_queryset(self):
        params = self.request.query_params
        queryset = with_victim_key(RansomwareVictim.objects.select_related('group'))
        queryset = queryset.annotate(hits_count=open_hits(hit_type='ransomware_victim', object_id=OuterRef('hit_key')))
        if self.action != 'list':
            return queryset
        queryset = by_status(queryset, params)
        if params.get('group'):
            queryset = queryset.filter(group__name__icontains=params['group'])
        if params.get('group_id', '').isdigit():
            queryset = queryset.filter(group_id=params['group_id'])
        if params.get('country'):
            queryset = queryset.filter(country__iexact=params['country'].strip())
        if params.get('sector'):
            queryset = queryset.filter(sector__iexact=params['sector'].strip())
        queryset = since(queryset, params, 'attacked_at')
        search = params.get('search', '').strip()
        if search:
            queryset = queryset.filter(Q(victim_name__icontains=search) | Q(group__name__icontains=search))
        if params.get('matched') in ('yes', 'no'):
            matched = Exists(WatchRuleHit.objects.filter(hit_type='ransomware_victim', object_id=OuterRef('hit_key')))
            queryset = queryset.filter(matched if params['matched'] == 'yes' else ~matched)
        return ordered(queryset, params, self.ORDERING, '-attacked_at')

    @action(detail=True, methods=['patch'], permission_classes=[permissions.DjangoModelPermissions])
    def archive(self, request, pk=None):
        """Toggle is_archived on a ransomware victim."""
        victim = self.get_object()
        victim.is_archived = not victim.is_archived
        victim.save(update_fields=['is_archived'])
        return Response(self.get_serializer(victim).data)


class WatchRuleViewSet(BulkActionMixin, viewsets.ModelViewSet):
    """
    Watch rules, with their hits (`hits_count`, `open_hits_count`, `last_hit_at`). Filters: ?search (name),
    ?scope, ?active=yes|no. `POST preview/` says what a rule would match in the data already collected;
    `POST <id>/scan/` records the hits of a rule on that data (without notifications).
    """
    serializer_class = WatchRuleSerializer
    permission_classes = [permissions.DjangoModelPermissions]
    pagination_class = StandardResultsSetPagination
    bulk_update_fields = ('is_active',)
    ORDERING = ('name', 'scope', 'is_active', 'created_at', 'hits_count', 'open_hits_count', 'last_hit_at')

    def get_queryset(self):
        from timeline.models import TimelineEvent
        params = self.request.query_params
        queryset = WatchRule.objects.annotate(
            hits_count=Count('hits', distinct=True),
            open_hits_count=Count('hits', filter=Q(hits__is_archived=False), distinct=True),
            last_hit_at=Max('hits__hit_at'),
        ).prefetch_related(
            Prefetch(
                'timeline_events',
                queryset=TimelineEvent.objects.select_related('user__profile').order_by('-timestamp'),
                to_attr='_timeline_events',
            )
        )
        if self.action != 'list':
            return queryset
        if params.get('search'):
            queryset = queryset.filter(Q(name__icontains=params['search']) | Q(keywords__icontains=params['search']))
        if params.get('scope') in dict(WatchRule.SCOPE_CHOICES):
            queryset = queryset.filter(scope=params['scope'])
        if params.get('active') in ('yes', 'no'):
            queryset = queryset.filter(is_active=params['active'] == 'yes')
        return ordered(queryset, params, self.ORDERING, 'name')

    @action(detail=False, methods=['post'])
    def preview(self, request):
        serializer = WatchRulePreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(match_rule(**serializer.validated_data))

    @action(detail=True, methods=['post'])
    def scan(self, request, pk=None):
        rule = self.get_object()
        if not rule.is_active:
            return Response({'error': 'The rule is paused.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'created': record_rule_hits(rule)})


class WatchRuleHitViewSet(BulkActionMixin, viewsets.ModelViewSet):
    """
    What the watch rules matched. Filters: ?status, ?hit_type, ?rule, ?object_id (a CVE id or "group::victim"), ?period, ?search. Rows carry the CVE or
    victim they point at (`target`), looked up once for the page.
    """
    serializer_class = WatchRuleHitSerializer
    permission_classes = [permissions.DjangoModelPermissionsOrAnonReadOnly]
    pagination_class = StandardResultsSetPagination
    bulk_update_fields = ('is_archived',)
    ORDERING = ('hit_at', 'rule__name', 'matched_keyword', 'object_id')

    def get_queryset(self):
        params = self.request.query_params
        queryset = WatchRuleHit.objects.select_related('rule')
        if self.action != 'list':
            return queryset
        queryset = by_status(queryset, params)
        if params.get('rule', '').isdigit():
            queryset = queryset.filter(rule_id=params['rule'])
        if params.get('object_id'):
            queryset = queryset.filter(object_id=params['object_id'])
        if params.get('hit_type') in dict(WatchRuleHit.HIT_TYPE_CHOICES):
            queryset = queryset.filter(hit_type=params['hit_type'])
        queryset = since(queryset, params, 'hit_at')
        search = params.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                Q(object_id__icontains=search) | Q(hit_display__icontains=search) | Q(matched_keyword__icontains=search)
            )
        return ordered(queryset, params, self.ORDERING, '-hit_at')

    def bulk_label(self, obj):
        return obj.object_id.replace('::', ' · ')

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        rows = page if page is not None else list(queryset)
        context = {**self.get_serializer_context(), 'targets': hit_targets(rows)}
        data = self.get_serializer_class()(rows, many=True, context=context).data
        return self.get_paginated_response(data) if page is not None else Response(data)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.action == 'retrieve' and 'pk' in self.kwargs:
            hit = WatchRuleHit.objects.filter(pk=self.kwargs['pk']).first()
            context['targets'] = hit_targets([hit] if hit else [])
        return context

    @action(detail=True, methods=['patch'], permission_classes=[permissions.DjangoModelPermissions])
    def archive(self, request, pk=None):
        """Toggle is_archived on a watch rule hit."""
        hit = self.get_object()
        hit.is_archived = not hit.is_archived
        hit.save(update_fields=['is_archived'])
        return Response(self.get_serializer(hit).data)


def per_day(queryset, field, days=30, split=None):
    """[{date, count[, <split value>: n]}] for the last `days` days, every day present."""
    start = timezone.now().date() - timedelta(days=days - 1)
    rows = (queryset.filter(**{f'{field}__date__gte': start}).annotate(day=TruncDate(field))
            .values('day', *([split] if split else [])).annotate(n=Count('id')).order_by())
    out = {start + timedelta(days=i): {'date': (start + timedelta(days=i)).isoformat(), 'count': 0} for i in range(days)}
    for row in rows:
        if row['day'] not in out:
            continue
        out[row['day']]['count'] += row['n']
        if split:
            key = row[split] or 'none'
            out[row['day']][key] = out[row['day']].get(key, 0) + row['n']
    return list(out.values())


def top(queryset, field, limit=10, exclude=('',)):
    rows = queryset.exclude(**{f'{field}__in': exclude}).values(field).annotate(n=Count('id')).order_by('-n', field)[:limit]
    return [{'name': r[field], 'count': r['n']} for r in rows]


class CyberWatchStatisticsView(APIView):
    """Counters and series of the Cyber Watch page. The watch rule figures are only given to users who can see rules."""
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        today = timezone.now().date()
        week = timezone.now() - timedelta(days=7)
        cves = CVEAlert.objects.filter(is_archived=False)
        victims = RansomwareVictim.objects.filter(is_archived=False)
        hits = WatchRuleHit.objects.all()
        data = {
            'cves': {
                'total': cves.count(),
                'critical7d': cves.filter(severity='CRITICAL', published__gte=week).count(),
                'newToday': cves.filter(published__date=today).count(),
                'new7d': cves.filter(published__gte=week).count(),
                'archived': CVEAlert.objects.filter(is_archived=True).count(),
                'matched': cves.filter(Exists(WatchRuleHit.objects.filter(hit_type='cve', object_id=OuterRef('cve_id')))).count(),
                'bySeverity': {
                    (row['severity'] or 'NONE'): row['n']
                    for row in cves.values('severity').annotate(n=Count('id')).order_by()
                },
                'perDay': per_day(cves, 'published', split='severity'),
            },
            'victims': {
                'total': victims.count(),
                'newToday': victims.filter(attacked_at__date=today).count(),
                'new7d': victims.filter(attacked_at__gte=week).count(),
                'archived': RansomwareVictim.objects.filter(is_archived=True).count(),
                'matched': with_victim_key(victims).filter(
                    Exists(WatchRuleHit.objects.filter(hit_type='ransomware_victim', object_id=OuterRef('hit_key')))
                ).count(),
                'groups': RansomwareGroup.objects.count(),
                'activeGroups7d': victims.filter(attacked_at__gte=week).values('group').distinct().count(),
                'perDay': per_day(victims, 'attacked_at'),
                'topGroups': [
                    {'id': r['group_id'], 'name': r['group__name'], 'count': r['n']}
                    for r in victims.values('group_id', 'group__name').annotate(n=Count('id')).order_by('-n', 'group__name')[:10]
                ],
                'topSectors': top(victims, 'sector', exclude=('', 'Not Found', 'Other')),
                'topCountries': top(victims, 'country'),
                # Every country, for the world map.
                'byCountry': top(victims, 'country', limit=300),
            },
            'hits': {
                'open': hits.filter(is_archived=False).count(),
                'openCve': hits.filter(is_archived=False, hit_type='cve').count(),
                'openVictims': hits.filter(is_archived=False, hit_type='ransomware_victim').count(),
                'new7d': hits.filter(hit_at__gte=week).count(),
                'archived': hits.filter(is_archived=True).count(),
                'perDay': per_day(hits, 'hit_at', split='hit_type'),
            },
        }
        if request.user.has_perm('cyber_watch.view_watchrule'):
            rules = WatchRule.objects.annotate(
                open=Count('hits', filter=Q(hits__is_archived=False)), total=Count('hits'),
            ).order_by('-open', '-total', 'name')
            data['rules'] = {
                'total': rules.count(),
                'active': rules.filter(is_active=True).count(),
                'byRule': [
                    {'id': r.id, 'name': r.name, 'open': r.open, 'total': r.total, 'active': r.is_active}
                    for r in rules[:15]
                ],
            }
        return Response(data)
