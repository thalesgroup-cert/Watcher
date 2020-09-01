from rest_framework import routers
from .api import DnsMonitoredViewSet, DnsTwistedViewSet, AlertViewSet

from .core import start_scheduler

router = routers.DefaultRouter()
router.register('api/dns_finder/dns_monitored', DnsMonitoredViewSet, 'dns_monitored')
router.register('api/dns_finder/dns_twisted', DnsTwistedViewSet, 'dns_twisted')
router.register('api/dns_finder/alert', AlertViewSet, 'alert')

urlpatterns = router.urls

start_scheduler()
