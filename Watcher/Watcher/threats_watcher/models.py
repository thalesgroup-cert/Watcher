# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models
from django.db.models.signals import pre_delete
from django.dispatch import receiver
from django.utils import timezone
from django.contrib.auth.models import User


class Source(models.Model):
    """
    Stores Source RSS Feed Url which will be used to find new words tendencies in **threats_watcher/apps.py** Algorithms.
    """
    url = models.URLField(max_length=250)
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return self.url


class PostUrl(models.Model):
    """
    Stores Post Urls which came from the RSS Feeds.
    Related to severals :model:`threats_watcher.TrendyWord`.
    """
    url = models.URLField(max_length=250, default="")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.url


class TrendyWord(models.Model):
    """
    Stores a word which came from the results from **threats_watcher/apps.py** Algorithms.
    Related to severals :model:`threats_watcher.PostUrl`.
    """
    name = models.CharField(max_length=100)
    occurrences = models.IntegerField(default=1,
                                      help_text="Incremented by one when the same word is found in another post from RSS Feeds.")
    posturls = models.ManyToManyField(PostUrl)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


@receiver(pre_delete, sender=TrendyWord)
def cascade_delete_branch(sender, instance, **kwargs):
    """
    Delete unused :model:`threats_watcher.PostUrl` when a :model:`threats_watcher.TrendyWord` is deleted.
    Also verified if the posts is not reference for another :model:`threats_watcher.TrendyWord`.
    """
    for posturl in instance.posturls.all():
        # If posturl is associated to 1 or 0 trendyword, we can remove it
        if TrendyWord.objects.filter(posturls=posturl).count() <= 1:
            PostUrl.objects.get(url=posturl).delete()


class BannedWord(models.Model):
    """
    Stores a word which will be banned from the :model:`threats_watcher.TrendyWord` results.
    """
    name = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = 'block word'
        verbose_name_plural = 'Blocklist'


class Subscriber(models.Model):
    """
    List of the email alert subscriber(s).
    """
    user_rec = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        verbose_name_plural = 'subscribers'
