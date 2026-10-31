from django.urls import path
from rest_framework import routers
from .api import (
    CVEAlertViewSet, CyberWatchStatisticsView, RansomwareGroupViewSet, RansomwareVictimViewSet, WatchRuleViewSet,
    WatchRuleHitViewSet,
)
from .core import start_scheduler

router = routers.DefaultRouter()
router.register('api/cyber_watch/cves', CVEAlertViewSet, 'cve-alerts')
router.register('api/cyber_watch/ransomware/groups', RansomwareGroupViewSet, 'ransomware-groups')
router.register('api/cyber_watch/ransomware/victims', RansomwareVictimViewSet, 'ransomware-victims')
router.register('api/cyber_watch/watch-rules', WatchRuleViewSet, 'watch-rules')
router.register('api/cyber_watch/watch-rule-hits', WatchRuleHitViewSet, 'watch-rule-hits')

urlpatterns = [
    path('api/cyber_watch/statistics/', CyberWatchStatisticsView.as_view(), name='cyber-watch-statistics'),
] + router.urls

start_scheduler()
