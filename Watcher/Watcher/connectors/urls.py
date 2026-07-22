from rest_framework.routers import DefaultRouter
from .api import ConnectorViewSet

router = DefaultRouter()
router.register('api/connectors', ConnectorViewSet, basename='connectors')

urlpatterns = router.urls
