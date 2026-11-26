import logging

from django.middleware.csrf import get_token
from django.shortcuts import redirect
from mozilla_django_oidc.views import OIDCAuthenticationCallbackView
from knox.models import AuthToken

from .core import set_auth_cookies

logger = logging.getLogger('watcher')


class SSOCallbackView(OIDCAuthenticationCallbackView):
    """
    Override the OIDC callback to issue a Knox token instead of a
    Django session, then hand it to the React SPA as an httpOnly cookie:
    the token is never in the address, in the history or in a log.
    The SPA sees ?sso=1 and asks who is signed in.
    """

    def login_success(self):
        user = self.user

        if not user or not user.is_authenticated:
            logger.error("OIDC: user is not authenticated")
            return self.login_failure()

        _, raw_token = AuthToken.objects.create(user)
        logger.info('OIDC SSO: Knox token issued for user %s', user.username)

        response = redirect('/?sso=1')
        set_auth_cookies(self.request, response, raw_token)
        get_token(self.request)
        return response

    def login_failure(self):
        logger.warning('OIDC SSO: authentication failure')
        return redirect('/?sso_error=1#/login')
