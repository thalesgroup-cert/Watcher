from django.db import models
from django_auth_ldap.backend import populate_user
from django.contrib.auth.models import User

class APIKey(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    key = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expiration = models.IntegerField(default=30)
    expiry_at = models.DateTimeField(null=True, blank=True)
    key_details = models.TextField(null=True, blank=True)  # Ajout de ce champ

    def __str__(self):
        return f"API Key for {self.user.username}"

    class Meta:
        verbose_name = "API Key"
        verbose_name_plural = "API Keys"
        app_label = 'auth' 


def make_inactive(sender, user, **kwargs):
    if not User.objects.filter(username=user.username):
        user.is_active = False


populate_user.connect(make_inactive)
