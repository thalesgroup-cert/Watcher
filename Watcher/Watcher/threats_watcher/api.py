from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import TrendyWord, BannedWord, Summary
from .serializers import TrendyWordSerializer, BannedWordSerializer, SummarySerializer
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
        try:
            trendy_word = TrendyWord.objects.get(name=keyword)
            
            summary = Summary.objects.filter(
                type='trendy_word_summary',
                keywords=keyword
            ).first()
            
            if summary:
                return Response(self.get_serializer(summary).data)
            
            posts_count = trendy_word.posturls.count()
            if posts_count < 3:
                return Response({
                    'error': 'insufficient_data',
                    'message': f'Not enough data to generate summary. Need at least 3 posts, found {posts_count}.',
                    'posts_count': posts_count
                }, status=status.HTTP_400_BAD_REQUEST)
            
            summary = generate_trendy_word_summary(trendy_word.id)
            
            if summary:
                return Response(self.get_serializer(summary).data)
            
            return Response({
                'error': 'generation_failed',
                'message': 'Failed to generate summary'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
        except TrendyWord.DoesNotExist:
            return Response({
                'error': 'not_found',
                'message': f'TrendyWord "{keyword}" not found'
            }, status=status.HTTP_404_NOT_FOUND)