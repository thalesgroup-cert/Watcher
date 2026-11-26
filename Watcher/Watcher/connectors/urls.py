from django.urls import path
from rest_framework.routers import DefaultRouter
from .api import ConnectorViewSet, NotificationListView, NotificationPreviewView, NotificationSettingView

router = DefaultRouter()
router.register('api/connectors', ConnectorViewSet, basename='connectors')

# Before the router: its detail route would take `notifications` for a connector id.
urlpatterns = [
    path('api/connectors/notifications/', NotificationListView.as_view()),
    path('api/connectors/notifications/<str:type_id>/<str:channel>/', NotificationSettingView.as_view()),
    path('api/connectors/notifications/<str:type_id>/<str:channel>/preview/', NotificationPreviewView.as_view()),
] + router.urls
