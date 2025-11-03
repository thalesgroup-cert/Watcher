from rest_framework import routers
from .api import TrendyWordViewSet, BannedWordViewSet, SummaryViewSet
from .core import start_scheduler

router = routers.DefaultRouter()
router.register('api/threats_watcher/trendyword', TrendyWordViewSet, 'trendyword')
router.register('api/threats_watcher/bannedword', BannedWordViewSet, 'bannedword')
router.register('api/threats_watcher/summary', SummaryViewSet, 'summary')

urlpatterns = router.urls

# Start Background Threat Watcher Tasks
start_scheduler()
