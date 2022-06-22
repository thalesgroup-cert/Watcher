from django.utils import timezone
from django.conf import settings
from rest_framework.exceptions import NotFound
from .models import Site
from pymisp import MISPTag, MISPAttribute


def create_misp_tags(misp_api):
    """
    Check if all tags exist in the MISP instance and if one is not, create it.

    :param misp_api: MISP Object API.
    :return: Tags created.
    :rtype: list
    """
    print(str(timezone.now()) + " - " + 'Generate MISP Tags')
    print('-----------------------------')

    required_tags = settings.MISP_TAGS
    tag_list = list()
    tags = misp_api.tags(pythonify=True)
    tags_names = list()
    for tag in tags:
        tags_names.append(tag.name)
    for tag in required_tags:
        t = MISPTag()
        t.name = tag
        if tag not in tags_names:
            print(str(timezone.now()) + " - " + "Create tag: ", tag)
            misp_api.add_tag(t)
        tag_list.append(t)

    return tag_list


def create_attributes(misp_api, event_id, site):
    """
    Create MISP IOCs attributes.

    :param misp_api: MISP Object API.
    :param event_id: MISP Event ID.
    :param site: Site Object.
    :return:
    """
    print(str(timezone.now()) + " - " + 'Create MISP IOCs attributes for: ', event_id)
    print('-----------------------------')

    attribute = MISPAttribute()
    attribute.category = "Network activity"
    attribute.type = "domain"
    attribute.distribution = 5
    attribute.comment = "Domain name monitored"
    attribute.value = site.domain_name
    misp_api.add_attribute(event=event_id, attribute=attribute)

    if settings.MISP_TICKETING_URL != '':
        attribute = MISPAttribute()
        attribute.category = "Internal reference"
        attribute.type = "link"
        attribute.distribution = 0
        attribute.comment = "Ticketing link"
        attribute.value = settings.MISP_TICKETING_URL + "?id=" + str(site.rtir)
        misp_api.add_attribute(event=event_id, attribute=attribute)

    if site.ip:
        attribute = MISPAttribute()
        attribute.category = "Network activity"
        attribute.type = "ip-dst"
        attribute.distribution = 5
        attribute.comment = "First IP"
        attribute.value = site.ip
        misp_api.add_attribute(event=event_id, attribute=attribute)

    if site.ip_second:
        attribute = MISPAttribute()
        attribute.category = "Network activity"
        attribute.type = "ip-dst"
        attribute.distribution = 5
        attribute.comment = "Second IP"
        attribute.value = site.ip_second
        misp_api.add_attribute(event=event_id, attribute=attribute)

    if site.mail_A_record_ip and site.ip != site.mail_A_record_ip and site.ip_second != site.mail_A_record_ip:
        attribute = MISPAttribute()
        attribute.category = "Network activity"
        attribute.type = "ip-dst"
        attribute.distribution = 5
        attribute.comment = 'Mail Server A record IP: mail.' + site.domain_name
        attribute.value = site.mail_A_record_ip
        misp_api.add_attribute(event=event_id, attribute=attribute)

    if site.MX_records:
        for mx in site.MX_records:
            attribute = MISPAttribute()
            attribute.category = "Network activity"
            attribute.type = "domain"
            attribute.distribution = 5
            attribute.comment = "MX record"
            attribute.value = str(mx).split()[1][:-1]
            misp_api.add_attribute(event=event_id, attribute=attribute)


def search_attributes(misp_api, event_id, attribute_value, site_id):
    """
    Search MISP Event Attributes.

    :param site_id: Site Object ID.
    :param misp_api: MISP Object API.
    :param event_id: MISP Event ID.
    :param attribute_value: Attribute Value.
    :return: True if there is MISP Event Attributes.
    :rtype: bool
    """
    event_json = misp_api.get_event(event_id)

    if 'Event' in event_json:
        event_core = event_json["Event"]
    else:
        Site.objects.filter(pk=site_id).update(misp_event_id=None)
        raise NotFound("MISP Event " + str(event_id) + " Not Found: Resetting")

    if 'Attribute' in event_core:
        attributes = event_core["Attribute"]
    else:
        raise NotFound("Attributes Not Found")

    r = False
    for attribute in attributes:
        if attribute['value'] == attribute_value:
            r = True
    return r


def update_attributes(misp_api, site):
    """
    Update MISP IOCs attributes.

    :param misp_api: MISP Object API.
    :param site: Site Object.
    :return:
    """
    print(str(timezone.now()) + " - " + 'Update MISP IOCs attributes for: ', site.misp_event_id)
    print('-----------------------------')

    if site.ip and not search_attributes(misp_api, site.misp_event_id, site.ip, site.pk):
        attribute = MISPAttribute()
        attribute.category = "Network activity"
        attribute.type = "ip-dst"
        attribute.distribution = 5
        attribute.comment = "First IP"
        attribute.value = site.ip
        misp_api.add_attribute(event=site.misp_event_id, attribute=attribute)

    if site.ip_second and not search_attributes(misp_api, site.misp_event_id, site.ip_second, site.pk):
        attribute = MISPAttribute()
        attribute.category = "Network activity"
        attribute.type = "ip-dst"
        attribute.distribution = 5
        attribute.comment = "Second IP"
        attribute.value = site.ip_second
        misp_api.add_attribute(event=site.misp_event_id, attribute=attribute)

    if site.mail_A_record_ip and not search_attributes(misp_api, site.misp_event_id, site.mail_A_record_ip, site.pk):
        attribute = MISPAttribute()
        attribute.category = "Network activity"
        attribute.type = "ip-dst"
        attribute.distribution = 5
        attribute.comment = 'Mail Server A record IP: mail.' + site.domain_name
        attribute.value = site.mail_A_record_ip
        misp_api.add_attribute(event=site.misp_event_id, attribute=attribute)

    if site.MX_records:
        for mx in site.MX_records:
            if not search_attributes(misp_api, site.misp_event_id, str(mx).split()[1][:-1], site.pk):
                attribute = MISPAttribute()
                attribute.category = "Network activity"
                attribute.type = "domain"
                attribute.distribution = 5
                attribute.comment = "MX record"
                attribute.value = str(mx).split()[1][:-1]
                misp_api.add_attribute(event=site.misp_event_id, attribute=attribute)
