from django.db import models
from django.contrib.auth.models import User
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType


class TimelineEvent(models.Model):
    ACTION_CREATED     = 'created'
    ACTION_UPDATED     = 'updated'
    ACTION_DELETED     = 'deleted'
    ACTION_TRANSFERRED = 'transferred'
    ACTION_CANCELLED   = 'cancelled'

    ACTION_CHOICES = [
        (ACTION_CREATED,     'Created'),
        (ACTION_UPDATED,     'Updated'),
        (ACTION_DELETED,     'Deleted'),
        (ACTION_TRANSFERRED, 'Transfer'),
        (ACTION_CANCELLED,   'Cancel'),
    ]

    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey('content_type', 'object_id')

    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='timeline_events')
    timestamp = models.DateTimeField(auto_now_add=True)


    diff = models.JSONField(default=dict)

    object_repr = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['content_type', 'object_id']),
        ]
        verbose_name = 'Timeline Event'
        verbose_name_plural = 'Timeline Events'

    def __str__(self):
        username = self.user.username if self.user else 'system'
        return f'[{self.get_action_display()}] {self.object_repr} by {username}'
