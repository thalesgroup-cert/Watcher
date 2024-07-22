from django.contrib import admin
from django.contrib.admin.models import LogEntry, ADDITION, CHANGE, DELETION
from django.utils.html import escape
from django.urls import reverse, NoReverseMatch
from django.contrib.auth.models import User
from django.utils.safestring import mark_safe
from .models import APIKey
from .api import generate_api_key
from django.contrib import messages
from django import forms
from django.utils import timezone
from datetime import timedelta
from knox.models import AuthToken
from django.db.models.signals import post_delete
from django.dispatch import receiver

"""
Log Entries Snippet
"""

action_names = {
    ADDITION: 'Addition',
    CHANGE: 'Change',
    DELETION: 'Deletion',
}


class FilterBase(admin.SimpleListFilter):
    def queryset(self, request, queryset):
        if self.value():
            dictionary = dict(((self.parameter_name, self.value()),))
            return queryset.filter(**dictionary)


class ActionFilter(FilterBase):
    title = 'action'
    parameter_name = 'action_flag'

    def lookups(self, request, model_admin):
        return action_names.items()


class UserFilter(FilterBase):
    """Use this filter to only show current users, who appear in the log."""
    title = 'user'
    parameter_name = 'user_id'

    def lookups(self, request, model_admin):
        return tuple((u.id, u.username)
                     for u in User.objects.filter(pk__in=
                                                  LogEntry.objects.values_list('user_id').distinct())
                     )


class AdminFilter(UserFilter):
    """Use this filter to only show current Superusers."""
    title = 'admin'

    def lookups(self, request, model_admin):
        return tuple((u.id, u.username) for u in User.objects.filter(is_superuser=True))


class StaffFilter(UserFilter):
    """Use this filter to only show current Staff members."""
    title = 'staff'

    def lookups(self, request, model_admin):
        return tuple((u.id, u.username) for u in User.objects.filter(is_staff=True))


class LogEntryAdmin(admin.ModelAdmin):
    date_hierarchy = 'action_time'

    readonly_fields = LogEntry._meta.get_fields()

    tmp_list = list()
    for field in readonly_fields:
        tmp_list.append(str(field).split('.', 3)[2])
    readonly_fields = tuple(tmp_list)

    list_filter = [
        UserFilter,
        ActionFilter,
        'content_type',
        # 'user',
    ]

    search_fields = [
        'object_repr',
        'change_message'
    ]

    list_display = [
        'action_time',
        'user',
        'content_type',
        'object_link',
        'action_flag',
        'action_description',
        'change_message',
    ]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return request.user.is_superuser and request.method != 'POST'

    def has_delete_permission(self, request, obj=None):
        return False

    def object_link(self, obj):
        ct = obj.content_type
        repr_ = escape(obj.object_repr)
        try:
            href = reverse('admin:%s_%s_change' % (ct.app_label, ct.model), args=[obj.object_id])
            link = mark_safe(u'<a href="%s">%s</a>' % (href, repr_))
        except NoReverseMatch:
            link = repr_
        return link if obj.action_flag != DELETION else repr_

    object_link.allow_tags = True
    object_link.admin_order_field = 'object_repr'
    object_link.short_description = u'object'

    def queryset(self, request):
        return super(LogEntryAdmin, self).queryset(request) \
            .prefetch_related('content_type')

    def action_description(self, obj):
        return action_names[obj.action_flag]

    action_description.short_description = 'Action'


admin.site.register(LogEntry, LogEntryAdmin)


class APIKeyForm(forms.ModelForm):
    EXPIRATION_CHOICES = (
        (1, '1 day'), 
        (7, '7 days'), 
        (30, '30 days'), 
        (60, '60 days'),
        (90, '90 days'), 
        (365, '1 year'), 
        (730, '2 years'),
    )
    expiration = forms.ChoiceField(choices=EXPIRATION_CHOICES, label='Expiration', required=True)
    user = forms.ModelChoiceField(queryset=User.objects.all(), label='User', required=True)

    class Meta:
        fields = ['user', 'expiration']

    def __init__(self, *args, **kwargs):
        self.request = kwargs.pop('request', None)
        super().__init__(*args, **kwargs)
        
        if not self.instance or not self.instance.pk:
            self.fields['expiration'].initial = 30
            
        else:
            if 'user' in self.fields:
                self.fields['user'].widget = forms.HiddenInput()
            if 'expiration' in self.fields:
                self.fields['expiration'].widget = forms.HiddenInput()
        
        if self.request and not self.request.user.is_superuser:
            self.fields['user'].queryset = User.objects.filter(id=self.request.user.id)
            self.fields['user'].initial = self.request.user
        else:
            self.fields['user'].queryset = User.objects.all()

    def save(self, commit=True):
        instance = super().save(commit=False)
        expiration_days = int(self.cleaned_data['expiration'])
        instance.get_expiry = timezone.now() + timezone.timedelta(days=expiration_days)

        if commit:
            instance.save()
        return instance

