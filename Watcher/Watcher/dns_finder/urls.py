from rest_framework import routers
from .api import DnsMonitoredViewSet, DnsTwistedViewSet, AlertViewSet, MISPViewSet, KeywordMonitoredViewSet

from .core import start_scheduler

router = routers.DefaultRouter()
router.register('api/dns_finder/dns_monitored', DnsMonitoredViewSet, 'dns_monitored')
router.register('api/dns_finder/keyword_monitored', KeywordMonitoredViewSet, 'keyword_monitored')
router.register('api/dns_finder/dns_twisted', DnsTwistedViewSet, 'dns_twisted')
router.register('api/dns_finder/alert', AlertViewSet, 'alert')
router.register('api/dns_finder/misp', MISPViewSet, 'misp')

urlpatterns = router.urls

start_scheduler()
