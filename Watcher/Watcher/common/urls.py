from django.urls import path
from rest_framework import routers
from .api import GlobalSearchView, LegitimateDomainViewSet, PendingActionViewSet
from .jobs_api import ScheduledJobsView
from .overview_api import OverviewView
from .core import start_scheduler

router = routers.DefaultRouter()
router.register('api/common/legitimate_domains', LegitimateDomainViewSet, 'legitimate_domains')
router.register('api/common/pending_actions', PendingActionViewSet, 'pending_actions')

urlpatterns = router.urls + [
    path('api/search/', GlobalSearchView.as_view(), name='global_search'),
    path('api/overview/', OverviewView.as_view(), name='overview'),
    path('api/common/scheduled_jobs/', ScheduledJobsView.as_view(), name='scheduled_jobs'),
]

start_scheduler()
