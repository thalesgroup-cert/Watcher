from django.utils import timezone
from rest_framework import serializers
from .models import Site
from thehive4py.models import CaseObservable


def search_observables(hive_api, case_id, keyword):
    """
    Search observables containing the keyword provided.

    :param hive_api: TheHive API Object.
    :param case_id: TheHive Case ID.
    :param keyword: Observable requested.
    :return: True if there is observables.
    :rtype: bool
    """
    observables = hive_api.get_case_observables(case_id)

    r = False
    for o in observables.json():
        if o['data'] == keyword:
            r = True
    return r


def create_observables(hive_api, case_id, site):
    """
    Create IOCs observables.

    :param hive_api: TheHive API Object.
    :param case_id: TheHive Case ID.
    :param site: Site Object.
    :return:
    """
    print(str(timezone.now()) + " - " + 'Add observables {}'.format(case_id))
    print('-----------------------------')

    response = hive_api.create_case_observable(case_id, CaseObservable(dataType='domain',
                                                                       data=[site.domain_name],
                                                                       tlp=2,
                                                                       ioc=True,
                                                                       sighted=True,
                                                                       tags=['Watcher'],
                                                                       message='Domain name monitored'))
    if response.status_code == 201:
        # print(str(timezone.now()) + " - " + json.dumps(response.json(), indent=4, sort_keys=True))
        print(str(timezone.now()) + " - " + "OK")
    else:
        print(str(timezone.now()) + " - " + 'ko: {}/{}'.format(response.status_code, response.text))
        data = {'detail': response.json()['type'] + ": " + response.json()['message']}
        raise serializers.ValidationError(data)

    if site.ip:
        response = hive_api.create_case_observable(case_id, CaseObservable(dataType='ip',
                                                                           data=[site.ip],
                                                                           tlp=2,
                                                                           ioc=True,
                                                                           sighted=True,
                                                                           tags=['Watcher'],
                                                                           message='First IP'))
        if response.status_code == 201:
            print(str(timezone.now()) + " - " + "OK")
        else:
            print(str(timezone.now()) + " - " + 'ko: {}/{}'.format(response.status_code, response.text))
            data = {'detail': response.json()['type'] + ": " + response.json()['message']}
            raise serializers.ValidationError(data)

    if site.ip_second:
        response = hive_api.create_case_observable(case_id, CaseObservable(dataType='ip',
                                                                           data=[site.ip_second],
                                                                           tlp=2,
                                                                           ioc=True,
                                                                           sighted=True,
                                                                           tags=['Watcher'],
                                                                           message='Second IP'))
        if response.status_code == 201:
            print(str(timezone.now()) + " - " + "OK")
        else:
            print(str(timezone.now()) + " - " + 'ko: {}/{}'.format(response.status_code, response.text))
            data = {'detail': response.json()['type'] + ": " + response.json()['message']}
            raise serializers.ValidationError(data)

    if site.mail_A_record_ip and not search_observables(hive_api, case_id, site.mail_A_record_ip):
        response = hive_api.create_case_observable(case_id, CaseObservable(dataType='ip',
                                                                           data=[site.mail_A_record_ip],
                                                                           tlp=2,
                                                                           ioc=True,
                                                                           sighted=True,
                                                                           tags=['Watcher'],
                                                                           message='Mail Server A record IP: mail.' + site.domain_name))
        if response.status_code == 201:
            print(str(timezone.now()) + " - " + "OK")
        else:
            print(str(timezone.now()) + " - " + 'ko: {}/{}'.format(response.status_code, response.text))
            data = {'detail': response.json()['type'] + ": " + response.json()['message']}
            raise serializers.ValidationError(data)

    if site.MX_records:
        for mx in site.MX_records:
            response = hive_api.create_case_observable(case_id, CaseObservable(dataType='domain',
                                                                               data=[str(mx).split()[1][:-1]],
                                                                               tlp=2,
                                                                               ioc=True,
                                                                               sighted=True,
                                                                               tags=['Watcher'],
                                                                               message='MX record'))
            if response.status_code == 201:
                print(str(timezone.now()) + " - " + "OK")
            else:
                print(str(timezone.now()) + " - " + 'ko: {}/{}'.format(response.status_code, response.text))
                data = {'detail': response.json()['type'] + ": " + response.json()['message']}
                raise serializers.ValidationError(data)


