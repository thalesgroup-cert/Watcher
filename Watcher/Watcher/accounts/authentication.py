from knox.auth import TokenAuthentication

KNOX_COOKIE_NAME = "knox_token"
SESSION_INDICATOR_COOKIE = "session_active"


class KnoxCookieAuthentication(TokenAuthentication):
    """
    Knox token authentication that reads the token from an httpOnly cookie
    instead of the Authorization header.

    Prevents XSS from stealing the token via localStorage, which is
    reachable by any script running on the page. Falls through (returns
    None) when the cookie is absent so the standard header-based
    TokenAuthentication can still be tried next, for non-browser API
    clients.
    """

    def authenticate(self, request):
        token = request.COOKIES.get(KNOX_COOKIE_NAME)
        if not token:
            return None
        return self.authenticate_credentials(token.encode("utf-8"))


def set_auth_cookies(response, token: str, max_age: int, secure: bool) -> None:
    """Set the httpOnly token cookie and the JS-readable session indicator."""
    response.set_cookie(
        KNOX_COOKIE_NAME,
        token,
        httponly=True,
        secure=secure,
        samesite="Strict",
        max_age=max_age,
        path="/",
    )
    response.set_cookie(
        SESSION_INDICATOR_COOKIE,
        "1",
        httponly=False,
        secure=secure,
        samesite="Strict",
        max_age=max_age,
        path="/",
    )


def clear_auth_cookies(response) -> None:
    """Clear both auth cookies on logout."""
    response.delete_cookie(KNOX_COOKIE_NAME, path="/", samesite="Strict")
    response.delete_cookie(SESSION_INDICATOR_COOKIE, path="/", samesite="Strict")
