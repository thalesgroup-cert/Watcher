from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from datetime import timedelta

from .models import CVEAlert, RansomwareGroup, RansomwareVictim, WatchRule, WatchRuleHit
from .serializers import (
    CVEAlertSerializer, RansomwareGroupSerializer, RansomwareVictimSerializer,
    WatchRuleSerializer, WatchRuleHitSerializer,
)


# CVE Alert ViewSet
class CVEAlertViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissionsOrAnonReadOnly]
    serializer_class = CVEAlertSerializer

    def get_queryset(self):
        """Filter CVE alerts based on query parameters."""
        archived = self.request.query_params.get('archived', 'false').lower() in ('true', '1', 'yes')
        queryset = CVEAlert.objects.filter(is_archived=archived).order_by('-published')
        
        # Filter by severity level
        severity = self.request.query_params.get('severity')
        if severity:
            queryset = queryset.filter(severity=severity.upper())
        
        # Filter by publication date range
        days = self.request.query_params.get('days')
        if days:
            try:
                since = timezone.now() - timedelta(days=int(days))
                queryset = queryset.filter(published__gte=since)
            except (ValueError, TypeError):
                pass
        
        return queryset

    @action(detail=True, methods=['patch'], permission_classes=[permissions.DjangoModelPermissions])
    def archive(self, request, pk=None):
        """Toggle is_archived on a CVE alert."""
        cve = self.get_object()
        cve.is_archived = not cve.is_archived
        cve.save(update_fields=['is_archived'])
        return Response(self.get_serializer(cve).data)


# Ransomware Group ViewSet
class RansomwareGroupViewSet(viewsets.ModelViewSet):
    queryset = RansomwareGroup.objects.all().order_by('name')
    permission_classes = [permissions.DjangoModelPermissionsOrAnonReadOnly]
    serializer_class = RansomwareGroupSerializer


# Ransomware Victim ViewSet
class RansomwareVictimViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissionsOrAnonReadOnly]
    serializer_class = RansomwareVictimSerializer

    def get_queryset(self):
        """Filter ransomware victims based on query parameters."""
        archived = self.request.query_params.get('archived', 'false').lower() in ('true', '1', 'yes')
        queryset = RansomwareVictim.objects.select_related('group').filter(is_archived=archived).order_by('-attacked_at')
        
        # Filter by ransomware group
        group = self.request.query_params.get('group')
        if group:
            queryset = queryset.filter(group__name__icontains=group)
        
        # Filter by country
        country = self.request.query_params.get('country')
        if country:
            queryset = queryset.filter(country__icontains=country)
        
        # Filter by attack date range
        days = self.request.query_params.get('days')
        if days:
            try:
                since = timezone.now() - timedelta(days=int(days))
                queryset = queryset.filter(attacked_at__gte=since)
            except (ValueError, TypeError):
                pass
        
        return queryset

    @action(detail=True, methods=['patch'], permission_classes=[permissions.DjangoModelPermissions])
    def archive(self, request, pk=None):
        """Toggle is_archived on a ransomware victim."""
        victim = self.get_object()
        victim.is_archived = not victim.is_archived
        victim.save(update_fields=['is_archived'])
        return Response(self.get_serializer(victim).data)


# Watch Rule ViewSet
class WatchRuleViewSet(viewsets.ModelViewSet):
    queryset = WatchRule.objects.all().order_by('name')
    serializer_class = WatchRuleSerializer
    permission_classes = [permissions.DjangoModelPermissions]


# Watch Rule Hit ViewSet
class WatchRuleHitViewSet(viewsets.ModelViewSet):
    serializer_class = WatchRuleHitSerializer
    permission_classes = [permissions.DjangoModelPermissionsOrAnonReadOnly]

    def get_queryset(self):
        """Filter watch rule hits based on query parameters."""
        archived = self.request.query_params.get('archived', 'false').lower() in ('true', '1', 'yes')
        qs = WatchRuleHit.objects.select_related('rule').filter(is_archived=archived).order_by('-hit_at')
        
        # Filter by rule
        rule_id = self.request.query_params.get('rule')
        if rule_id:
            qs = qs.filter(rule_id=rule_id)
        
        # Filter by hit type
        hit_type = self.request.query_params.get('hit_type')
        if hit_type:
            qs = qs.filter(hit_type=hit_type)
        
        return qs

    @action(detail=True, methods=['patch'], permission_classes=[permissions.DjangoModelPermissions])
    def archive(self, request, pk=None):
        """Toggle is_archived on a watch rule hit."""
        hit = self.get_object()
        hit.is_archived = not hit.is_archived
        hit.save(update_fields=['is_archived'])
        return Response(self.get_serializer(hit).data)
