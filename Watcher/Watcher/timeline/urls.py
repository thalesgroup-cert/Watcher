from rest_framework import routers
from .api import TimelineEventViewSet

router = routers.DefaultRouter()
router.register('api/timeline/events', TimelineEventViewSet, 'timeline_events')

urlpatterns = router.urls
