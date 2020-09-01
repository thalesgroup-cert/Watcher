from rest_framework import generics, permissions, viewsets
from rest_framework.response import Response
from knox.models import AuthToken
from .serializers import UserSerializer, LoginSerializer, UserPasswordChangeSerializer


# Login API
class LoginAPI(generics.GenericAPIView):
    serializer_class = LoginSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data
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
