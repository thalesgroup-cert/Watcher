from .catalogue import NotificationType

_TYPES: dict[str, NotificationType] = {}


def register(*types):
    for ntype in types:
        _TYPES[ntype.id] = ntype


def find_type(type_id):
    return _TYPES.get(type_id)


def get_type(type_id):
    try:
        return _TYPES[type_id]
    except KeyError:
        raise KeyError(f"Notification '{type_id}' not found") from None


def all_types():
    return list(_TYPES.values())
