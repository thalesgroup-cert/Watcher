import logging
from django.utils import timezone
from rest_framework.exceptions import NotFound
from pymisp import MISPTag, MISPAttribute, MISPObject
from .models import MISPEventUuidLink
from connectors.core import get_misp_config, get_thehive_config

# Configure logger
logger = logging.getLogger('watcher.common')


def _get_domain_identifier(obj):
    """
    The string identity MISP tracking (find_domain_object/get_misp_uuid) keys
    on. Site/LegitimateDomain/DnsTwisted (including dangling-detection rows)
    all expose `.domain_name`.
    """
    return obj.domain_name


def create_misp_tags(misp_api):
    """
    Create and verify MISP tags.
    
    Args:
        misp_api: PyMISP API instance
    
    Returns:
        list: Created/verified tags
    """
    required_tags = get_misp_config()['tags']
    tag_list = []
    
    try:
        existing_tags = {tag.name: tag for tag in misp_api.tags(pythonify=True)}
        
        for tag_name in required_tags:
            if tag_name not in existing_tags:
                tag = MISPTag()
                tag.name = tag_name
                logger.info(f"Creating new tag: {tag_name}")
                misp_api.add_tag(tag)
                tag_list.append(tag)
            else:
                tag_list.append(existing_tags[tag_name])
                
        return tag_list
        
    except Exception as e:
        logger.error(f"Error creating MISP tags: {str(e)}")
        raise


def create_objects(obj, existing_values=None):
    """
    Create MISP Objects for any domain object (Site or DnsTwisted).
    
    Args:
        obj: Domain object (Site or DnsTwisted) containing domain data
        existing_values: Optional set of (type, value) tuples to check for duplicates
    
    Returns:
        list: MISP objects ready to be added/updated
    """
    network_obj = MISPObject('domain-ip')
    network_obj.distribution = 5

    # Base attributes that all objects should have
    attributes_map = {
        'domain': {
            'value': obj.domain_name,
            'type': 'domain',
            'category': 'Network activity',
            'to_ids': True,
            'comment': "Domain name monitored",
            'object_relation': 'domain'
        }
    }
    
    # Check object type and add specific attributes
    from site_monitoring.models import Site
    
    if isinstance(obj, Site):
        # Site attributes
        if obj.ip:
            attributes_map['ip'] = {
                'value': obj.ip,
                'type': 'ip-dst',
                'category': 'Network activity',
                'to_ids': True,
                'comment': "First IP",
                'object_relation': 'ip'
            }
            
        if obj.ip_second:
            attributes_map['ip_second'] = {
                'value': obj.ip_second,
                'type': 'ip-dst',
                'category': 'Network activity',
                'to_ids': True,
                'comment': "Second IP",
                'object_relation': 'ip'
            }
            
        if obj.mail_A_record_ip:
            attributes_map['mail_ip'] = {
                'value': obj.mail_A_record_ip,
                'type': 'ip-dst',
                'category': 'Network activity',
                'to_ids': True,
                'comment': "Mail Server IP",
                'object_relation': 'ip'
            }
            
        if obj.ticket_id:
            attributes_map['ticket'] = {
                'value': obj.ticket_id,
                'type': 'text',
                'category': 'Internal reference',
                'distribution': 0,
                'to_ids': False,
                'comment': f"{get_thehive_config()['custom_field']} reference",
                'object_relation': 'text'
            }
    
    elif type(obj).__name__ == 'LegitimateDomain':
        
        if obj.ticket_id:
            attributes_map['ticket'] = {
                'value': obj.ticket_id,
                'type': 'text',
                'category': 'Internal reference',
                'distribution': 0,
                'to_ids': False,
                'comment': f"{get_thehive_config().get('custom_field', 'Ticket')} reference",
                'object_relation': 'text'
            }
            
        if obj.contact:
            attributes_map['contact'] = {
                'value': obj.contact,
                'type': 'text',
                'category': 'Internal reference',
                'distribution': 0,
                'to_ids': False,
                'comment': "Domain Contact",
                'object_relation': 'text'
            }
    
    # Add attributes to MISP object
    for attr_data in attributes_map.values():
        if not attr_data['value']:
            continue
        if existing_values and (attr_data['type'], attr_data['value']) in existing_values:
            continue
        network_obj.add_attribute(**attr_data)

    # Add MX records for Site objects
    if isinstance(obj, Site) and obj.MX_records:
        for mx in obj.MX_records:
            mx_domain = str(mx).split()[1][:-1]
            if not existing_values or ('domain', mx_domain) not in existing_values:
                network_obj.add_attribute(
                    type='domain',
                    value=mx_domain,
                    category='Network activity',
                    to_ids=True,
                    comment="MX record",
                    object_relation='domain'
                )

    return [network_obj] if network_obj.attributes else []


