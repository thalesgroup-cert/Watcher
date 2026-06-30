import logging
from mozilla_django_oidc.auth import OIDCAuthenticationBackend

logger = logging.getLogger('watcher')


class WatcherOIDCBackend(OIDCAuthenticationBackend):
    """
    Custom OIDC authentication backend.
    Maps provider claims to Django user fields and handles
    both user creation and update on each SSO login.
    """

    def get_username(self, claims):
        sub = claims.get('sub', '').strip()
        if sub:
            return sub
        email = claims.get('email', '')
        if email:
            return email.split('@')[0]
        return super().get_username(claims)

    def create_user(self, claims):
        user = super().create_user(claims)
        self._update_user_fields(user, claims)
        return user

    def update_user(self, user, claims):
        self._update_user_fields(user, claims)
        return user

    def _update_user_fields(self, user, claims):
        given = (claims.get('given_name') or '').strip()
        family = (claims.get('family_name') or '').strip()
        full = (claims.get('name') or '').strip()

        if given:
            user.first_name = given
        elif full and not user.first_name:
            user.first_name = full.split()[0]

        if family:
            user.last_name = family
        elif full and not user.last_name and len(full.split()) > 1:
            user.last_name = full.split()[-1]

        email = claims.get('email', '')
        if email:
            user.email = email

        user.save(update_fields=['first_name', 'last_name', 'email'])
        logger.info('OIDC login: user %s authenticated via SSO', user.username)
