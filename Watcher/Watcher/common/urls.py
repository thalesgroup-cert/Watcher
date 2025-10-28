from rest_framework import routers
from .api import LegitimateDomainViewSet
from .core import start_scheduler

router = routers.DefaultRouter()
router.register('api/common/legitimate_domains', LegitimateDomainViewSet, 'legitimate_domains')

urlpatterns = router.urls

start_scheduler()
