from rest_framework import routers
from .api import SourceViewSet, TrendyWordViewSet, BannedWordViewSet, SummaryViewSet, MonitoredKeywordViewSet
from .core import start_scheduler

router = routers.DefaultRouter()
router.register('api/threats_watcher/source', SourceViewSet, 'source')
router.register('api/threats_watcher/trendyword', TrendyWordViewSet, 'trendyword')
router.register('api/threats_watcher/bannedword', BannedWordViewSet, 'bannedword')
router.register('api/threats_watcher/summary', SummaryViewSet, 'summary')
router.register('api/threats_watcher/monitored-keywords', MonitoredKeywordViewSet, 'monitored-keywords')

urlpatterns = router.urls

# Start Background Threat Watcher Tasks
start_scheduler()
