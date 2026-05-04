from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
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
        app_label = 'accounts' 


def make_inactive(sender, user, **kwargs):
    if not User.objects.filter(username=user.username):
        user.is_active = False

populate_user.connect(make_inactive)


class UserProfile(models.Model):
    """Stores user UI preferences server-side."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    theme = models.CharField(max_length=50, default='bootstrap')
    preferences = models.JSONField(default=dict, blank=True)
    # preferences structure:
    # {
    #   "items_per_page": {"threats_watcher": 10, "data_leak": 10, ...},
    #   "saved_filters": {"threats_watcher": {...}, ...}
    # }

    def __str__(self):
        return f"Profile of {self.user.username}"

    class Meta:
        verbose_name = "User Profile"
        verbose_name_plural = "User Profiles"
        app_label = 'accounts'


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.get_or_create(user=instance)


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    if hasattr(instance, 'profile'):
        instance.profile.save()