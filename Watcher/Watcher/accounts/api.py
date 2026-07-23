from django.conf import settings
from rest_framework import generics, permissions, viewsets
from rest_framework.response import Response
from knox.models import AuthToken
from .authentication import set_auth_cookies, clear_auth_cookies
from .serializers import UserSerializer, LoginSerializer, UserPasswordChangeSerializer, UserProfileSerializer
from .models import UserProfile
from django.utils import timezone


def _cookie_max_age() -> int:
    ttl = settings.REST_KNOX.get('TOKEN_TTL')
    return int(ttl.total_seconds()) if ttl else 36_000


# Login API
class LoginAPI(generics.GenericAPIView):
    serializer_class = LoginSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data
        _, token = AuthToken.objects.create(user)
        response = Response({
            "user": UserSerializer(user, context=self.get_serializer_context()).data,
            "token": token,
        })
        set_auth_cookies(response, token, _cookie_max_age(), secure=not settings.DEBUG)
        return response


# Logout API — wraps knox's own token deletion so the auth cookies get
# cleared too; knox's stock LogoutView has no notion of our cookies.
class LogoutAPI(generics.GenericAPIView):
    permission_classes = [
        permissions.IsAuthenticated,
    ]

    def post(self, request, *args, **kwargs):
        token = request.auth
        if token is not None:
            token.delete()
        response = Response({'detail': 'Logged out.'})
        clear_auth_cookies(response)
        return response


# Get User API
class UserAPI(generics.RetrieveAPIView):
    permission_classes = [
        permissions.IsAuthenticated,
    ]
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


# PasswordChange Viewset
class PasswordChangeViewSet(viewsets.ModelViewSet):
    permission_classes = [
        permissions.IsAuthenticated,
    ]
    serializer_class = UserPasswordChangeSerializer


# Generate API Key
def generate_api_key(user, expiration):
    expiry = timezone.timedelta(days=expiration)
    token_instance, raw_key = AuthToken.objects.create(user=user, expiry=expiry)
    
    return raw_key, token_instance


# User Profile API
class ProfileAPI(generics.RetrieveUpdateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = UserProfileSerializer

    def get_object(self):
        profile, _ = UserProfile.objects.get_or_create(user=self.request.user)
        return profile

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)