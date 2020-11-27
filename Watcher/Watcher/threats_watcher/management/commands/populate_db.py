from abc import ABC

from threats_watcher.models import BannedWord, Source
from django.core.management.base import BaseCommand

import csv


class Command(BaseCommand, ABC):
    args = '<foo bar ...>'
    help = 'If you want to populate your database with some banned words and sources, feel free to use populate_db script.'

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

        # Init Source DB with common sources from CSV File
        with open('threats_watcher/datas/sources.csv') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                if not Source.objects.filter(url=row['source']):
                    Source.objects.create(url=row['source'])

    def handle(self, *args, **options):
        self._init_db()
