from django.conf.urls import url, include
from django.contrib import admin

urlpatterns = [
    url('', include('frontend.urls')),
    url('', include('threats_watcher.urls')),
    url('', include('data_leak.urls')),
    url('', include('site_monitoring.urls')),
    url('', include('dns_finder.urls')),
    url('', include('accounts.urls')),
    url(r'^admin/doc/', include('django.contrib.admindocs.urls')),
    url(r'^admin/', admin.site.urls),
]
