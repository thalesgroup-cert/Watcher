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
        # Prefer 'preferred_username', fall back to the local part of 'email'
        preferred = claims.get('preferred_username', '').strip()
        if preferred:
            return preferred
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
        user.first_name = claims.get('given_name', claims.get('name', '')).split()[0] if claims.get('given_name') or claims.get('name') else ''
        user.last_name = claims.get('family_name', '')
        email = claims.get('email', '')
        if email:
            user.email = email
        user.save(update_fields=['first_name', 'last_name', 'email'])
        logger.info('OIDC login: user %s authenticated via SSO', user.username)
