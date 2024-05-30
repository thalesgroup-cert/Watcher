from django.contrib import admin

# Import for Log Entries Snippet
from django.contrib.admin.models import LogEntry, ADDITION, CHANGE, DELETION
from django.utils.html import escape
from django.urls import reverse, NoReverseMatch
from django.contrib.auth.models import User
from django.utils.safestring import mark_safe
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import APIKey
from .api import generate_api_key
from django.contrib import messages
from django import forms
from django.utils import timezone
from datetime import timedelta

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


class UserAdmin(BaseUserAdmin):
    actions = ['generate_api_key']

    def generate_api_key(self, request, queryset):
        for user in queryset:
            raw_key, hashed_key = generate_api_key(user)
            if raw_key:
                self.message_user(request, f"API Key generated for {user.username}: {raw_key[:10]}...")
            else:
                self.message_user(request, f"Failed to generate API Key for {user.username}", level='ERROR')

    generate_api_key.short_description = "Generate API Key"

admin.site.unregister(User)
admin.site.register(User, UserAdmin)


class ReadOnlyTextInput(forms.TextInput):
    def render(self, name, value, attrs=None, renderer=None):
        if value:
            truncated_value = value[:5] + '*' * 59
            return f'{truncated_value}'
        return super().render(name, value, attrs, renderer)


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
    
    class Meta:
        model = APIKey
        fields = ['user', 'key', 'expiration', 'expiry_at']

    def __init__(self, *args, **kwargs):
        self.request = kwargs.pop('request', None)
        super().__init__(*args, **kwargs)
        instance = kwargs.get('instance')
        if instance and instance.pk:
            if 'key' in self.fields:
                self.fields['key'].widget.attrs['readonly'] = True
                self.fields['key'].widget = ReadOnlyTextInput()
            if 'user' in self.fields:
                self.fields['user'].widget.attrs['readonly'] = True
            if 'expiry_at' in self.fields:
                self.fields['expiry_at'].widget.attrs['readonly'] = True
            if 'expiration' in self.fields:
                if not self.request.user.is_superuser:
                    self.fields['expiration'].widget.attrs['disabled'] = True
                else:
                    self.fields['expiration'].widget.attrs['readonly'] = True  
        else:
            if 'key' in self.fields:
                self.fields['key'].widget = forms.HiddenInput()
            if 'expiry_at' in self.fields:
                self.fields['expiry_at'].widget = forms.HiddenInput()

            if self.request and not self.request.user.is_superuser:
                self.fields['user'].queryset = User.objects.filter(id=self.request.user.id)
                self.fields['user'].initial = self.request.user
            else:
                self.fields['user'].queryset = User.objects.all()

    def clean_key(self):
        instance = getattr(self, 'instance', None)
        if instance and instance.pk:
            return instance.key
        return self.cleaned_data.get('key', '')

    def clean_expiration(self):
        expiration = self.cleaned_data.get('expiration')
        if expiration:
            try:
                expiration = int(expiration)
                if expiration not in [choice[0] for choice in self.EXPIRATION_CHOICES]:
                    raise forms.ValidationError('Invalid expiration value.')
            except ValueError:
                raise forms.ValidationError('Invalid expiration value.')
        return expiration

    def save(self, commit=True):
        instance = super().save(commit=False)
        expiration = self.cleaned_data.get('expiration')

        if expiration:
            instance.expiry_at = timezone.now() + timedelta(days=int(expiration))

        if commit:
            instance.save()

        return instance


class APIKeyAdmin(admin.ModelAdmin):
    list_display = ('user', 'shortened_key', 'created_at', 'expiry_at_display')
    form = APIKeyForm
    readonly_fields = ('key_details',)

    def get_queryset(self, request):
        if request.user.is_superuser:
            return APIKey.objects.all()
        else:
            return APIKey.objects.filter(user=request.user)

    def has_add_permission(self, request):
        return True

    def get_form(self, request, obj=None, **kwargs):
        kwargs['form'] = self.form
        form = super().get_form(request, obj, **kwargs)
        if 'key' in form.base_fields:
            form.base_fields['key'].widget = ReadOnlyTextInput()

        class CustomAPIKeyForm(form):
            def __init__(self, *args, **kwargs):
                kwargs['request'] = request
                super().__init__(*args, **kwargs)

        return CustomAPIKeyForm

    def save_model(self, request, obj, form, change):
        if not obj.key:
            user = request.user
            expiration_days = int(form.cleaned_data.get('expiration', 30))
            raw_key, hashed_key = generate_api_key(user, expiration_days)
            obj.key = hashed_key
            obj.expiry_at = timezone.now() + timedelta(days=expiration_days)
            hash_parts = hashed_key.split('$')
            obj.key_details = (
                f"algorithm: pbkdf2_sha256 \n "
                f"iterations: {hash_parts[1]}\n "
                f"salt: {hash_parts[2][:8]}{'*' * (len(hash_parts[2]) - 8)}\n "
                f"hash: {hash_parts[3][:8]}{'*' * (len(hash_parts[3]) - 8)}\n\n"
                f"Raw API keys are not stored, so there is no way to see this user’s API key."
            )
            copy_button = f'''
                <button id="copyButton" onclick="copyToClipboard('{raw_key}')" style="border: none; background: none; cursor: pointer;">
                    <img src="https://img.icons8.com/material-outlined/24/000000/clipboard.png" alt="Copy" style="vertical-align: middle;"/>
                    <span style="vertical-align: middle;">Copy</span>
                </button>
                <script>
                function copyToClipboard(text) {{
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    alert('API key copied to clipboard');
                }}
                </script>
            '''
            messages.success(request, mark_safe(f"The API Key for {user.username} was added successfully: {raw_key}. {copy_button} Make sure to copy this personal token now. You won't be able to see it again!"), extra_tags='safe', fail_silently=True)
        super().save_model(request, obj, form, change)

    def shortened_key(self, obj):
        if obj.key:
            hash_parts = obj.key.split('$')
            if len(hash_parts) >= 4:
                hash_start = hash_parts[3][:5] + '*' * (len(hash_parts[3]) - 5)
                return hash_start
            else:
                return 'Invalid Key'
        else:
            return ''

    shortened_key.short_description = 'Api-Key'

    def expiry_at_display(self, obj):
        return obj.expiry_at.strftime("%b %d, %Y, %-I:%M %p").replace('AM', 'a.m.').replace('PM', 'p.m.') if obj.expiry_at else '-'

    def get_readonly_fields(self, request, obj=None):
        readonly_fields = []
        if obj:
            readonly_fields.extend(['user', 'expiry_at', 'key_details'])
        return readonly_fields

    def get_exclude(self, request, obj=None):
        if not obj:
            return ['key', 'expiry_at']
        else:
            return ['key']

    def has_view_permission(self, request, obj=None):
        if request.user.is_superuser:
            return True
        if obj is None:
            return True
        return obj.user == request.user

admin.site.register(APIKey, APIKeyAdmin)