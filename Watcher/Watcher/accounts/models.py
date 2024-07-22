from django.db import models
from django_auth_ldap.backend import populate_user
from django.contrib.auth.models import User
from knox.models import AuthToken
from django.db.models.signals import post_delete
from django.dispatch import receiver

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

@receiver(post_delete, sender=APIKey)
def delete_authtoken_when_apikey_deleted(sender, instance, **kwargs):
    try:
        if instance.auth_token:
            instance.auth_token.delete()
    except AuthToken.DoesNotExist:
        pass


def make_inactive(sender, user, **kwargs):
    if not User.objects.filter(username=user.username):
        user.is_active = False

populate_user.connect(make_inactive)