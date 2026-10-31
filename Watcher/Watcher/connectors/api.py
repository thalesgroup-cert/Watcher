import logging

from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .core import (
    get_all_connectors,
    get_connector_by_id,
    save_connector_overrides,
    reset_connector_field,
    test_connector,
)
from .notifications import UNSET, describe, describe_all, preview, save_setting

logger = logging.getLogger('watcher.connectors')


class IsSuperUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


class ConnectorViewSet(viewsets.ViewSet):
    """
    ViewSet for managing connector configurations.
    All endpoints require superuser authentication.
    """
    permission_classes = [IsSuperUser]

    def list(self, request):
        """GET /api/connectors/ - list all connectors with masked sensitive values."""
        try:
            data = get_all_connectors()
            return Response(data)
        except Exception as exc:
            logger.error("Error listing connectors: %s", exc)
            return Response({'error': 'Failed to list connectors'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def retrieve(self, request, pk=None):
        """GET /api/connectors/{id}/ - connector detail. ?reveal=true decrypts sensitive fields."""
        reveal = request.query_params.get('reveal', '').lower() in ('true', '1', 'yes')
        try:
            data = get_connector_by_id(pk, reveal=reveal)
            return Response(data)
        except KeyError:
            return Response({'error': f"Connector '{pk}' not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as exc:
            logger.error("Error retrieving connector '%s': %s", pk, exc)
            return Response({'error': f"Failed to retrieve connector '{pk}'"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def partial_update(self, request, pk=None):
        """PATCH /api/connectors/{id}/ - save field overrides."""
        fields = request.data.get('fields', {})
        if not isinstance(fields, dict):
            return Response({'error': "'fields' must be a dict"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            save_connector_overrides(pk, fields)
            data = get_connector_by_id(pk)
            return Response(data)
        except KeyError:
            return Response({'error': f"Connector '{pk}' not found"}, status=status.HTTP_404_NOT_FOUND)
        except PermissionError:
            return Response({'error': f"Connector '{pk}' is read-only and cannot be overridden"}, status=status.HTTP_403_FORBIDDEN)
        except Exception as exc:
            logger.error("Error saving overrides for connector '%s': %s", pk, exc)
            return Response({'error': f"Failed to save overrides for connector '{pk}'"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='test')
    def test(self, request, pk=None):
        """
        POST /api/connectors/{id}/test/ - run health_check. Also returns the
        refreshed connector (with its updated health status) so the frontend
        can update the dashboard immediately, without waiting for a page reload.
        """
        try:
            result = test_connector(pk)
            connector = get_connector_by_id(pk)
            return Response({**result, 'connector': connector})
        except KeyError:
            return Response({'error': f"Connector '{pk}' not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as exc:
            logger.error("Error testing connector '%s': %s", pk, exc)
            return Response({'success': False, 'message': f"Failed to test connector '{pk}'"})

    @action(detail=True, methods=['post'], url_path='reset-field')
    def reset_field(self, request, pk=None):
        """POST /api/connectors/{id}/reset-field/ - drop one field's override, {"field": name}."""
        field_name = request.data.get('field')
        if not field_name:
            return Response({'error': "'field' is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            reset_connector_field(pk, field_name)
            data = get_connector_by_id(pk)
            return Response(data)
        except KeyError:
            return Response({'error': f"Connector '{pk}' or field '{field_name}' not found"}, status=status.HTTP_404_NOT_FOUND)
        except PermissionError:
            return Response({'error': f"Connector '{pk}' is read-only and cannot be overridden"}, status=status.HTTP_403_FORBIDDEN)
        except Exception as exc:
            logger.error("Error resetting field '%s' on connector '%s': %s", field_name, pk, exc)
            return Response({'error': f"Failed to reset field '{field_name}' on connector '{pk}'"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class NotificationListView(APIView):
    """GET /api/connectors/notifications/ - every notification with what is on for each channel."""
    permission_classes = [IsSuperUser]

    def get(self, request):
        try:
            return Response(describe_all())
        except Exception as exc:
            logger.error("Error listing notifications: %s", exc)
            return Response({'error': 'Failed to list notifications'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class NotificationSettingView(APIView):
    """PATCH /api/connectors/notifications/<type>/<channel>/ - switch a channel on or off, choose the fields."""
    permission_classes = [IsSuperUser]

    def patch(self, request, type_id, channel):
        try:
            save_setting(
                type_id, channel, enabled=request.data.get('enabled'), fields=request.data.get('fields'),
                template_text=request.data.get('template', UNSET), title=request.data.get('title', UNSET),
            )
            return Response(describe(type_id))
        except KeyError as exc:
            return Response({'error': exc.args[0]}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            logger.error("Error saving the notification '%s' on '%s': %s", type_id, channel, exc)
            return Response({'error': 'Failed to save the notification'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class NotificationPreviewView(APIView):
    """POST /api/connectors/notifications/<type>/<channel>/preview/ - the message, from a fictional sample."""
    permission_classes = [IsSuperUser]

    def post(self, request, type_id, channel):
        try:
            return Response(preview(
                type_id, channel, request.data.get('fields'),
                template_text=request.data.get('template', UNSET), title=request.data.get('title', UNSET),
            ))
        except KeyError as exc:
            return Response({'error': exc.args[0]}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            logger.error("Error building the preview of '%s' on '%s': %s", type_id, channel, exc)
            return Response({'error': 'Failed to build the preview'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
