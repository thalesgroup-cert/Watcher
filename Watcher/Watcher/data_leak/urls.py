from rest_framework import routers
from .api import KeywordViewSet, AlertViewSet
from .core import start_scheduler

router = routers.DefaultRouter()
router.register('api/data_leak/keyword', KeywordViewSet, 'keyword')
router.register('api/data_leak/alert', AlertViewSet, 'alert')

urlpatterns = router.urls

start_scheduler()
