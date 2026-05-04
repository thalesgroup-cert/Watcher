import logging
from urllib.parse import urlencode

from django.shortcuts import redirect
from mozilla_django_oidc.views import OIDCAuthenticationCallbackView
from knox.models import AuthToken

logger = logging.getLogger('watcher')


class SSOCallbackView(OIDCAuthenticationCallbackView):
    """
    Override the OIDC callback to issue a Knox token instead of a
    Django session, then hand it to the React SPA via a query parameter.
    The SPA reads ?sso_token=... on mount, loads it into Redux/localStorage,
    then removes it from the URL.
    """

    def login_success(self):
        user = self.request.user
        _, raw_token = AuthToken.objects.create(user)
        logger.info('OIDC SSO: Knox token issued for user %s', user.username)
        # Redirect to the SPA root; the frontend will consume the token
        return redirect('/?' + urlencode({'sso_token': raw_token}))

    def login_failure(self):
        logger.warning('OIDC SSO: authentication failure')
        return redirect('/#/login?sso_error=1')
