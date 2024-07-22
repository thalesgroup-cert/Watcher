from django.db import models
from django_auth_ldap.backend import populate_user
from django.contrib.auth.models import User
from knox.models import AuthToken


class APIKey(models.Model):
    """
    Manages creation, modification, and deletion of user API keys.
    """
    auth_token = models.OneToOneField(AuthToken, on_delete=models.CASCADE, null=True, blank=True)

    def __str__(self):
        return f"API Key for {self.auth_token.user.username}"

    class Meta:
        verbose_name = "API Key"
        verbose_name_plural = "API Keys"
        app_label = 'auth' 


def make_inactive(sender, user, **kwargs):
    if not User.objects.filter(username=user.username):
        user.is_active = False

populate_user.connect(make_inactive)