def create_takeover_objects(dns_twisted, existing_values=None):
    """
    Create a MISP object for a subdomain-takeover (dangling DNS) finding.
    Kept separate from create_objects() (Site/LegitimateDomain) since a
    dangling-detection DnsTwisted row carries a different attribute set
    (CNAME target, provider, HTTP status).

    Args:
        dns_twisted: DnsTwisted instance with a subdomain_takeover Alert
        existing_values: Optional set of (type, value) tuples to check for duplicates

    Returns:
        list: MISP objects ready to be added/updated
    """
    network_obj = MISPObject('domain-ip')
    network_obj.distribution = 5

    attributes_map = {
        'subdomain': {
            'value': dns_twisted.domain_name,
            'type': 'domain',
            'category': 'Network activity',
            'to_ids': True,
            'comment': "Subdomain vulnerable to takeover",
            'object_relation': 'domain',
        }
    }

    if dns_twisted.cname_target:
        attributes_map['cname_target'] = {
            'value': dns_twisted.cname_target,
            'type': 'hostname',
            'category': 'Network activity',
            'to_ids': True,
            'comment': "CNAME target (decommissioned resource)",
            'object_relation': 'hostname',
        }

    if dns_twisted.provider:
        attributes_map['provider'] = {
            'value': dns_twisted.provider,
            'type': 'text',
            'category': 'Other',
            'to_ids': False,
            'comment': "Detected cloud provider",
            'object_relation': 'text',
        }

    if dns_twisted.http_status_code:
        attributes_map['http_status_code'] = {
            'value': str(dns_twisted.http_status_code),
            'type': 'text',
            'category': 'Other',
            'to_ids': False,
            'comment': "HTTP status observed during probe",
            'object_relation': 'text',
        }

    for attr_data in attributes_map.values():
        if not attr_data['value']:
            continue
        if existing_values and (attr_data['type'], attr_data['value']) in existing_values:
            continue
        network_obj.add_attribute(**attr_data)

    return [network_obj] if network_obj.attributes else []


def find_domain_object(misp_api, event, domain_name):
    """
    Find a domain object in a MISP event.
    
    Args:
        misp_api: PyMISP API instance
        event: MISP Event object
        domain_name: Domain name to search for
        
    Returns:
        tuple: (object_found, existing_object)
    """
    try:
        # Search for objects in the event with type domain-ip
        result = misp_api.search(
            controller='attributes',
            eventid=event['Event']['id'],
            type_attribute='domain',
            value=domain_name.lower(),
            pythonify=True
        )

        if result:
            for attribute in result:
                if attribute.type == 'domain' and attribute.value.lower() == domain_name.lower():
                    # Get the object containing this attribute
                    if hasattr(attribute, 'object_id') and attribute.object_id:
                        obj = misp_api.get_object(attribute.object_id, pythonify=True)
                        if obj and obj.name == 'domain-ip':
                            return True, obj
                    
        return False, None
        
    except Exception as e:
        logger.error(f"Error searching domain object: {str(e)}")
        raise


