from django.middleware.csrf import get_token
from rest_framework import generics, permissions, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView
from knox.models import AuthToken
from django.contrib.auth.signals import user_logged_out
from .core import clear_auth_cookies, set_auth_cookies
from .serializers import UserSerializer, LoginSerializer, UserPasswordChangeSerializer, UserProfileSerializer
from .models import UserProfile
from django.utils import timezone


# Login API
class LoginAPI(generics.GenericAPIView):
    serializer_class = LoginSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data
        token = AuthToken.objects.create(user)[1]
        response = Response({
            "user": UserSerializer(user, context=self.get_serializer_context()).data,
            "token": token,  # kept for the scripts: the browser uses the cookie
        })
        set_auth_cookies(request, response, token)
        get_token(request)  # the CSRF cookie the next requests of the page send back
        return response


# Logout API: what knox's own view does, and the cookies go too
class LogoutAPI(APIView):
    permission_classes = [
        permissions.IsAuthenticated,
    ]

    def post(self, request, *args, **kwargs):
        if request.auth is not None:
            request.auth.delete()
        user_logged_out.send(sender=request.user.__class__, request=request, user=request.user)
        response = Response(None, status=204)
        clear_auth_cookies(response)
        return response


# Logout of every session of the user
class LogoutAllAPI(APIView):
    permission_classes = [
        permissions.IsAuthenticated,
    ]

    def post(self, request, *args, **kwargs):
        request.user.auth_token_set.all().delete()
        user_logged_out.send(sender=request.user.__class__, request=request, user=request.user)
        response = Response(None, status=204)
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