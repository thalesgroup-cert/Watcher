from rest_framework import routers
from .api import SiteViewSet, AlertViewSet, ThehiveViewSet, MISPViewSet
from .core import start_scheduler

router = routers.DefaultRouter()
router.register('api/site_monitoring/site', SiteViewSet, 'site')
router.register('api/site_monitoring/alert', AlertViewSet, 'alert')
router.register('api/site_monitoring/thehive', ThehiveViewSet, 'thehive')
router.register('api/site_monitoring/misp', MISPViewSet, 'misp')

urlpatterns = router.urls

start_scheduler()
