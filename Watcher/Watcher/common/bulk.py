import logging
import re

import tldextract
from django.conf import settings
from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.db import IntegrityError, transaction
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

logger = logging.getLogger('watcher.common')

_SCHEME_RE = re.compile(r'^[a-z][a-z0-9+.-]*://')
_PORT_RE = re.compile(r':\d+$')
_DEFANGED_DOTS = ('[.]', '(.)', '{.}', '[dot]', '(dot)')


def normalize_domain(value):
    """
    Normalize a domain typed or pasted by a user: trim, lowercase, undo the "defanging" used in
    threat reports (hxxps://example[.]com), drop the scheme, path/query/fragment, port and
    trailing dot ("HTTPS://Example.com/login?x=1" -> "example.com").
    """
    value = value.strip().lower()
    for defanged in _DEFANGED_DOTS:
        value = value.replace(defanged, '.')
    value = value.replace('[://]', '://').replace('[:]', ':')
    value = re.sub(r'^hxxp', 'http', value)
    value = _SCHEME_RE.sub('', value)
    value = re.split(r'[/?#]', value, maxsplit=1)[0]
    value = _PORT_RE.sub('', value)
    return value.rstrip('.')


def normalize_domain_data(data, field='domain_name'):
    """Return a copy of serializer input with `field` normalized (single create/update and bulk alike)."""
    data = data.copy()
    if isinstance(data.get(field), str):
        data[field] = normalize_domain(data[field])
    return data


def validate_domain(value):
    """Return an error message if `value` is not a registrable domain (same check as Site / DnsMonitored)."""
    extracted = tldextract.extract(value)
    if not extracted.domain or not extracted.suffix:
        return 'The domain name is not valid'
    return None


def _flatten_errors(errors):
    """Turn DRF serializer errors into a single readable string."""
    if isinstance(errors, dict):
        parts = []
        for field, messages in errors.items():
            if not isinstance(messages, (list, tuple)):
                messages = [messages]
            text = ' '.join(str(m) for m in messages)
            parts.append(text if field == 'non_field_errors' else f'{field}: {text}')
        return '; '.join(parts)
    if isinstance(errors, (list, tuple)):
        return ' '.join(str(e) for e in errors)
    return str(errors)


class BulkSkip(Exception):
    """Raised by a bulk operation to report an item as skipped (not an error), with the reason as message."""


def _result(value, status_, reason='', pk=None):
    return {'value': value, 'status': status_, 'reason': reason, 'id': pk}


def build_summary(results, ok_status, **extra):
    """Structured response shared by every bulk endpoint."""
    count = lambda s: sum(1 for r in results if r['status'] == s)
    summary = {
        'total': len(results),
        'succeeded': count(ok_status),
        'skipped': count('skipped'),
        'errors': count('error'),
        'ok_status': ok_status,
        'results': results,
    }
    summary.update(extra)
    return summary


