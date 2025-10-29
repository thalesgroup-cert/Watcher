from django.db import models
from django.utils import timezone
from django_mysql.models import ListCharField

class MISPEventUuidLink(models.Model):
    """
    Centralizes domain name to MISP event UUID mappings across the application.
    """
    domain_name = models.CharField(max_length=255, unique=True)
    misp_event_uuid = ListCharField(
        base_field=models.CharField(max_length=36),
        size=10,
        max_length=(10 * 37),
        blank=True,
        null=True
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Domain MISP Mapping'
        verbose_name_plural = 'Domain MISP Mappings'
        
    def __str__(self):
        return f"{self.domain_name} - {len(self.misp_event_uuid or [])} UUID"
        
    @staticmethod
    def check_and_delete_unused_domain(domain_name):
        """
        Checks if a domain is still used in any monitoring module.
        If not, deletes the associated MISP mapping.
        
        Args:
            domain_name: Domain name to check
        """
        from site_monitoring.models import Site
        from dns_finder.models import DnsTwisted
        
        still_in_site = Site.objects.filter(domain_name=domain_name).exists()
        still_in_dns = DnsTwisted.objects.filter(domain_name=domain_name).exists()
        
        if not still_in_site and not still_in_dns:
            try:
                mappings = MISPEventUuidLink.objects.filter(domain_name=domain_name)
                if mappings.exists():
                    mappings.delete()
                    return True
            except Exception:
                pass
        
        return False


class LegitimateDomain(models.Model):
    """
    List of company-approved legitimate domains used.
    """
    domain_name = models.CharField(max_length=255, unique=True)
    ticket_id = models.CharField(max_length=20, blank=True, null=True)
    contact = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)
    domain_created_at = models.DateTimeField(blank=True, null=True)    # Domain's own creation/registration date
    expiry = models.DateField(blank=True, null=True)
    repurchased = models.BooleanField(default=False)
    comments = models.TextField(blank=True, null=True, max_length=300)
    misp_event_uuid = models.JSONField(blank=True, null=True, default=list)
    
    class Meta:
        verbose_name = 'Legitimate Domain'
        verbose_name_plural = 'Legitimate Domains'
    
    def __str__(self):
        return self.domain_name

    class Meta:
        ordering = ['-created_at']