def create_or_update_objects(misp_api, event, site, dry_run=False):
    """
    Create or update MISP objects for a given domain-bearing object (Site,
    LegitimateDomain, or DnsTwisted - including dangling-detection rows).

    Args:
        misp_api: PyMISP API instance
        event: MISP Event object
        site: Domain-bearing object (identified via _get_domain_identifier)
        dry_run: If True, simulate the operation without making changes

    Returns:
        tuple: (success, message)
    """
    try:
        if 'Event' not in event:
            logger.error("Invalid MISP event format - please check the event UUID")
            return False, "Invalid MISP event format - please check the event UUID"

        domain_identifier = _get_domain_identifier(site)
        is_takeover = hasattr(site, 'alert_set') and site.alert_set.filter(source='subdomain_takeover').exists()
        objects_builder = create_takeover_objects if is_takeover else create_objects

        logger.info(f"Processing domain name {domain_identifier} for event {event['Event']['uuid']}")

        domain_exists, existing_obj = find_domain_object(misp_api, event, domain_identifier)

        if domain_exists:
            existing_values = {(attr.type, attr.value) for attr in existing_obj.attributes}
            objects = objects_builder(site, existing_values)

            if not objects:
                logger.info(f"Already on MISP - No changes applied for {domain_identifier}")
                return True, f"Already on MISP - No changes applied for {domain_identifier}"

            if not dry_run:
                for obj in objects:
                    for attr in obj.attributes:
                        try:
                            existing_obj.add_attribute(
                                object_relation=attr.object_relation,
                                **{
                                    'value': attr.value,
                                    'type': attr.type,
                                    'category': attr.category,
                                    'to_ids': attr.to_ids,
                                    'comment': attr.comment,
                                    'distribution': attr.distribution if hasattr(attr, 'distribution') else 5
                                }
                            )
                            misp_api.update_object(existing_obj)
                            logger.info(f"Updating MISP object for {domain_identifier} - Added attribute {attr.type}: {attr.value}")
                        except Exception as e:
                            logger.error(f"Error adding attribute to object: {str(e)}")
                            raise

            return True, f"Successfully updated {domain_identifier} in MISP"

        else:
            objects = objects_builder(site)

            if not dry_run and objects:
                for obj in objects:
                    try:
                        misp_api.add_object(event['Event']['id'], obj)
                        logger.info(f"Added new object with {len(obj.attributes)} attributes")
                    except Exception as e:
                        logger.error(f"Error adding object: {str(e)}")
                        raise

            return True, f"Successfully added {domain_identifier} to MISP"

    except Exception as e:
        logger.error(f"Error in create_or_update_objects: {str(e)}")
        return False, f"Error: {str(e)}"


def get_misp_uuid(domain_name):
    """
    Get MISP event UUID for a domain.
    
    Args:
        domain_name: Domain name to get UUID for
        
    Returns:
        list: List of MISP event UUID (or empty list if none found)
    """
    try:
        mapping = MISPEventUuidLink.objects.get(domain_name=domain_name)
        return mapping.misp_event_uuid or []
    except MISPEventUuidLink.DoesNotExist:
        return []


def update_misp_uuid(domain_name, event_uuid):
    """
    Update MISP event UUID for a domain.
    
    Args:
        domain_name: Domain name to update UUID for
        event_uuid: UUID to add (will be added as the latest)
        
    Returns:
        list: Updated list of MISP event UUID
    """
    try:
        mapping, created = MISPEventUuidLink.objects.get_or_create(domain_name=domain_name)
        
        if not mapping.misp_event_uuid:
            mapping.misp_event_uuid = [event_uuid]
        elif event_uuid in mapping.misp_event_uuid:
            current_uuid = [uuid for uuid in mapping.misp_event_uuid if uuid != event_uuid]
            current_uuid.append(event_uuid)
            mapping.misp_event_uuid = current_uuid
        else:
            current_uuid = list(mapping.misp_event_uuid)
            current_uuid.append(event_uuid)
            mapping.misp_event_uuid = current_uuid
            
        mapping.save()
        return mapping.misp_event_uuid
        
    except Exception as e:
        logger.error(f"Error updating MISP UUID: {str(e)}")
        return []
