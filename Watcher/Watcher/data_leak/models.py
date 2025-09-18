# coding=utf-8
from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
import re


def validate_regex(value):
    """
    Validate that the provided string is a valid regex pattern.
    """
    if value:
        try:
            re.compile(value)
        except re.error as e:
            raise ValidationError(f'Invalid regex pattern: {e}')


class Keyword(models.Model):
    """
    Stores a word or regex pattern which will be used to search data_leaks.
    """
    name = models.CharField(max_length=100, unique=True)
    is_regex = models.BooleanField(default=False, verbose_name="Use as Regex Pattern")
    regex_pattern = models.CharField(
        max_length=500, 
        blank=True, 
        null=True,
        validators=[validate_regex],
        help_text="Optional regex pattern. If provided and 'Use as Regex Pattern' is checked, this will be used instead of the name field.",
        verbose_name="Regex Pattern"
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = 'Keywords Monitored'

    def clean(self):
        """
        Custom validation to ensure regex pattern is provided when is_regex is True.
        """
        super().clean()
        if self.is_regex and not self.regex_pattern:
            raise ValidationError("Regex pattern is required when 'Use as Regex Pattern' is enabled.")
        
        # Test the regex pattern if provided
        if self.regex_pattern:
            try:
                re.compile(self.regex_pattern)
            except re.error as e:
                raise ValidationError(f'Invalid regex pattern: {e}')

    def get_search_pattern(self):
        """
        Returns the pattern to use for searching (either name or regex_pattern).
        """
        if self.is_regex and self.regex_pattern:
            return self.regex_pattern
        return self.name

    def __str__(self):
        if self.is_regex and self.regex_pattern:
            return f"{self.name} (regex: {self.regex_pattern})"
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
    List of the alert subscriber(s).
    """
    user_rec = models.ForeignKey(User, on_delete=models.CASCADE, related_name='data_leak')
    created_at = models.DateTimeField(default=timezone.now)

    email = models.BooleanField(default=False, verbose_name="E-mail")
    thehive = models.BooleanField(default=False, verbose_name="TheHive")
    slack = models.BooleanField(default=False, verbose_name="Slack")
    citadel = models.BooleanField(default=False, verbose_name="Citadel")

    class Meta:
        verbose_name_plural = 'subscribers'

    def __str__(self):
        return f'{self.user_rec.username} - {self.created_at}'
