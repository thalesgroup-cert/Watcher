from abc import ABC

from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth import authenticate


# User Serializer
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'first_name', 'email')


# Login Serializer
class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField()

    def validate(self, data):
        user = authenticate(**data)
        if user and user.is_active:
            return user
        if user and not user.is_active:
            raise serializers.ValidationError("Account created but not active. Please contact the administrator.")
        raise serializers.ValidationError("Incorrect Credentials")


# Serializer for password change endpoint.
class UserPasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True, max_length=30)
    password = serializers.CharField(required=True, max_length=30)

    def validate(self, data):
        # add here additional check for password strength if needed
        if not self.context['request'].user.check_password(data.get('old_password')):
            raise serializers.ValidationError({'old_password': 'Wrong password.'})
        validate_password(data.get('password'))
        return data

    def create(self, validated_data):
        self.context['request'].user.set_password(validated_data.get('password'))
        self.context['request'].user.save()
        return self.context['request'].user

    @property
    def data(self):
        # just return success dictionary. you can change this to your need, but i dont think output should be user data after password change
        return {'Success': True}
