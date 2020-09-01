from rest_framework import routers
from .api import TrendyWordViewSet, BannedWordViewSet
from .core import start_scheduler

router = routers.DefaultRouter()
router.register('api/threats_watcher/trendyword', TrendyWordViewSet, 'trendyword')
router.register('api/threats_watcher/bannedword', BannedWordViewSet, 'bannedword')

urlpatterns = router.urls

# Start Background Threat Watcher Tasks
start_scheduler()
