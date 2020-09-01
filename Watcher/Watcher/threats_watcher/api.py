from .models import TrendyWord, BannedWord
from rest_framework import viewsets, permissions
from .serializers import TrendyWordSerializer, BannedWordSerializer


# TrendyWord Viewset
class TrendyWordViewSet(viewsets.ModelViewSet):
    queryset = TrendyWord.objects.all()
    permission_classes = [
        permissions.IsAuthenticatedOrReadOnly
    ]
    serializer_class = TrendyWordSerializer


# BannedWord Viewset
class BannedWordViewSet(viewsets.ModelViewSet):
    queryset = BannedWord.objects.all()
    permission_classes = [
        permissions.IsAuthenticated
    ]
    serializer_class = BannedWordSerializer
