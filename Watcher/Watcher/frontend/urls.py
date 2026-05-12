from django.urls import path
from .api import ConfigAPI
from .views import IndexView

urlpatterns = [
    path('', IndexView.as_view()),
    path('api/config/', ConfigAPI.as_view()),
]
