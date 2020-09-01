from django.db import models
from django_auth_ldap.backend import populate_user
from django.contrib.auth.models import User


def make_inactive(sender, user, **kwargs):
    if not User.objects.filter(username=user.username):
        user.is_active = False


populate_user.connect(make_inactive)
