import copy
import logging
from urllib.parse import urlencode

from django.http import QueryDict
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from cyber_watch.api import CVEAlertViewSet, CyberWatchStatisticsView, RansomwareVictimViewSet
from data_leak.api import AlertViewSet as LeakAlertViewSet, KeywordViewSet
from dns_finder.api import DnsMonitoredViewSet, ThreatsMonitoredView
from site_monitoring.api import AlertViewSet as SiteAlertViewSet, SiteViewSet
from threats_watcher.api import SourceViewSet, SummaryViewSet, TrendyWordViewSet

from .api import LegitimateDomainViewSet, PendingActionViewSet

logger = logging.getLogger('watcher.common')

LIST = {'get': 'list'}


def ask(request, view, **params):
    """
    What `view` answers to this request with these parameters, under its own permissions: None when it refuses (a visitor is
    refused everything that needs an account) or fails. The Overview never decides who may see what: each module still does.
    """
    http = copy.copy(request._request)
    http.GET = QueryDict(urlencode({key: value for key, value in params.items() if value is not None}))
    try:
        response = view(http)
    except Exception:  # one module failing leaves the others on the page
        logger.exception('Overview: %s failed', getattr(view, '__name__', view))
        return None
    return response.data if response.status_code == 200 else None


def rows(page):
    """The rows of a paginated answer (or of a plain list)."""
    if page is None:
        return []
    return page['results'] if isinstance(page, dict) else list(page)


class OverviewView(APIView):
    """
    Everything the Overview shows, in one answer instead of about twenty. Each part is what the module itself would answer to
    the same person: a part the person may not read is null (figures) or empty (lists).
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        def page(view, size, ordering, **filters):
            return rows(ask(request, view, page=1, page_size=size, ordering=ordering, **filters))

        cves = CVEAlertViewSet.as_view(LIST)
        # The best CVEs of the last 30 days, or the best there are when none is that recent
        # The exploited ones first, then by score
        # CVEs only: the other advisories of the source are not what the Overview calls vulnerabilities
        order = '-exploited,-cvss_score'
        top = page(cves, 5, order, status='active', kind='cve', period='30d') or page(cves, 5, order, status='active', kind='cve')
        summary = SummaryViewSet.as_view(LIST)
        return Response({
            'threats': ask(request, SourceViewSet.as_view({'get': 'get_statistics'})),
            'cyber': ask(request, CyberWatchStatisticsView.as_view()),
            'domains': ask(request, LegitimateDomainViewSet.as_view({'get': 'get_statistics'})),
            'graph': ask(request, TrendyWordViewSet.as_view({'get': 'graph'}), limit=40),
            'brief': {
                kind: (rows(ask(request, summary, type=kind)) or [None])[0]
                for kind in ('breaking_news', 'weekly_summary')
            },
            'topCves': top,
            # Approvals waiting for someone: signed-in people only
            'pending': ask(request, PendingActionViewSet.as_view({'get': 'count'})),
            'leaks': ask(request, KeywordViewSet.as_view({'get': 'get_statistics'})),
            'dns': ask(request, DnsMonitoredViewSet.as_view({'get': 'get_statistics'})),
            'sites': ask(request, SiteViewSet.as_view({'get': 'get_statistics'})),
            'latest': {
                'cves': page(cves, 12, '-published', status='active', severity='CRITICAL,HIGH', kind='cve'),
                'victims': page(RansomwareVictimViewSet.as_view(LIST), 12, '-attacked_at', status='active'),
                'leaks': page(LeakAlertViewSet.as_view(LIST), 8, '-created_at', status='active'),
                'threats': rows(ask(request, ThreatsMonitoredView.as_view(), page=1, page_size=8, ordering='-created_at', status='open')),
                'changes': page(SiteAlertViewSet.as_view(LIST), 8, '-created_at', status='active'),
            },
        })
