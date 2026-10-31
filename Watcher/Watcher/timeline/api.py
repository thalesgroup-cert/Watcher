from datetime import timedelta

from django.contrib.contenttypes.models import ContentType
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response

from .models import TimelineEvent
from .serializers import TimelineEventSerializer


class FeedPagination(CursorPagination):
    """Newest first, no COUNT(*): the table holds hundreds of thousands of automated events."""
    page_size = 30
    page_size_query_param = 'page_size'
    max_page_size = 100
    ordering = ('-timestamp', '-id')


def _split(value):
    return [v for v in (value or '').split(',') if v]


class TimelineEventViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Timeline events.

    - list: history of one object. Query params: content_type (app_label.model), object_id.
    - feed: cross-module activity, newest first (cursor pagination). Query params:
      actor (people | automated | me | all, default people), module (app labels, comma separated),
      action (comma separated), search (object name).
    - summary: activity counters for the feed header.
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
        ).select_related('user__profile', 'content_type')

    def _feed_queryset(self):
        params = self.request.query_params
        # user/profile are prefetched: joining them makes MySQL drop the timestamp index and sort the whole table.
        qs = TimelineEvent.objects.select_related('content_type').prefetch_related('user__profile')

        actor = params.get('actor', 'people')
        if actor == 'people':
            qs = qs.filter(user__isnull=False)
        elif actor == 'automated':
            qs = qs.filter(user__isnull=True)
        elif actor == 'me':
            qs = qs.filter(user=self.request.user)

        modules = _split(params.get('module'))
        if modules:
            qs = qs.filter(content_type__app_label__in=modules)

        actions = _split(params.get('action'))
        if actions:
            qs = qs.filter(action__in=actions)

        search = params.get('search', '').strip()
        if search:
            qs = qs.filter(object_repr__icontains=search)

        return qs

    @action(detail=False, methods=['get'])
    def feed(self, request):
        paginator = FeedPagination()
        page = paginator.paginate_queryset(self._feed_queryset(), request, view=self)
        return paginator.get_paginated_response(self.get_serializer(page, many=True).data)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        now = timezone.now()
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week = TimelineEvent.objects.filter(timestamp__gte=now - timedelta(days=7))
        people_week = week.filter(user__isnull=False)

        counts = week.aggregate(
            people_today=Count('id', filter=Q(user__isnull=False, timestamp__gte=today)),
            automated_today=Count('id', filter=Q(user__isnull=True, timestamp__gte=today)),
            people_week=Count('id', filter=Q(user__isnull=False)),
        )
        counts['contributors_week'] = people_week.values('user').distinct().count()
        counts['by_module_week'] = {
            row['content_type__app_label']: row['n']
            for row in people_week.values('content_type__app_label').annotate(n=Count('id'))
        }
        return Response(counts)