class BulkCreateMixin:
    """
    Adds `POST <endpoint>/bulk_create/` to a ModelViewSet.

    Request body: {"values": "a\\nb\\nc" (or a list), "shared": {...fields applied to every item},
    "dry_run": false}. Every item goes through the viewset's own serializer and permissions, exactly
    like a single create, and is saved independently (one failure never rolls back the others).
    With "dry_run" the same checks run but nothing is written.

    Subclasses set:
      bulk_field       name of the main value field (e.g. "domain_name")
      bulk_normalizer  optional staticmethod(value) -> value applied to each line
      bulk_validator   optional staticmethod(value) -> error message or None, checked before the
                       serializer (for models whose serializer has no format validation)
    and may override `get_bulk_serializer_context()` / `after_bulk_create(instances)`.
    """
    bulk_field = None
    bulk_normalizer = None
    bulk_validator = None

    def get_bulk_serializer_context(self):
        return {}

    def after_bulk_create(self, instances):
        """Hook called once with every instance created by the batch."""

    def _bulk_lines(self, raw):
        lines = raw.splitlines() if isinstance(raw, str) else [str(v) for v in raw]
        normalize = self.bulk_normalizer or (lambda v: v.strip())
        return [normalize(line) for line in lines]

    @action(detail=False, methods=['post'], url_path='bulk_create')
    def bulk_create(self, request):
        raw = request.data.get('values')
        shared = request.data.get('shared') or {}
        dry_run = request.data.get('dry_run') is True
        if not isinstance(raw, (str, list)) or not isinstance(shared, dict):
            return Response(
                {'error': '"values" must be a string or a list and "shared" an object.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Normalize, drop empty lines and duplicates inside the batch (case-insensitive,
        # the unique columns use a case-insensitive collation).
        items, seen, batch_duplicates = [], set(), []
        for value in self._bulk_lines(raw):
            if not value:
                continue
            if value.lower() in seen:
                batch_duplicates.append(value)
                continue
            seen.add(value.lower())
            items.append(value)

        total = len(items) + len(batch_duplicates)
        if total == 0:
            return Response({'error': 'No value provided.'}, status=status.HTTP_400_BAD_REQUEST)
        max_items = settings.BULK_CREATE_MAX_ITEMS
        if total > max_items:
            return Response(
                {'error': f'Too many items: {total} (maximum {max_items} per request).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        model = self.get_queryset().model
        results, created_instances = [], []
        for value in items:
            data = dict(shared)
            data[self.bulk_field] = value
            if model.objects.filter(**{self.bulk_field: value}).exists():
                results.append(_result(value, 'skipped', 'Already exists'))
                continue
            error = self.bulk_validator(value) if self.bulk_validator else None
            if error:
                results.append(_result(value, 'error', error))
                continue
            serializer = self.get_serializer(data=data)
            serializer.context.update(self.get_bulk_serializer_context())
            if not serializer.is_valid():
                results.append(_result(value, 'error', _flatten_errors(serializer.errors)))
                continue
            if dry_run:
                results.append(_result(value, 'created'))
                continue
            try:
                with transaction.atomic():
                    self.perform_create(serializer)
            except IntegrityError:
                results.append(_result(value, 'skipped', 'Already exists'))
                continue
            except Exception:
                logger.exception('Bulk create failed for %r', value)
                results.append(_result(value, 'error', 'Internal error'))
                continue
            created_instances.append(serializer.instance)
            results.append(_result(value, 'created', pk=serializer.instance.pk))

        results.extend(_result(v, 'skipped', 'Duplicate in batch') for v in batch_duplicates)

        if created_instances:
            self.after_bulk_create(created_instances)

        summary = build_summary(results, 'created', dry_run=dry_run)
        summary['created'] = summary['succeeded']
        return Response(summary)


class BulkModelPermission(permissions.BasePermission):
    """Requires the Django `change` / `delete` model permission matching the bulk action."""

    def has_permission(self, request, view):
        model = view.get_queryset().model
        codename = 'change' if view.action == 'bulk_update' else 'delete'
        return request.user.has_perm(f'{model._meta.app_label}.{codename}_{model._meta.model_name}')


class BulkActionMixin:
    """
    Adds `POST <endpoint>/bulk_update/` ({"ids": [...], "changes": {...}}) and
    `POST <endpoint>/bulk_delete/` ({"ids": [...]}) to a ModelViewSet.

    Each id goes through the viewset's own serializer / `perform_update` / `perform_destroy`, so
    validation and side effects (signals, timeline) are the ones of a single update or delete; ids are
    processed independently and one failure never rolls back the others. Only the fields listed in
    `bulk_update_fields` can be changed in bulk.

    Permissions are the Django `change` / `delete` model permissions (what a single PATCH / DELETE needs);
    viewsets that only require an authenticated user for writes set `bulk_requires_model_perms = False`.
    """
    bulk_update_fields = ()
    bulk_requires_model_perms = True

    def get_permissions(self):
        if self.action in ('bulk_update', 'bulk_delete'):
            perms = [permissions.IsAuthenticated()]
            if self.bulk_requires_model_perms:
                perms.append(BulkModelPermission())
            return perms
        return super().get_permissions()

    def bulk_label(self, obj):
        """Text shown for a row in the summary; viewsets override it when str(obj) is not meaningful."""
        return str(obj)

    def _bulk_ids(self, request):
        """Return (ids, error_response)."""
        ids = request.data.get('ids')
        if not isinstance(ids, list) or not ids:
            return None, Response({'error': '"ids" must be a non-empty list.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            ids = list(dict.fromkeys(int(i) for i in ids))
        except (TypeError, ValueError):
            return None, Response({'error': '"ids" must contain integers.'}, status=status.HTTP_400_BAD_REQUEST)
        max_items = settings.BULK_ACTION_MAX_ITEMS
        if len(ids) > max_items:
            return None, Response(
                {'error': f'Too many items: {len(ids)} (maximum {max_items} per request).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return ids, None

    def _bulk_each(self, request, ids, ok_status, operation):
        """
        Run `operation(obj)` on every id independently and build the response. The operation may return a
        message, shown as the reason of the row.
        """
        queryset = self.get_queryset()
        results = []
        for pk in ids:
            obj = queryset.filter(pk=pk).first()
            if obj is None:
                results.append(_result(str(pk), 'skipped', 'Not found', pk))
                continue
            label = self.bulk_label(obj)
            try:
                self.check_object_permissions(request, obj)
                with transaction.atomic():
                    message = operation(obj)
                results.append(_result(label, ok_status, message or '', pk))
            except BulkSkip as exc:
                results.append(_result(label, 'skipped', str(exc), pk))
            except (PermissionDenied, DjangoPermissionDenied):
                results.append(_result(label, 'error', 'Permission denied', pk))
            except ValidationError as exc:
                results.append(_result(label, 'error', _flatten_errors(exc.detail), pk))
            except Exception:
                logger.exception('Bulk %s failed for %r', ok_status, label)
                results.append(_result(label, 'error', 'Internal error', pk))
        return Response(build_summary(results, ok_status))

    @action(detail=False, methods=['post'], url_path='bulk_delete')
    def bulk_delete(self, request):
        ids, error = self._bulk_ids(request)
        if error:
            return error
        return self._bulk_each(request, ids, 'deleted', self.perform_destroy)

    @action(detail=False, methods=['post'], url_path='bulk_update')
    def bulk_update(self, request):
        ids, error = self._bulk_ids(request)
        if error:
            return error
        changes = request.data.get('changes')
        if not isinstance(changes, dict) or not changes:
            return Response({'error': '"changes" must be a non-empty object.'}, status=status.HTTP_400_BAD_REQUEST)
        forbidden = sorted(set(changes) - set(self.bulk_update_fields))
        if forbidden:
            return Response(
                {'error': f'Fields not allowed in bulk: {", ".join(forbidden)}.',
                 'allowed': list(self.bulk_update_fields)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        def update(obj):
            serializer = self.get_serializer(obj, data=dict(changes), partial=True)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)

        return self._bulk_each(request, ids, 'updated', update)
