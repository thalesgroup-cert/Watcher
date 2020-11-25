from rest_framework import serializers
from django.conf import settings
from django.utils import timezone

from .models import Alert, DnsMonitored, DnsTwisted

from site_monitoring.models import Site
from site_monitoring.core import monitoring_init

import requests
from rest_framework.exceptions import NotFound, AuthenticationFailed

from thehive4py.api import TheHiveApi
from thehive4py.models import Case
from site_monitoring.thehive import create_observables, update_observables

from pymisp import ExpandedPyMISP, MISPEvent
from site_monitoring.misp import create_misp_tags, create_attributes, update_attributes

import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


# DnsMonitored Serializer
class DnsMonitoredSerializer(serializers.ModelSerializer):
    class Meta:
        model = DnsMonitored
        fields = '__all__'


# DnsTwisted Serializer
class DnsTwistedSerializer(serializers.ModelSerializer):
    dns_monitored = DnsMonitoredSerializer()

    class Meta:
        model = DnsTwisted
        fields = '__all__'


# Alert Serializer
class AlertSerializer(serializers.ModelSerializer):
    dns_twisted = DnsTwistedSerializer()

    class Meta:
        model = Alert
        fields = '__all__'


# MISP Serializer
class MISPSerializer(serializers.Serializer):
    id = serializers.IntegerField()

    def save(self):
        alert_id = self.validated_data['id']
        alert = Alert.objects.get(pk=alert_id)

        dns_twisted = DnsTwisted.objects.get(pk=alert.dns_twisted.pk)

        # Getting IOCs related to the new twisted domain
        if Site.objects.filter(domain_name=dns_twisted.domain_name):
            already_in_monitoring = True
            site = Site.objects.get(domain_name=dns_twisted.domain_name)
        else:
            already_in_monitoring = False
            site = Site.objects.create(domain_name=dns_twisted.domain_name, rtir=-999999999)
            monitoring_init(site)

        site = Site.objects.get(pk=site.pk)

        # We now hav the IOCs related to the domain, we can remove it from monitoring
        if not already_in_monitoring:
            Site.objects.filter(pk=site.pk).delete()

        if site.misp_event_id is None:
            site.misp_event_id = dns_twisted.misp_event_id

        # Test MISP instance connection
        try:
            requests.get(settings.MISP_URL, verify=settings.MISP_VERIFY_SSL)
        except requests.exceptions.SSLError as e:
            print(str(timezone.now()) + " - ", e)
            raise AuthenticationFailed("SSL Error: " + settings.MISP_URL)
        except requests.exceptions.RequestException as e:
            print(str(timezone.now()) + " - ", e)
            raise NotFound("Not Found: " + settings.MISP_URL)

        misp_api = ExpandedPyMISP(settings.MISP_URL, settings.MISP_KEY, settings.MISP_VERIFY_SSL)

        if site.misp_event_id is not None:
            # If the event already exist, then we update IOCs
            update_attributes(misp_api, site)
        else:
            # If the event does not exist, then we create it

            # Prepare MISP Event
            event = MISPEvent()
            event.distribution = 0
            event.threat_level_id = 2
            event.analysis = 0
            event.info = "Suspicious domain name " + site.domain_name
            event.tags = create_misp_tags(misp_api)

            # Create MISP Event
            print(str(timezone.now()) + " - " + 'Create MISP Event')
            print('-----------------------------')
            event = misp_api.add_event(event, pythonify=True)

            # Store Event Id in database
            DnsTwisted.objects.filter(pk=dns_twisted.pk).update(misp_event_id=event.id)
            if Site.objects.filter(domain_name=dns_twisted.domain_name):
                Site.objects.filter(pk=site.pk).update(misp_event_id=event.id)

            # Create MISP Attributes
            create_attributes(misp_api, event.id, site)

    @property
    def data(self):
        # just return success dictionary. you can change this to your need, but i dont think output should be user data after password change
        alert_id = self.validated_data['id']
        alert = Alert.objects.get(pk=alert_id)
        return {'id': alert_id, 'misp_event_id': DnsTwisted.objects.get(pk=alert.dns_twisted.pk).misp_event_id}


# Thehive Serializer
class ThehiveSerializer(serializers.Serializer):
    id = serializers.IntegerField()

    def save(self):
        alert_id = self.validated_data['id']
        alert = Alert.objects.get(pk=alert_id)

        dns_twisted = DnsTwisted.objects.get(pk=alert.dns_twisted.pk)

        # Getting IOCs related to the new twisted domain
        if Site.objects.filter(domain_name=dns_twisted.domain_name):
            already_in_monitoring = True
            site = Site.objects.get(domain_name=dns_twisted.domain_name)
        else:
            already_in_monitoring = False
            site = Site.objects.create(domain_name=dns_twisted.domain_name, rtir=-999999999)
            monitoring_init(site)

        site = Site.objects.get(pk=site.pk)

        # We now hav the IOCs related to the domain, we can remove it from monitoring
        if not already_in_monitoring:
            Site.objects.filter(pk=site.pk).delete()

        if site.the_hive_case_id is None:
            site.the_hive_case_id = dns_twisted.the_hive_case_id

        # Test The Hive instance connection
        try:
            requests.get(settings.THE_HIVE_URL)
        except requests.exceptions.SSLError as e:
            print(str(timezone.now()) + " - ", e)
            raise AuthenticationFailed("SSL Error: " + settings.THE_HIVE_URL)
        except requests.exceptions.RequestException as e:
            print(str(timezone.now()) + " - ", e)
            raise NotFound("Not Found: " + settings.THE_HIVE_URL)

        hive_api = TheHiveApi(settings.THE_HIVE_URL, settings.THE_HIVE_KEY, cert=True)

        if site.the_hive_case_id is not None:
            # If the case already exist, then we update IOCs
            update_observables(hive_api, site)
        else:
            # If the case does not exist, then we create it

            # Prepare the case
            case = Case(title='Suspicious domain name ' + site.domain_name,
                        owner=settings.THE_HIVE_CASE_ASSIGNEE,
                        severity=2,
                        tlp=2,
                        pap=2,
                        flag=False,
                        tags=['Watcher', 'Impersonation', 'Malicious Domain', 'Typosquatting'],
                        description='Suspicious domain name ' + site.domain_name)

            # Create the case
            print(str(timezone.now()) + " - " + 'Create Case')
            print('-----------------------------')
            response = hive_api.create_case(case)

            if response.status_code == 201:
                print(str(timezone.now()) + " - " + "OK")
                case_id = response.json()['id']

                # Save the case id in database
                DnsTwisted.objects.filter(pk=dns_twisted.pk).update(the_hive_case_id=case_id)
                if Site.objects.filter(domain_name=dns_twisted.domain_name):
                    Site.objects.filter(pk=site.pk).update(the_hive_case_id=case_id)

                # Create all IOCs observables
                create_observables(hive_api, case_id, site)
            else:
                print(str(timezone.now()) + " - " + 'ko: {}/{}'.format(response.status_code, response.text))
                data = {'detail': response.json()['type'] + ": " + response.json()['message']}
                raise serializers.ValidationError(data)

    @property
    def data(self):
        # just return success dictionary. you can change this to your need, but i dont think output should be user data after password change
        alert_id = self.validated_data['id']
        alert = Alert.objects.get(pk=alert_id)
        return {'id': alert_id, 'the_hive_case_id': DnsTwisted.objects.get(pk=alert.dns_twisted.pk).the_hive_case_id}
