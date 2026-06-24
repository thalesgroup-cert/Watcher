from django.apps import AppConfig


class TimelineConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'timeline'

    def ready(self):
        from common.models import LegitimateDomain
        from threats_watcher.models import Source, MonitoredKeyword, BannedWord
        from cyber_watch.models import WatchRule
        from data_leak.models import Keyword as DataLeakKeyword
        from site_monitoring.models import Site
        from dns_finder.models import DnsMonitored, KeywordMonitored as DnsKeywordMonitored
        from .signals import connect_tracking
        connect_tracking(LegitimateDomain)
        connect_tracking(Source)
        connect_tracking(MonitoredKeyword)
        connect_tracking(BannedWord)
        connect_tracking(WatchRule)
        connect_tracking(DataLeakKeyword)
        connect_tracking(Site)
        connect_tracking(DnsMonitored)
        connect_tracking(DnsKeywordMonitored)
