from django.urls import path, include
from rest_framework import routers
from .api import LoginAPI, UserAPI
from knox import views as knox_views
from .api import PasswordChangeViewSet

router = routers.DefaultRouter()
router.register('api/auth/passwordchange', PasswordChangeViewSet, 'passwordchange')

urlpatterns = [
                  path('api/auth', include('knox.urls')),
                  path('api/auth/login', LoginAPI.as_view()),
                  path('api/auth/user', UserAPI.as_view()),
                  path('api/auth/logout', knox_views.LogoutView.as_view(), name='knox_logout'),
              ] + router.urls
