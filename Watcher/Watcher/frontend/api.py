from django.conf import settings
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class ConfigAPI(APIView):
    """
    Public endpoint returning instance-level frontend configuration.
    Consumed by the React app on startup to avoid injecting values
    via Django template variables.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({
            'login_mode':                getattr(settings, 'LOGIN_MODE',                'form_only'),
            'oidc_company_name':         getattr(settings, 'OIDC_COMPANY_NAME',         ''),
            'watcher_help_button_label': getattr(settings, 'WATCHER_HELP_BUTTON_LABEL', 'API Swagger'),
            'watcher_help_button_url':   getattr(settings, 'WATCHER_HELP_BUTTON_URL',   '/api/docs/'),
        })
