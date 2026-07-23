import logging

from django.conf import settings
from django.shortcuts import redirect
from mozilla_django_oidc.views import OIDCAuthenticationCallbackView
from knox.models import AuthToken

from .authentication import set_auth_cookies

logger = logging.getLogger('watcher')


class SSOCallbackView(OIDCAuthenticationCallbackView):
    """
    Override the OIDC callback to issue a Knox token instead of a
    Django session, then hand it to the React SPA as an httpOnly cookie.
    The token never appears in the URL, browser history, or access logs —
    the SPA only sees the non-sensitive "session_active" indicator cookie
    and confirms the session via GET /api/auth/user.
    """

    def login_success(self):
        user = self.user

        if not user or not user.is_authenticated:
            logger.error("OIDC: user is not authenticated")
            return self.login_failure()

        _, raw_token = AuthToken.objects.create(user)
        logger.info('OIDC SSO: Knox token issued for user %s', user.username)

        ttl = settings.REST_KNOX.get('TOKEN_TTL')
        max_age = int(ttl.total_seconds()) if ttl else 36_000

        response = redirect('/?sso=1')
        set_auth_cookies(response, raw_token, max_age, secure=not settings.DEBUG)
        return response

    def login_failure(self):
        logger.warning('OIDC SSO: authentication failure')
        return redirect('/?sso_error=1#/login')
