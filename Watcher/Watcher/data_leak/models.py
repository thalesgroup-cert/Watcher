# coding=utf-8
from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User
from django.contrib.contenttypes.fields import GenericRelation
from django.db.models.signals import post_delete
from django.dispatch import receiver


class Keyword(models.Model):
    """
    Stores a word which will be use to search data_leaks.
    """
    name = models.CharField(max_length=100, unique=True)
    is_regex = models.BooleanField(default=False, verbose_name="Use RegEx")
    created_at = models.DateTimeField(default=timezone.now)
    timeline_events = GenericRelation('timeline.TimelineEvent', related_query_name='keyword')

    class Meta:
        ordering = ["name"]
        verbose_name_plural = 'Search Patterns'

    def __str__(self):
        return self.name


class Alert(models.Model):
    """
    Triggered when a keyword is found in
    """
    keyword = models.ForeignKey(Keyword, on_delete=models.CASCADE)
    url = models.URLField(max_length=250, default="")
    status = models.BooleanField(default=True)
    content = models.TextField(default="")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        # Name shown in the activity feed and the history: where the pattern was found.
        return self.url or self.keyword.name


class PasteId(models.Model):
    """
    List of the past ids already pulled from pastebin.com.
    """
    paste_id = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return self.paste_id


class Subscriber(models.Model):
    """
    List of the alert subscriber(s).
    """
    user_rec = models.ForeignKey(User, on_delete=models.CASCADE, related_name='data_leak')
    created_at = models.DateTimeField(default=timezone.now)

    email = models.BooleanField(default=False, verbose_name="E-mail")

    class Meta:
        verbose_name_plural = 'subscribers'

    def __str__(self):
        return f'{self.user_rec.username} - {self.created_at}'


@receiver(post_delete, sender=Alert)
def forget_alert_screenshots(sender, instance, **kwargs):
    """The screenshots of a leak go away with it."""
    from common.core import forget_screenshots
    forget_screenshots('data_leak.alert', instance.pk)
