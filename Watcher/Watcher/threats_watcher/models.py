# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from django.db import models
from django.db.models.signals import pre_delete, post_save
from django.dispatch import receiver
from django.utils import timezone
from datetime import timedelta
from django.contrib.auth.models import User
import logging

class Source(models.Model):
    """
    Stores Source RSS Feed Url which will be used to find new words tendencies in **threats_watcher/apps.py** Algorithms.
    """
    url = models.URLField(max_length=750, unique=True)
    confident = models.IntegerField(default=1)
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return self.url


class PostUrl(models.Model):
    """
    Stores Post Urls which came from the RSS Feeds.
    Related to severals :model:`threats_watcher.TrendyWord`.
    """
    url = models.URLField(max_length=1000, default="")
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
    score = models.FloatField(default=0, help_text="Average confidence score from source (1=100%, 2=50%, 3=20%)")
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
    Also delete related Summary objects and verify if posts are referenced by other TrendyWords.
    """
    # Delete related summaries first
    Summary.objects.filter(
        type='trendy_word_summary',
        keywords=instance.name
    ).delete()
    
    # Delete unused PostUrls
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


class Summary(models.Model):
    """
    Stores summaries for both weekly digests and breaking news alerts.
    """
    TYPE_CHOICES = (
        ('weekly_summary', 'Weekly Summary'),
        ('breaking_news', 'Breaking News'),
        ('trendy_word_summary', 'Trendy Word Summary'),
    )
    
    type = models.CharField(max_length=30, choices=TYPE_CHOICES, default='weekly_summary')
    keywords = models.CharField(max_length=500, blank=True)
    summary_text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name_plural = 'Summaries'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.get_type_display()} - {self.created_at.strftime('%Y-%m-%d %H:%M')}"

    @classmethod
    def cleanup_older_than(cls, days: int = 90) -> int:
        """
        Delete Summaries older than `days` days.
        Returns number of deleted rows.
        """
        cutoff = timezone.now() - timedelta(days=days)
        qs = cls.objects.filter(created_at__lt=cutoff)
        count = qs.count()
        qs.delete()
        return count


@receiver(post_save, sender=TrendyWord)
def auto_generate_trendy_word_summary(sender, instance, created, **kwargs):
    """
    Auto-generate an AI summary when a TrendyWord is created or updated.
    """
    from .summary_manager import generate_trendy_word_summary

    logger = logging.getLogger('watcher.threats_watcher')

    # Check for an existing summary for this keyword
    existing_summary = Summary.objects.filter(
        type='trendy_word_summary',
        keywords=instance.name
    ).first()

    should_generate = False

    if created and instance.occurrences >= 3:
        should_generate = True
        logger.info(f"New TrendyWord '{instance.name}' created with {instance.occurrences} occurrences - generating summary")
    elif not created and instance.posturls.count() >= 5 and not existing_summary:
        should_generate = True
        logger.info(f"TrendyWord '{instance.name}' updated with {instance.posturls.count()} posts - generating summary")

    if should_generate:
        try:
            generate_trendy_word_summary(instance.id)
        except Exception as e:
            logger.error(f"Failed to auto-generate summary for '{instance.name}': {e}", exc_info=True)


class Subscriber(models.Model):
    """
    List of the alert subscriber(s).
    """
    user_rec = models.ForeignKey(User, on_delete=models.CASCADE, related_name='threats_watcher')
    created_at = models.DateTimeField(default=timezone.now)

    email = models.BooleanField(default=False, verbose_name="E-mail")
    thehive = models.BooleanField(default=False, verbose_name="TheHive")
    slack = models.BooleanField(default=False, verbose_name="Slack")
    citadel = models.BooleanField(default=False, verbose_name="Citadel")

    class Meta:
        verbose_name_plural = 'subscribers'

    def __str__(self):
        return f'{self.user_rec.username} - {self.created_at}'