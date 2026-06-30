from rest_framework import viewsets, permissions
from django.contrib.contenttypes.models import ContentType
from .models import TimelineEvent
from .serializers import TimelineEventSerializer


class TimelineEventViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only endpoint to fetch timeline events for a specific object.
    Query params: content_type (app_label.model), object_id
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = TimelineEventSerializer

    def get_queryset(self):
        qs = TimelineEvent.objects.none()

        model_label = self.request.query_params.get('content_type')
        object_id = self.request.query_params.get('object_id')

        if not model_label or not object_id:
            return qs

        try:
            app_label, model_name = model_label.split('.')
            ct = ContentType.objects.get(app_label=app_label, model=model_name)
        except (ValueError, ContentType.DoesNotExist):
            return qs

        return TimelineEvent.objects.filter(
            content_type=ct, object_id=object_id
        ).select_related('user__profile')
