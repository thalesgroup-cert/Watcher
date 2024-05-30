from rest_framework import generics, permissions, viewsets
from rest_framework.response import Response
from knox.models import AuthToken
from .serializers import UserSerializer, LoginSerializer, UserPasswordChangeSerializer
from django.utils import timezone
from django.contrib.auth.models import User
from hashlib import sha256
from django.contrib.auth.hashers import make_password, check_password 


# Login API
class LoginAPI(generics.GenericAPIView):
    serializer_class = LoginSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data
        raw_key, _ = generate_api_key(user)
        return Response({
            "user": UserSerializer(user, context=self.get_serializer_context()).data,
            "token": AuthToken.objects.create(user)[1]
        })


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


# Generate Api Key
def generate_api_key(user, expiration_days=30):
    expiry = timezone.timedelta(days=expiration_days)
    token_instance, raw_key = AuthToken.objects.create(user, expiry=expiry)
    
    # Generate hash using pbkdf2_sha256
    hashed_key = make_password(raw_key, salt=None, hasher='pbkdf2_sha256')
    
    if raw_key:
        print(f"API Key generated for user {user.username}: {raw_key}")
        return raw_key, hashed_key
    else:
        print(f"Failed to generate API Key for user {user.username}")
        return None, None