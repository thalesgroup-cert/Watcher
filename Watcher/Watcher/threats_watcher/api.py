import logging
from rest_framework import viewsets, permissions, status, filters
from rest_framework.pagination import PageNumberPagination
from django.db import transaction
from django.db.models import Count, Q

logger = logging.getLogger('watcher.threats_watcher')
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Prefetch
from datetime import timedelta
from common.bulk import BulkActionMixin, BulkCreateMixin
from .models import Source, TrendyWord, BannedWord, Summary, MonitoredKeyword, PostUrl, KeywordHit
from .serializers import SourceSerializer, TrendyWordSerializer, TrendyWordListSerializer, TrendyWordDetailSerializer, \
    BannedWordSerializer, SummarySerializer, MonitoredKeywordSerializer, MonitoredKeywordListSerializer, \
    KeywordHitSerializer
from .core import generate_trendy_word_summary


def _timeline_prefetch(to_attr='_timeline_events'):
    from timeline.models import TimelineEvent
    return Prefetch(
        'timeline_events',
        queryset=TimelineEvent.objects.select_related('user__profile').order_by('-timestamp'),
        to_attr=to_attr,
    )


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 1000


# ?period= : created since (0 = today)
PERIODS = {'today': 0, '7d': 7, '30d': 30}

# ?confidence= on trendy words: average reliability of the sources that mention them (TrendyWord.score, 0-100)
SCORE_RANGES = {'high': Q(score__gte=70), 'medium': Q(score__gt=30, score__lt=70), 'low': Q(score__lte=30)}


def created_since(queryset, params, field='created_at'):
    """Keep the rows created during ?period= (today, 7d, 30d)."""
    if params.get('period') in PERIODS:
        since = timezone.now().date() - timedelta(days=PERIODS[params['period']])
        queryset = queryset.filter(**{f'{field}__date__gte': since})
    return queryset


