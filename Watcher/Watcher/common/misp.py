from django.utils import timezone
from django.conf import settings
from rest_framework.exceptions import NotFound
from pymisp import MISPTag, MISPAttribute, MISPObject
from .models import MISPEventUuidLink


def create_misp_tags(misp_api):
    """
    Create and verify MISP tags.
    
    Args:
        misp_api: PyMISP API instance
    
    Returns:
        list: Created/verified tags
    """
    required_tags = settings.MISP_TAGS
    tag_list = []
    
    try:
        existing_tags = {tag.name: tag for tag in misp_api.tags(pythonify=True)}
        
        for tag_name in required_tags:
            if tag_name not in existing_tags:
                tag = MISPTag()
                tag.name = tag_name
                print(f"{timezone.now()} - Creating new tag: {tag_name}")
                misp_api.add_tag(tag)
                tag_list.append(tag)
            else:
                tag_list.append(existing_tags[tag_name])
                
        return tag_list
        
    except Exception as e:
        print(f"{timezone.now()} - Error creating MISP tags: {str(e)}")
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
                'comment': f"{settings.THE_HIVE_CUSTOM_FIELD} reference",
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
        print(f"{timezone.now()} - Error searching domain object: {str(e)}")
        raise


def create_or_update_objects(misp_api, event, site, dry_run=False):
    """
    Create or update MISP objects for a given site.
    
    Args:
        misp_api: PyMISP API instance
        event: MISP Event object
        site: Site object containing domain data
        dry_run: If True, simulate the operation without making changes
        
    Returns:
        tuple: (success, message)
    """
    try:
        if 'Event' not in event:
            print(f"{timezone.now()} - Invalid MISP event format - please check the event UUID")
            return False, "Invalid MISP event format - please check the event UUID"

        print(f"{timezone.now()} - Processing domain name {site.domain_name} for event {event['Event']['uuid']}")
        
        domain_exists, existing_obj = find_domain_object(misp_api, event, site.domain_name)
        
        if domain_exists:
            existing_values = {(attr.type, attr.value) for attr in existing_obj.attributes}
            objects = create_objects(site, existing_values)
            
            if not objects:
                print(f"{timezone.now()} - Already on MISP - No changes applied for {site.domain_name}")
                return True, f"Already on MISP - No changes applied for {site.domain_name}"
                            
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
                            print(f"{timezone.now()} - Updating MISP object for {site.domain_name} - Added attribute {attr.type}: {attr.value}")
                        except Exception as e:
                            print(f"{timezone.now()} - Error adding attribute to object: {str(e)}")
                            raise
                    
            return True, f"Successfully updated {site.domain_name} in MISP"
            
        else:
            objects = create_objects(site)
            
            if not dry_run and objects:
                for obj in objects:
                    try:
                        misp_api.add_object(event['Event']['id'], obj)
                        print(f"{timezone.now()} - Added new object with {len(obj.attributes)} attributes")
                    except Exception as e:
                        print(f"{timezone.now()} - Error adding object: {str(e)}")
                        raise
                    
            return True, f"Successfully added {site.domain_name} to MISP"
            
    except Exception as e:
        print(f"{timezone.now()} - Error in create_or_update_objects: {str(e)}")
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
        print(f"{timezone.now()} - Error updating MISP UUID: {str(e)}")
        return []