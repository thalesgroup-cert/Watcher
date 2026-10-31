from django.urls import path
from rest_framework import routers
from .api import GlobalSearchView, LegitimateDomainViewSet, PendingActionViewSet
from .core import start_scheduler

router = routers.DefaultRouter()
router.register('api/common/legitimate_domains', LegitimateDomainViewSet, 'legitimate_domains')
router.register('api/common/pending_actions', PendingActionViewSet, 'pending_actions')

urlpatterns = router.urls + [path('api/search/', GlobalSearchView.as_view(), name='global_search')]

start_scheduler()
