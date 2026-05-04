from django.urls import path, include
from django.conf import settings
from rest_framework import routers
from mozilla_django_oidc.views import OIDCAuthenticationRequestView
from .api import LoginAPI, UserAPI, ProfileAPI
from .api import PasswordChangeViewSet
from .oidc_views import SSOCallbackView

router = routers.DefaultRouter()
router.register('api/auth/passwordchange', PasswordChangeViewSet, 'passwordchange')

urlpatterns = [
    path('api/auth/', include('knox.urls')),
    path('api/auth/login', LoginAPI.as_view()),
    path('api/auth/user', UserAPI.as_view()),
    path('api/auth/profile', ProfileAPI.as_view()),
] + router.urls

# OIDC routes — only registered when SSO is enabled
if getattr(settings, 'OIDC_ENABLED', False):
    urlpatterns += [
        path('api/auth/oidc/login/', OIDCAuthenticationRequestView.as_view(), name='oidc_authentication_init'),
        path('api/auth/oidc/callback/', SSOCallbackView.as_view(), name='oidc_authentication_callback'),
    ]
