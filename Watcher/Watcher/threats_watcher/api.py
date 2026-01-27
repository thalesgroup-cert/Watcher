from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import TrendyWord, BannedWord, Summary, MonitoredKeyword
from .serializers import TrendyWordSerializer, BannedWordSerializer, SummarySerializer, MonitoredKeywordSerializer
from .core import generate_trendy_word_summary


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
            queryset = queryset.filter(keywords=keyword)
        
        return queryset

    @action(detail=False, methods=['get'], url_path='by-keyword/(?P<keyword>[^/.]+)')
    def by_keyword(self, request, keyword=None):
        import logging
        logger = logging.getLogger('watcher.threats_watcher')

        try:
            from .summary_manager import get_article_title_or_summary, clean_text_and_metadata
        except Exception:
            logger.exception("Failed to import helper from summary_manager")

        try:
            trendy_word = TrendyWord.objects.get(name=keyword)

            summary = Summary.objects.filter(
                type='trendy_word_summary',
                keywords=keyword
            ).first()

            if summary:
                return Response(self.get_serializer(summary).data)

            posts_qs = list(trendy_word.posturls.all().order_by('-created_at')[:15])
            posts_count = len(trendy_word.posturls.all())

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
                summary = generate_trendy_word_summary(trendy_word.id)
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

        except TrendyWord.DoesNotExist:
            return Response({
                'error': 'not_found',
                'message': f'TrendyWord "{keyword}" not found'
            }, status=status.HTTP_404_NOT_FOUND)


class MonitoredKeywordViewSet(viewsets.ModelViewSet):
    queryset = MonitoredKeyword.objects.all()
    permission_classes = [permissions.DjangoModelPermissions]
    serializer_class = MonitoredKeywordSerializer
    
    def perform_create(self, serializer):
        """Associate the keyword with the current user and mark matching TrendyWords."""
        keyword = serializer.save(created_by=self.request.user)
        
        # Find matching TrendyWords and mark them as monitored
        trendy_words = TrendyWord.objects.filter(name__iexact=keyword.name)
        for word in trendy_words:
            word.is_monitored = True
            word.monitored_temperature = keyword.temperature
            word.save()
    
    def perform_update(self, serializer):
        """Update matching TrendyWords when keyword temperature is changed."""
        keyword = serializer.save()
        
        # Find matching TrendyWords and update their temperature
        trendy_words = TrendyWord.objects.filter(name__iexact=keyword.name)
        for word in trendy_words:
            word.is_monitored = True
            word.monitored_temperature = keyword.temperature
            word.save()
    
    def perform_destroy(self, instance):
        """When deleting a monitored keyword, remove monitoring flags from TrendyWords."""
        # Find matching TrendyWords
        trendy_words = TrendyWord.objects.filter(name__iexact=instance.name)
        
        for word in trendy_words:
            word.is_monitored = False
            word.monitored_temperature = None
            word.save()
        
        # Delete the keyword
        instance.delete()
    
    @action(detail=True, methods=['get'])
    def articles(self, request, pk=None):
        """
        Get all articles mentioning this monitored keyword.
        Returns PostUrls with full metadata.
        """
        keyword = self.get_object()
        
        # Find all TrendyWords matching this keyword (case-insensitive)
        trendy_words = TrendyWord.objects.filter(name__iexact=keyword.name)
        
        # Collect all associated PostUrls
        articles = []
        for word in trendy_words:
            for posturl in word.posturls.all():
                articles.append({
                    'url': posturl.url,
                    'created_at': posturl.created_at,
                    'detected_word': word.name,
                    'occurrences': word.occurrences
                })
        
        return Response({
            'keyword': keyword.name,
            'total_articles': len(articles),
            'articles': articles
        })
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """
        Get aggregated statistics for all monitored keywords.
        """
        stats = []
        for keyword in self.get_queryset():
            matching_words = TrendyWord.objects.filter(name__iexact=keyword.name)
            total_articles = sum(word.posturls.count() for word in matching_words)
            
            stats.append({
                'id': keyword.id,
                'name': keyword.name,
                'temperature': keyword.temperature,
                'total_detections': keyword.total_detections,
                'total_articles': total_articles,
                'last_detected_at': keyword.last_detected_at,
                'created_at': keyword.created_at
            })
        
        return Response(stats)