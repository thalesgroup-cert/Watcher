from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from .models import LegitimateDomain
from .serializers import LegitimateDomainSerializer


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
    
    def get_queryset(self):
        return LegitimateDomain.objects.all().order_by('-created_at')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

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