class SourceViewSet(BulkCreateMixin, BulkActionMixin, viewsets.ModelViewSet):
    """
    CRUD for RSS feed sources.
    List filters: ?country_code=FR, ?confidence=1|2|3 (1 = most reliable), ?status=ok|failing|unchecked
    (last fetch), ?search= (URL, country).
    """
    bulk_field = 'url'
    bulk_update_fields = ('confident', 'country', 'country_code')
    queryset = Source.objects.all()
    permission_classes = [permissions.DjangoModelPermissionsOrAnonReadOnly]
    serializer_class = SourceSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['url', 'country', 'country_code']
    ordering_fields = ['url', 'country', 'country_code', 'confident', 'last_status_code', 'last_checked', 'created_at']

    def get_queryset(self):
        queryset = Source.objects.all().order_by('-created_at', '-id').prefetch_related(_timeline_prefetch())
        params = self.request.query_params
        country_code = params.get('country_code')
        if country_code:
            queryset = queryset.filter(country_code__iexact=country_code)
        confidence = params.get('confidence')
        if confidence in ('1', '2', '3'):
            queryset = queryset.filter(confident=int(confidence))
        state = params.get('status')
        if state == 'ok':
            queryset = queryset.filter(last_status_code=200)
        elif state == 'failing':
            queryset = queryset.filter(last_status_code__isnull=False).exclude(last_status_code=200)
        elif state == 'unchecked':
            queryset = queryset.filter(last_status_code__isnull=True)
        return queryset

    @action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny], url_path='statistics')
    def get_statistics(self, request):
        """Return source and trendy-word statistics for Threats Watcher."""
        try:
            from django.db.models import Count
            from django.db.models.functions import TruncDate
            today = timezone.now().date()
            week_ago = timezone.now() - timedelta(days=7)

            # Top 5 words by occurrences
            top_words = list(
                TrendyWord.objects.order_by('-occurrences')[:5].values('name', 'occurrences')
            )

            # Daily new words for the last 7 days (oldest → newest)
            daily_counts = {
                entry['date']: entry['count']
                for entry in TrendyWord.objects
                    .filter(created_at__gte=week_ago)
                    .annotate(date=TruncDate('created_at'))
                    .values('date')
                    .annotate(count=Count('id'))
            }
            daily_new = [
                daily_counts.get(today - timedelta(days=6 - i), 0)
                for i in range(7)
            ]

            def per_day(queryset):
                """Rows created on each of the last 30 days, oldest first."""
                days = [today - timedelta(days=i) for i in range(29, -1, -1)]
                counts = {row['date']: row['count'] for row in queryset.filter(created_at__date__gte=days[0])
                          .annotate(date=TruncDate('created_at')).values('date').annotate(count=Count('id'))}
                return [{'date': d.isoformat(), 'count': counts.get(d, 0)} for d in days]

            sources = Source.objects.all()
            return Response({
                'totalWords':        TrendyWord.objects.count(),
                'newToday':          TrendyWord.objects.filter(created_at__date=today).count(),
                'newThisWeek':       TrendyWord.objects.filter(created_at__gte=week_ago).count(),
                'totalSources':      sources.count(),
                'failingSources':    sources.filter(last_status_code__isnull=False).exclude(last_status_code=200).count(),
                'bannedWords':       BannedWord.objects.count(),
                'monitoredKeywords': MonitoredKeyword.objects.count(),
                'monitoredSeen':     MonitoredKeyword.objects.filter(last_seen__isnull=False).count(),
                'monitoredByLevel':  dict(MonitoredKeyword.objects.values_list('level').annotate(n=Count('id')).order_by()),
                'topWords':          top_words,
                'dailyNew':          daily_new,
                'wordsPerDay':       per_day(TrendyWord.objects.all()),
                'articlesPerDay':    per_day(PostUrl.objects.all()),
                'sourcesByCountry':  [
                    {'code': row['country_code'], 'country': row['country'], 'count': row['n']}
                    for row in sources.exclude(country_code='').values('country_code', 'country')
                    .annotate(n=Count('id')).order_by('-n', 'country')
                ],
                'sourcesByConfidence': {str(c): n for c, n in sources.values_list('confident').annotate(n=Count('id')).order_by()},
            }, status=status.HTTP_200_OK)
        except Exception:
            logger.exception("Error computing Threats Watcher statistics")
            return Response({'error': 'An internal error occurred.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class TrendyWordViewSet(viewsets.ModelViewSet):
    """
    Trending words. List filters: ?search=, ?period=today|7d|30d (first seen), ?confidence=high|medium|low
    (TrendyWord.score); list rows carry `posts_count`, a single word carries its articles (`posts`).
    """
    queryset = TrendyWord.objects.all()
    permission_classes = [
        permissions.DjangoModelPermissionsOrAnonReadOnly
    ]
    serializer_class = TrendyWordSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name', 'occurrences', 'score', 'created_at', 'posts_count']

    def get_serializer_class(self):
        if self.action == 'list':
            return TrendyWordListSerializer
        if self.action == 'retrieve':
            return TrendyWordDetailSerializer
        return TrendyWordSerializer

    def get_queryset(self):
        qs = TrendyWord.objects.annotate(posts_count=Count('posturls', distinct=True)).order_by('-occurrences', '-created_at', '-id')
        if self.action != 'list':
            return qs
        params = self.request.query_params
        qs = created_since(qs, params)
        if params.get('confidence') in SCORE_RANGES:
            qs = qs.filter(SCORE_RANGES[params['confidence']])
        return qs

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def ban(self, request, pk=None):
        """
        Ban a trending word: it is added to the banned words (so it is not picked up again) and removed from
        the trends, in one transaction. Needs the rights of both steps.
        """
        if not (request.user.has_perm('threats_watcher.add_bannedword')
                and request.user.has_perm('threats_watcher.delete_trendyword')):
            return Response({'detail': 'You do not have permission to perform this action.'},
                            status=status.HTTP_403_FORBIDDEN)
        word = self.get_object()
        with transaction.atomic():
            banned, created = BannedWord.objects.get_or_create(name=word.name)
            word.delete()
        return Response({'banned_word': BannedWordSerializer(banned).data, 'created': created}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def graph(self, request):
        """
        The most mentioned words and the links between them (issue #334): two words are linked when articles mention
        both, the link weight is the number of such articles. ?limit= words (10-100, default 50), ?period= as the list.
        """
        try:
            limit = min(100, max(10, int(request.query_params.get('limit', 50))))
        except (TypeError, ValueError):
            limit = 50
        words = list(created_since(TrendyWord.objects.all(), request.query_params).order_by('-occurrences', '-id')[:limit])
        ids = [w.id for w in words]
        posts_by_word = {}
        for word_id, post_id in TrendyWord.posturls.through.objects.filter(trendyword_id__in=ids).values_list('trendyword_id', 'posturl_id'):
            posts_by_word.setdefault(word_id, set()).add(post_id)
        links = []
        for i, a in enumerate(ids):
            for b in ids[i + 1:]:
                shared = len(posts_by_word.get(a, set()) & posts_by_word.get(b, set()))
                if shared:
                    links.append({'source': a, 'target': b, 'weight': shared})
        return Response({
            'nodes': [
                {'id': w.id, 'name': w.name, 'occurrences': w.occurrences, 'score': w.score, 'posts_count': len(posts_by_word.get(w.id, ()))}
                for w in words
            ],
            'links': links,
        })

    @action(detail=True, methods=['get'])
    def with_summary(self, request, pk=None):
        """Get TrendyWord with its associated summary"""
        trendy_word = self.get_object()
        summary = Summary.objects.filter(
            type='trendy_word_summary',
            keywords=trendy_word.name
        ).first()
        
        word_data = self.get_serializer(trendy_word).data
        word_data['summary'] = SummarySerializer(summary).data if summary else None
        
        return Response(word_data)


# BannedWord Viewset
class BannedWordViewSet(BulkCreateMixin, BulkActionMixin, viewsets.ModelViewSet):
    bulk_field = 'name'
    permission_classes = [permissions.DjangoModelPermissions]
    serializer_class = BannedWordSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name', 'created_at']

    def get_queryset(self):
        return BannedWord.objects.all().order_by('-created_at', '-id').prefetch_related(_timeline_prefetch())


class MonitoredKeywordViewSet(BulkCreateMixin, BulkActionMixin, viewsets.ModelViewSet):
    bulk_field = 'name'
    bulk_update_fields = ('level', 'is_active')
    permission_classes = [permissions.DjangoModelPermissionsOrAnonReadOnly]
    serializer_class = MonitoredKeywordSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name', 'level', 'occurrences', 'last_seen', 'created_at', 'posts_count', 'open_hits_count']

    def get_serializer_class(self):
        # List rows count their articles; a single keyword carries them.
        return MonitoredKeywordListSerializer if self.action == 'list' else MonitoredKeywordSerializer

    def get_queryset(self):
        # Meta.ordering does not apply to an aggregated queryset: ordered explicitly.
        qs = (MonitoredKeyword.objects.annotate(posts_count=Count('posturls', distinct=True),
                                                hits_count=Count('hits', distinct=True),
                                                open_hits_count=Count('hits', filter=Q(hits__is_archived=False), distinct=True))
              .order_by('-occurrences', 'name').prefetch_related(_timeline_prefetch()))
        if self.action != 'list':
            return qs
        params = self.request.query_params
        if params.get('level') in dict(MonitoredKeyword.LEVEL_CHOICES):
            qs = qs.filter(level=params['level'])
        if params.get('seen') == 'yes':
            qs = qs.filter(last_seen__isnull=False)
        elif params.get('seen') == 'no':
            qs = qs.filter(last_seen__isnull=True)
        # ?kind=rule: the keywords written as rules (several words); ?kind=word: the single words
        if params.get('kind') == 'rule':
            qs = qs.exclude(all_of=[], any_of=[])
        elif params.get('kind') == 'word':
            qs = qs.filter(all_of=[], any_of=[])
        if params.get('active') in ('yes', 'no'):
            qs = qs.filter(is_active=params['active'] == 'yes')
        return qs


class SummaryViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissionsOrAnonReadOnly]
    serializer_class = SummarySerializer
    
    def get_queryset(self):
        queryset = Summary.objects.all()
        summary_type = self.request.query_params.get('type', None)
        keyword = self.request.query_params.get('keyword', None)
        
        if summary_type:
            queryset = queryset.filter(type=summary_type)
        if keyword:
            queryset = queryset.filter(keywords__iexact=keyword.strip())
        
        return queryset

    @action(detail=False, methods=['get'], url_path='by-keyword/(?P<keyword>[^/.]+)')
    def by_keyword(self, request, keyword=None):
        import logging
        logger = logging.getLogger('watcher.threats_watcher')

        try:
            from .summary_manager import (
                get_article_title_or_summary,
                clean_text_and_metadata,
                generate_keyword_summary_from_posturls,
            )
        except Exception:
            logger.exception("Failed to import helper from summary_manager")
            return Response({
                'error': 'generation_error',
                'message': 'Summary generation helpers are unavailable.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            keyword = (keyword or '').strip()
            if not keyword:
                return Response({
                    'error': 'not_found',
                    'message': 'Keyword is empty.'
                }, status=status.HTTP_404_NOT_FOUND)

            trendy_word = TrendyWord.objects.filter(name__iexact=keyword).first()
            monitored_keyword = None

            if trendy_word:
                resolved_keyword = trendy_word.name
                posts_source_qs = trendy_word.posturls.all()
            else:
                monitored_keyword = MonitoredKeyword.objects.filter(name__iexact=keyword).first()
                if not monitored_keyword:
                    return Response({
                        'error': 'not_found',
                        'message': f'Keyword "{keyword}" not found in TrendyWord or MonitoredKeyword'
                    }, status=status.HTTP_404_NOT_FOUND)

                resolved_keyword = monitored_keyword.name
                posts_source_qs = monitored_keyword.posturls.all()

            summary = Summary.objects.filter(
                type='trendy_word_summary',
                keywords__iexact=resolved_keyword
            ).first()

            if summary:
                return Response(self.get_serializer(summary).data)

            posts_qs = list(posts_source_qs.order_by('-created_at')[:15])
            posts_count = posts_source_qs.count()

            if posts_count < 3:
                return Response({
                    'error': 'insufficient_data',
                    'message': f'Not enough data to generate summary. Need at least 3 posts, found {posts_count}.',
                    'posts_count': posts_count
                }, status=status.HTTP_400_BAD_REQUEST)

            valid_sources = 0
            sample_valid_urls = []
            try:
                for p in posts_qs:
                    try:
                        txt = get_article_title_or_summary(p) or ""
                    except Exception:
                        txt = ""
                    try:
                        txt = clean_text_and_metadata(txt)
                    except Exception:
                        # if cleaning fails, keep raw txt
                        pass
                    if txt and len(txt.strip()) >= 30:
                        valid_sources += 1
                        if len(sample_valid_urls) < 5:
                            sample_valid_urls.append(p.url)
                    if valid_sources >= 3:
                        break
            except Exception:
                logger.exception("Error while checking post contents for keyword %s", keyword)

            if valid_sources < 3:
                return Response({
                    'error': 'insufficient_content',
                    'message': 'Not enough valid/extractable content from the available posts to generate an AI summary.',
                    'posts_count': posts_count,
                    'valid_sources': valid_sources,
                    'sample_valid_urls': sample_valid_urls
                }, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

            # Try to generate summary
            try:
                if trendy_word:
                    summary = generate_trendy_word_summary(trendy_word.id)
                else:
                    summary = generate_keyword_summary_from_posturls(resolved_keyword, posts_qs)
            except Exception:
                logger.exception("Exception while generating summary for '%s'", keyword)
                return Response({
                    'error': 'generation_exception',
                    'message': 'An exception occurred during summary generation.',
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            if summary:
                return Response(self.get_serializer(summary).data)
            else:
                return Response({
                    'error': 'generation_failed',
                    'message': 'Summary generation did not produce a result despite having valid content.',
                    'posts_count': posts_count,
                    'valid_sources': valid_sources
                }, status=status.HTTP_502_BAD_GATEWAY)
        except Exception:
            logger.exception("Unexpected error in by_keyword for '%s'", keyword)
            return Response({
                'error': 'generation_error',
                'message': 'Unexpected error while processing keyword summary request.',
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class KeywordHitViewSet(BulkActionMixin, viewsets.ModelViewSet):
    """The articles that matched a monitored keyword written as a rule. Filters: ?keyword=<id>,
    ?status=active|archived, ?search (title). Only the archived flag can be changed."""
    http_method_names = ['get', 'patch', 'delete', 'head', 'options', 'post']  # POST: the bulk actions
    bulk_update_fields = ('is_archived',)
    permission_classes = [permissions.DjangoModelPermissions]
    serializer_class = KeywordHitSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['hit_at', 'title']

    def get_queryset(self):
        qs = KeywordHit.objects.select_related('keyword').order_by('-hit_at', '-id')
        params = self.request.query_params
        if params.get('keyword', '').isdigit():
            qs = qs.filter(keyword_id=params['keyword'])
        if params.get('status') in ('active', 'archived'):
            qs = qs.filter(is_archived=params['status'] == 'archived')
        if params.get('search'):
            qs = qs.filter(title__icontains=params['search'])
        return qs
