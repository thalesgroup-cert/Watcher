import logging
from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q, Count
from django.utils import timezone
from datetime import datetime, timedelta
from .models import LegitimateDomain, PendingAction
from .serializers import LegitimateDomainSerializer, PendingActionSerializer

logger = logging.getLogger(__name__)


# Pagination
class StandardResultsSetPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 1000


# LegitimateDomain Viewset
class LegitimateDomainViewSet(viewsets.ModelViewSet):
    """
    API endpoint for viewing and editing company legitimate domains.
    """
    permission_classes = [permissions.DjangoModelPermissionsOrAnonReadOnly]
    serializer_class = LegitimateDomainSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['domain_name', 'ticket_id', 'contact', 'comments']
    ordering_fields = ['domain_name', 'created_at', 'expiry']
    
    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'get_statistics']:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]
    
    def get_queryset(self):
        qs = LegitimateDomain.objects.all().order_by('-created_at', '-id')
        return qs

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    @action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny], url_path='statistics')
    def get_statistics(self, request):
        """
        Get statistics for legitimate domains.
        Returns total, repurchased, expired, and expiring soon counts.
        """
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            now = datetime.now()
            soon = now + timedelta(days=30)
            
            # Base queryset
            queryset = LegitimateDomain.objects.all()
            
            # Total count
            total = queryset.count()
            
            # Repurchased count
            repurchased = queryset.filter(repurchased=True).count()
            
            # Expired count (expiry date is in the past)
            expired = queryset.filter(
                expiry__isnull=False,
                expiry__lt=now.date()
            ).count()
            
            # Expiring soon count (expiry date is between now and 30 days from now)
            expiring_soon = queryset.filter(
                expiry__isnull=False,
                expiry__gte=now.date(),
                expiry__lte=soon.date()
            ).count()
            
            today = now.date()
            week_ago = now - timedelta(days=7)
            new_today = queryset.filter(created_at__date=today).count()
            new_this_week = queryset.filter(created_at__gte=week_ago).count()

            stats = {
                'total': total,
                'repurchased': repurchased,
                'expired': expired,
                'expiringSoon': expiring_soon,
                'newToday': new_today,
                'newThisWeek': new_this_week,
            }
            
            
            return Response(stats, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'status': 'error',
                'message': f'Failed to calculate statistics: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAuthenticated], url_path='misp')
    def export_to_misp(self, request):
        """
        Export legitimate domain to MISP using DNS Finder's logic.
        """
        from dns_finder.api import MISPViewSet
        from dns_finder.serializers import MISPSerializer
        import logging
        
        logger = logging.getLogger(__name__)
        
        domain_id = request.data.get('id')
        event_uuid = request.data.get('event_uuid', '')
        
        if not domain_id:
            return Response({
                'status': 'error',
                'message': 'Domain ID is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            domain = LegitimateDomain.objects.get(id=domain_id)
        except LegitimateDomain.DoesNotExist:
            return Response({
                'status': 'error',
                'message': 'Domain not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        try:
            misp_viewset = MISPViewSet()
            misp_viewset.request = request
            misp_viewset.format_kwarg = None
            
            misp_data = {
                'id': domain.id,
                'event_uuid': event_uuid,
                'domain_name': domain.domain_name,
                'fuzzer': 'legitimate_domain',
                'dns_monitored': None,
                'keyword_monitored': None
            }
            
            serializer = MISPSerializer(data=misp_data)
            
            if serializer.is_valid():
                misp_response = misp_viewset.create(request)
                
                if misp_response.status_code in [200, 201]:
                    response_data = misp_response.data
                    
                    # Update domain with new MISP UUID
                    if response_data.get('misp_event_uuid'):
                        current_uuids = domain.misp_event_uuid or []
                        if isinstance(current_uuids, str):
                            current_uuids = [u.strip() for u in current_uuids.replace('[', '').replace(']', '').replace("'", '').split(',') if u.strip()]
                        
                        new_uuid = response_data['misp_event_uuid']
                        if new_uuid not in current_uuids:
                            current_uuids.append(new_uuid)
                        
                        domain.misp_event_uuid = current_uuids
                        domain.save()
                        
                        return Response({
                            'status': 'success',
                            'message': response_data.get('message', f'{domain.domain_name} exported to MISP successfully'),
                            'misp_event_uuid': new_uuid
                        }, status=status.HTTP_200_OK)
                else:
                    return Response({
                        'status': 'error',
                        'message': 'Failed to export to MISP'
                    }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            else:
                logger.error(f"Serializer errors: {serializer.errors}")
                return Response({
                    'status': 'error',
                    'message': 'Invalid data for MISP export',
                    'errors': serializer.errors
                }, status=status.HTTP_400_BAD_REQUEST)
            
        except Exception as e:
            logger.error(f"MISP export error for {domain.domain_name}: {str(e)}", exc_info=True)
            
            return Response({
                'status': 'error',
                'message': f'MISP export failed: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _execute_pending_action(pa):
    """
    Carry out the side-effect associated with a PendingAction when approved.
    """
    if pa.action_type == 'udrp_transfer':
        from site_monitoring.models import Site
        from site_monitoring.udrp import transfer_to_legitimate_domains

        site_id = pa.metadata.get('site_id')
        if not site_id:
            logger.warning("PendingAction %d (udrp_transfer) has no site_id in metadata.", pa.id)
            return
        try:
            site = Site.objects.get(pk=site_id)
        except Site.DoesNotExist:
            logger.warning(
                "PendingAction %d: Site %s no longer exists - skipping transfer.",
                pa.id, site_id,
            )
            return
        transfer_to_legitimate_domains(site)


class PendingActionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for viewing and managing pending actions.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = PendingActionSerializer

    def get_queryset(self):
        qs = PendingAction.objects.all()
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    @action(detail=False, methods=['get'], url_path='count')
    def count(self, request):
        """Return the count of pending (unresolved) actions."""
        n = PendingAction.objects.filter(status='pending').count()
        return Response({'count': n})

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        """Approve and execute the pending action."""
        pa = self.get_object()
        if pa.status != 'pending':
            return Response(
                {'error': 'This action is no longer pending.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        _execute_pending_action(pa)
        pa.status = 'approved'
        pa.resolved_at = timezone.now()
        pa.resolved_by = request.user
        pa.save()
        return Response(PendingActionSerializer(pa).data)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        """Reject the pending action without executing it."""
        pa = self.get_object()
        if pa.status != 'pending':
            return Response(
                {'error': 'This action is no longer pending.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pa.status = 'rejected'
        pa.resolved_at = timezone.now()
        pa.resolved_by = request.user
        pa.save()
        return Response(PendingActionSerializer(pa).data)