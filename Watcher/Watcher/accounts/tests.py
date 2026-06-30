from django.test import TestCase
from django.contrib.auth.models import User
from accounts.models import UserProfile, _AVATAR_COLORS
from accounts.serializers import UserProfileSerializer


class UserProfileTest(TestCase):
    """Test UserProfile model and related signals."""

    def test_avatar_color_assigned_on_user_creation(self):
        """Creating a User triggers the signal which assigns an avatar_color."""
        user = User.objects.create_user(
            username='colortest', password='testpass123'
        )
        # Profile should have been created by the signal
        profile = UserProfile.objects.get(user=user)
        self.assertIsNotNone(
            profile.avatar_color,
            "avatar_color should not be None after user creation"
        )
        self.assertIn(
            profile.avatar_color,
            _AVATAR_COLORS,
            f"avatar_color '{profile.avatar_color}' must be one of the palette colours"
        )

    def test_avatar_color_in_serializer(self):
        """UserProfileSerializer must expose the avatar_color field."""
        user = User.objects.create_user(
            username='serializertest', password='testpass123'
        )
        profile = UserProfile.objects.get(user=user)
        serializer = UserProfileSerializer(profile)
        self.assertIn(
            'avatar_color',
            serializer.data,
            "UserProfileSerializer must include avatar_color in its fields"
        )