def update_observables(hive_api, site):
    """
    Update IOCs observables.

    :param hive_api: TheHive API Object.
    :param site: Site Object.
    :return:
    """
    print(str(timezone.now()) + " - " + 'Update observables {}'.format(site.the_hive_case_id))
    print('-----------------------------')
    case_id = site.the_hive_case_id

    if site.ip and not search_observables(hive_api, case_id, site.ip):
        response = hive_api.create_case_observable(case_id, CaseObservable(dataType='ip',
                                                                           data=[site.ip],
                                                                           tlp=2,
                                                                           ioc=True,
                                                                           sighted=True,
                                                                           tags=['Watcher'],
                                                                           message='First IP'))
        if response.status_code == 201:
            print(str(timezone.now()) + " - " + "OK")
        else:
            print(str(timezone.now()) + " - " + 'ko: {}/{}'.format(response.status_code, response.text))

            if response.json()['type'] == "NotFoundError":
                # Reset the case id in database
                Site.objects.filter(pk=site.pk).update(the_hive_case_id=None)

            data = {'detail': response.json()['type'] + ": " + response.json()['message']}
            raise serializers.ValidationError(data)

    if site.ip_second and not search_observables(hive_api, case_id, site.ip_second):
        response = hive_api.create_case_observable(case_id, CaseObservable(dataType='ip',
                                                                           data=[site.ip_second],
                                                                           tlp=2,
                                                                           ioc=True,
                                                                           sighted=True,
                                                                           tags=['Watcher'],
                                                                           message='Second IP'))
        if response.status_code == 201:
            print(str(timezone.now()) + " - " + "OK")
        else:
            print(str(timezone.now()) + " - " + 'ko: {}/{}'.format(response.status_code, response.text))

            if response.json()['type'] == "NotFoundError":
                # Reset the case id in database
                Site.objects.filter(pk=site.pk).update(the_hive_case_id=None)

            data = {'detail': response.json()['type'] + ": " + response.json()['message']}
            raise serializers.ValidationError(data)

    if site.mail_A_record_ip and not search_observables(hive_api, case_id, site.mail_A_record_ip):
        response = hive_api.create_case_observable(case_id, CaseObservable(dataType='ip',
                                                                           data=[site.mail_A_record_ip],
                                                                           tlp=2,
                                                                           ioc=True,
                                                                           sighted=True,
                                                                           tags=['Watcher'],
                                                                           message='Mail Server A record IP: mail.' + site.domain_name))
        if response.status_code == 201:
            print(str(timezone.now()) + " - " + "OK")
        else:
            print(str(timezone.now()) + " - " + 'ko: {}/{}'.format(response.status_code, response.text))

            if response.json()['type'] == "NotFoundError":
                # Reset the case id in database
                Site.objects.filter(pk=site.pk).update(the_hive_case_id=None)

            data = {'detail': response.json()['type'] + ": " + response.json()['message']}
            raise serializers.ValidationError(data)

    if site.MX_records:
        for mx in site.MX_records:
            if not search_observables(hive_api, case_id, str(mx).split()[1][:-1]):
                response = hive_api.create_case_observable(case_id, CaseObservable(dataType='domain',
                                                                                   data=[str(mx).split()[1][:-1]],
                                                                                   tlp=2,
                                                                                   ioc=True,
                                                                                   sighted=True,
                                                                                   tags=['Watcher'],
                                                                                   message='MX record'))
                if response.status_code == 201:
                    print(str(timezone.now()) + " - " + "OK")
                else:
                    print(str(timezone.now()) + " - " + 'ko: {}/{}'.format(response.status_code, response.text))

                    if response.json()['type'] == "NotFoundError":
                        # Reset the case id in database
                        Site.objects.filter(pk=site.pk).update(the_hive_case_id=None)

                    data = {'detail': response.json()['type'] + ": " + response.json()['message']}
                    raise serializers.ValidationError(data)
