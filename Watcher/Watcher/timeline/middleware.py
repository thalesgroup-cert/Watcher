import threading

_thread_locals = threading.local()


def get_current_user():
    return getattr(_thread_locals, 'user', None)


class CurrentUserMiddleware:
    """Store the authenticated request user in thread-local storage so signals can access it.

    Django's AuthenticationMiddleware handles session auth, but Knox tokens are resolved
    by DRF at view level — AFTER middleware runs. We explicitly call Knox's authenticator
    here so the signals fired during that request can read the correct user.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, 'user', None)
        if user and user.is_authenticated:
            _thread_locals.user = user
        else:
            # Knox token auth happens at DRF view level; resolve it manually here.
            try:
                from knox.auth import TokenAuthentication
                result = TokenAuthentication().authenticate(request)
                _thread_locals.user = result[0] if result else None
            except Exception:
                _thread_locals.user = None

        response = self.get_response(request)
        _thread_locals.user = None
        return response
