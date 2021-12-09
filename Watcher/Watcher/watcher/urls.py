from django.urls import path, include
from django.contrib import admin

urlpatterns = [
    path('', include('frontend.urls')),
    path('', include('threats_watcher.urls')),
    path('', include('data_leak.urls')),
    path('', include('site_monitoring.urls')),
    path('', include('dns_finder.urls')),
    path('', include('accounts.urls')),
    path('admin/doc/', include('django.contrib.admindocs.urls')),
    path('admin/', admin.site.urls),
]
