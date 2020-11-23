# coding=utf-8
from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User


class Keyword(models.Model):
    """
    Stores a word which will be use to search data_leaks.
    """
    name = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = 'Keywords Monitored'

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
        return self.keyword.name


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
    List of the email alert subscriber(s).
    """
    user_rec = models.ForeignKey(User, on_delete=models.CASCADE, related_name='data_leak')
    created_at = models.DateTimeField(default=timezone.now)
