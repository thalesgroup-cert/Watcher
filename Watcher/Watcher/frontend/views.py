from django.shortcuts import render
from django.conf import settings


def index(request):
    # This command will render index.html from the frontend folder
    context = {
        'oidc_enabled': 'true' if getattr(settings, 'OIDC_ENABLED', False) else 'false',
        'oidc_company_name': getattr(settings, 'OIDC_COMPANY_NAME', ''),
    }
    return render(request, 'frontend/index.html', context)
