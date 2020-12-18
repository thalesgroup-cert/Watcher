from abc import ABC
from django.utils import timezone
from threats_watcher.models import BannedWord, Source
from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group
from django.contrib.auth.models import Permission

import csv


class Command(BaseCommand, ABC):
    args = '<foo bar ...>'
    help = 'If you want to populate your database with a default blocklist, sources and User Groups feel free to use populate_db script.'

    # ------
    # Call this function once, if you need some inital datas in your DB
    # ------
    @staticmethod
    def _init_db():
        # Init BannedWord DB with common banned words from CSV File
        with open('threats_watcher/datas/banned_words.csv') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                if not BannedWord.objects.filter(name=row['name']):
                    BannedWord.objects.create(name=row['name'])
            print(str(timezone.now()) + " - Updated Blocklist.")

        # Init Source DB with common sources from CSV File
        with open('threats_watcher/datas/sources.csv') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                if not Source.objects.filter(url=row['source']):
                    Source.objects.create(url=row['source'])
            print(str(timezone.now()) + " - Updated RSS Sources.")

        # Init User Groups
        permissions = Permission.objects.all()
        view_permissions = []
        full_monitoring_permissions = []
        for perm in permissions:
            if "view" in perm.codename \
                    and "auth" not in str(perm.content_type) \
                    and "contenttypes" not in str(perm.content_type) \
                    and "sessions" not in str(perm.content_type) \
                    and "knox" not in str(perm.content_type) \
                    and "admin" not in str(perm.content_type):
                view_permissions.append(perm)
            if "auth" not in str(perm.content_type) \
                    and "content type" not in str(perm.content_type) \
                    and "sessions" not in str(perm.content_type) \
                    and "knox" not in str(perm.content_type) \
                    and "admin" not in str(perm.content_type):
                full_monitoring_permissions.append(perm)
        if not Group.objects.filter(name='Analysts Read Only Group') and not Group.objects.filter(
                name='Analysts Group'):
            analyst_read_only_group = Group.objects.create(name='Analysts Read Only Group')
            analyst_read_only_group.permissions.set(view_permissions)

            analyst_group = Group.objects.create(name='Analysts Group')
            analyst_group.permissions.set(full_monitoring_permissions)

            print(str(timezone.now()) + " - User Groups Created")

    def handle(self, *args, **options):
        self._init_db()
