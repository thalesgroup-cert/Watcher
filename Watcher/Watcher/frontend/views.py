import os

from django.conf import settings
from django.http import HttpResponseRedirect
from django.views.defaults import page_not_found
from django.views.generic import TemplateView

# The bundle keeps the same name from one release to the next (frontend/main.js, main.css): without a version in its
# address, a browser that already has it can show the new page with the old script.
BUNDLE_FILES = (os.path.join('frontend', 'main.js'), os.path.join('frontend', 'main.css'))
STATIC_DIRS = (settings.STATIC_ROOT, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static'))


def asset_version():
    """
    Modification time of the bundle, as a string: the address of the bundle changes when a release changes the files, and
    stays the same otherwise, so the browser keeps its cache. The directory the files are served from (collectstatic) is
    read first, the source one when the bundle was not collected (a run outside Docker).
    """
    for directory in STATIC_DIRS:
        times = [os.path.getmtime(path) for path in (os.path.join(directory, name) for name in BUNDLE_FILES) if os.path.isfile(path)]
        if times:
            return str(int(max(times)))
    return '0'


class IndexView(TemplateView):
    template_name = 'frontend/index.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['asset_version'] = asset_version()
        return context


# Addresses that are not pages of the interface: they keep Django's plain answer.
NOT_PAGES = ('/api/', '/static/', '/media/', '/admin/')


def not_found(request, exception):
    """
    An address the server does not know. A person who typed or followed one in the browser (`/dededee`) is sent to the
    same address inside the interface (`/#/dededee`), where the "Nothing to watch here" page tells them so with the
    look of the application. The API, the files and the administration keep the plain 404 (a script must still get one).
    """
    if request.method in ('GET', 'HEAD') and 'text/html' in request.headers.get('Accept', '') and not request.path.startswith(NOT_PAGES):
        return HttpResponseRedirect('/#' + request.path)
    return page_not_found(request, exception)
