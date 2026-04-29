from django.urls import path, include
from django.contrib import admin
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    # OpenAPI schema endpoint (required by Swagger UI)
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    # Swagger UI
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('', include('frontend.urls')),
    path('', include('threats_watcher.urls')),
    path('', include('data_leak.urls')),
    path('', include('site_monitoring.urls')),
    path('', include('dns_finder.urls')),
    path('', include('accounts.urls')),
    path('', include('common.urls')),
    path('', include('cyber_watch.urls')),
    path('admin/doc/', include('django.contrib.admindocs.urls')),
    path('admin/', admin.site.urls),
]
