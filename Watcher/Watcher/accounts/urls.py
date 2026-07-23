from django.urls import path, include
from django.conf import settings
from rest_framework import routers
from mozilla_django_oidc.views import OIDCAuthenticationRequestView
from .api import LoginAPI, LogoutAPI, UserAPI, ProfileAPI
from .api import PasswordChangeViewSet
from .oidc_views import SSOCallbackView

router = routers.DefaultRouter()
router.register('api/auth/passwordchange', PasswordChangeViewSet, 'passwordchange')

urlpatterns = [
    # Registered ahead of knox.urls so our cookie-clearing logout wins over
    # knox's stock LogoutView at the same path.
    path('api/auth/logout/', LogoutAPI.as_view()),
    path('api/auth/', include('knox.urls')),
    path('api/auth/login', LoginAPI.as_view()),
    path('api/auth/user', UserAPI.as_view()),
    path('api/auth/profile', ProfileAPI.as_view()),
] + router.urls

# OIDC routes - only registered when SSO is enabled
if getattr(settings, 'LOGIN_MODE', 'form_only') in ('sso_only', 'both'):
    urlpatterns += [
        path('api/auth/oidc/login/', OIDCAuthenticationRequestView.as_view(), name='oidc_authentication_init'),
        path('api/auth/oidc/callback/', SSOCallbackView.as_view(), name='oidc_authentication_callback'),
    ]
