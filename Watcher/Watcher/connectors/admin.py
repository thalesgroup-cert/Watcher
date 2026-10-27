from django.contrib import admin
from .models import ConnectorOverride, ConnectorHealthCheck
from django import forms


class ConnectorOverrideForm(forms.ModelForm):
    class Meta:
        model = ConnectorOverride
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        
        if self.instance and self.instance.pk:
            ai_connectors = [
                'openai', 'anthropic', 'gemini', 'ollama', 
                'generic_llm_provider'
            ]
            
            if self.instance.connector_id not in ai_connectors:
                self.fields['is_default_llm'].disabled = True
                self.fields['is_default_llm'].widget.attrs['style'] = 'display: none;'

class NoAddModelAdmin(admin.ModelAdmin):
    """Rows are only ever created programmatically (via the /connectors API
    or the scheduled health check), never by hand - hide the 'Add' button."""

    def has_add_permission(self, request):
        return False


@admin.register(ConnectorOverride)
class ConnectorOverrideAdmin(NoAddModelAdmin):
    form = ConnectorOverrideForm
    
    list_display = ('connector_id', 'is_default_llm')
    list_editable = ('is_default_llm',)
    search_fields = ('connector_id',)
    
    def get_changelist_form(self, request, **kwargs):
        return self.form


@admin.register(ConnectorHealthCheck)
class ConnectorHealthCheckAdmin(NoAddModelAdmin):
    pass
