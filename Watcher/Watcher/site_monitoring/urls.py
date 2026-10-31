from rest_framework import routers
from .api import SiteViewSet, AlertViewSet, MISPViewSet, MonitoredPageViewSet
from .core import start_scheduler

router = routers.DefaultRouter()
router.register('api/site_monitoring/site', SiteViewSet, 'site')
router.register('api/site_monitoring/alert', AlertViewSet, 'alert')
router.register('api/site_monitoring/misp', MISPViewSet, 'misp')
router.register('api/site_monitoring/page', MonitoredPageViewSet, 'monitored-page')

urlpatterns = router.urls

start_scheduler()
