from rest_framework import routers
from .api import (SourceViewSet, TrendyWordViewSet, BannedWordViewSet, SummaryViewSet, MonitoredKeywordViewSet,
                  KeywordHitViewSet)
from .core import start_scheduler
from .favicons import FaviconView
from django.urls import path

router = routers.DefaultRouter()
router.register('api/threats_watcher/source', SourceViewSet, 'source')
router.register('api/threats_watcher/trendyword', TrendyWordViewSet, 'trendyword')
router.register('api/threats_watcher/bannedword', BannedWordViewSet, 'bannedword')
router.register('api/threats_watcher/summary', SummaryViewSet, 'summary')
router.register('api/threats_watcher/monitored-keywords', MonitoredKeywordViewSet, 'monitored-keywords')
router.register('api/threats_watcher/keyword-hits', KeywordHitViewSet, 'keyword-hits')

urlpatterns = router.urls + [
    path('api/threats_watcher/favicon/', FaviconView.as_view(), name='favicon'),
]

# Start Background Threat Watcher Tasks
start_scheduler()