class APIKeyAdmin(admin.ModelAdmin):
    list_display = ('get_user', 'get_digest', 'get_created', 'get_expiry')
    form = APIKeyForm
    readonly_fields = ('key_details',)

    def get_user(self, obj):
        return obj.auth_token.user if obj.auth_token else None

    def get_digest(self, obj):
        return obj.auth_token.digest if obj.auth_token else None

    def get_created(self, obj):
        return obj.auth_token.created.strftime("%b %d, %Y, %-I:%M %p").replace('AM', 'a.m.').replace('PM', 'p.m.') if obj.auth_token else None

    def get_expiry(self, obj):
        return obj.auth_token.expiry.strftime("%b %d, %Y, %-I:%M %p").replace('AM', 'a.m.').replace('PM', 'p.m.') if obj.auth_token else None

    get_user.short_description = 'User'
    get_digest.short_description = 'Digest'
    get_created.short_description = 'Created'
    get_expiry.short_description = 'Expiry'

    def has_add_permission(self, request):
        return True

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if not request.user.is_superuser:
            qs = qs.filter(auth_token__user=request.user)
        return qs

    def get_form(self, request, obj=None, **kwargs):
        kwargs['form'] = self.form
        form = super().get_form(request, obj, **kwargs)
        
        class CustomAPIKeyForm(form):
            def __init__(self, *args, **kwargs):
                kwargs['request'] = request
                super().__init__(*args, **kwargs)

        return CustomAPIKeyForm

    def save_model(self, request, obj, form, change):
        if not obj.pk:
            user = form.cleaned_data['user']
            expiration = form.cleaned_data['expiration']
            raw_key, auth_token = generate_api_key(user, int(expiration))
            obj.auth_token = auth_token
            obj.save()
            copy_button = f'''
                <button id="copyButton" onclick="copyToClipboard('{raw_key}')" style="border: none; background: none; cursor: pointer;">
                    <img src="https://img.icons8.com/material-outlined/24/000000/clipboard.png" alt="Copy" style="vertical-align: middle;"/>
                    <span style="vertical-align: middle;">Copy</span>
                </button>
                <script src="https://cdn.jsdelivr.net/npm/sweetalert2@10"></script>
                <script>
                function copyToClipboard(text) {{
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    Swal.fire({{
                        position: 'bottom-end',
                        icon: 'success',
                        title: 'Copied!',
                        text: 'API key copied to clipboard',
                        showConfirmButton: false,
                        timer: 3000,
                        customClass: {{
                            popup: 'small-swal-popup'
                        }}
                    }});
                }}
                </script>
                <style>
                .small-swal-popup {{
                    width: 300px !important;
                    padding: 10px !important;
                    font-size: 12px !important;
                }}
                </style>
            '''
            messages.success(request, mark_safe(f"The API Key was added successfully: {raw_key}. {copy_button} Make sure to copy this personal token now. You won't be able to see it again!"), extra_tags='safe', fail_silently=True)
        else:
            super().save_model(request, obj, form, change)

    def get_readonly_fields(self, request, obj=None):
        readonly_fields = []
        if obj:
            readonly_fields.extend(['get_user', 'get_digest', 'get_created', 'get_expiry', 'key_details'])
        return readonly_fields

    def get_exclude(self, request, obj=None):
        if not obj:
            return ['key', 'get_expiry']
        else:
            return ['key']

    def has_view_permission(self, request, obj=None):
        if request.user.is_superuser:
            return True
        if obj is None:
            return True
        return obj.user == request.user

    def key_details(self, obj):
        if obj.auth_token:
            return mark_safe(
                f"Algorithm: SHA3_512<br>"
                f"Raw API keys are not stored, so there is no way to see this user’s API key."
            )
        return None

    key_details.short_description = 'Key Details'

admin.site.register(APIKey, APIKeyAdmin)


@receiver(post_delete, sender=APIKey)
def delete_authtoken_when_apikey_deleted(sender, instance, **kwargs):
    try:
        if instance.auth_token:
            instance.auth_token.delete()
    except AuthToken.DoesNotExist:
        pass


class AuthTokenAdmin(admin.ModelAdmin):
    list_display = ('user', 'digest', 'created', 'expiry')
    readonly_fields = ('user', 'digest', 'created', 'expiry')
 
    def has_add_permission(self, request):
        return False
 
admin.site.unregister(AuthToken)
admin.site.register(AuthToken, AuthTokenAdmin)