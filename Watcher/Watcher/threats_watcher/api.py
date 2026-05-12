from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from datetime import timedelta
from .models import Source, TrendyWord, BannedWord, Summary, MonitoredKeyword
from .serializers import SourceSerializer, TrendyWordSerializer, BannedWordSerializer, SummarySerializer, MonitoredKeywordSerializer
from .core import generate_trendy_word_summary


class SourceViewSet(viewsets.ModelViewSet):
    """
    CRUD for RSS feed sources.
    Supports filtering by country_code: ?country_code=FR
    """
    queryset = Source.objects.all()
    permission_classes = [permissions.DjangoModelPermissionsOrAnonReadOnly]
    serializer_class = SourceSerializer

    def get_queryset(self):
        queryset = Source.objects.all()
        country_code = self.request.query_params.get('country_code')
        if country_code:
            queryset = queryset.filter(country_code__iexact=country_code)
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

            return Response({
                'totalWords':        TrendyWord.objects.count(),
                'newToday':          TrendyWord.objects.filter(created_at__date=today).count(),
                'newThisWeek':       TrendyWord.objects.filter(created_at__gte=week_ago).count(),
                'totalSources':      Source.objects.count(),
                'bannedWords':       BannedWord.objects.count(),
                'monitoredKeywords': MonitoredKeyword.objects.count(),
                'topWords':          top_words,
                'dailyNew':          daily_new,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class TrendyWordViewSet(viewsets.ModelViewSet):
    queryset = TrendyWord.objects.all()
    permission_classes = [
        permissions.DjangoModelPermissionsOrAnonReadOnly
    ]
    serializer_class = TrendyWordSerializer

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
class BannedWordViewSet(viewsets.ModelViewSet):
    queryset = BannedWord.objects.all()
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = BannedWordSerializer


class MonitoredKeywordViewSet(viewsets.ModelViewSet):
    queryset = MonitoredKeyword.objects.all()
    permission_classes = [permissions.DjangoModelPermissionsOrAnonReadOnly]
    serializer_class = MonitoredKeywordSerializer


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
            except Exception as e:
                logger.exception("Exception while generating summary for '%s'", keyword)
                return Response({
                    'error': 'generation_exception',
                    'message': 'An exception occurred during summary generation.',
                    'details': str(e)
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
        except Exception as e:
            logger.exception("Unexpected error in by_keyword for '%s'", keyword)
            return Response({
                'error': 'generation_error',
                'message': 'Unexpected error while processing keyword summary request.',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)