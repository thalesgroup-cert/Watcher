# Watcher Installation

## Prerequisites
- Installed Docker
- Installed docker-compose

## Launch watcher

    docker-compose build
    
That should build the images defined in the `docker-compose.yml` file.
    
    docker-compose up

That should run the Docker Container (Use `docker-compose up -d` if you want to run it in Background).

Please use `docker-compose down` to stop all containers.

### Migrate
Updates the state of the database in accordance with all current models and migrations. Migrations, their relationships 
with applications...

    docker-compose run watcher bash
    python manage.py migrate
    
### Create admin user
You will need to create the first superuser to access `/admin` page.

    docker-compose run watcher bash
    python manage.py createsuperuser

### Populate your database
If you want to populate your database with some banned words and sources related to Cybersecurity, 
feel free to use `populate_db` script:

    docker-compose run watcher bash
    python manage.py populate_db

## Configuration

### User enrollment 
To create simple user, staff user or admin user:

Connect to the `/admin` page:

   - Click on **Users**.
   - Click on **ADD USER**.
   - Enter the **Username** and **Password** and Click on **SAVE**.
   - Choose the permissions:
        * **Active** &rarr; Is the default one, site access for users
        * **Staff status** &rarr; Designates whether the user can log into this admin site.
        * **Superuser status** &rarr; Designates that this user has all permissions without explicitly assigning them.
   - You may enter an **Email address** for email notifications.
   - Click on **SAVE**.
   
### Add email notifications subscriber
Receive email notifications when subscribing to a topic.

Connect to the `/admin` page:

   - Click on **Subscribers**.
   - Click on **ADD SUBSCRIBER**.
   - Select the **User** and Click on **SAVE**.
   
### Static configuration
Most of the settings can be modify from the `/admin` page.

There are other settings located in `Watcher/watcher/settings.py` that you can configure:     

##### Feed Parser Settings
    POSTS_DEPTH = 30
    WORDS_OCCURRENCE = 10

Example for daily watch : `POSTS_DEPTH = 30` and `WORDS_OCCURRENCE = 5`

Example for a continuous watch : `POSTS_DEPTH = 3` and `WORDS_OCCURRENCE = 8`

Example for a Monday morning watch : `POSTS_DEPTH = 50` and `WORDS_OCCURRENCE = 0`

##### Email Alerts Settings

    EMAIL_FROM = "watcher@gemalto.com"
    SMTP_SERVER = "smtp.gemalto.com"
    # Website url, link in e-mails body
    WATCHER_URL = "https://watch.gemalto.com"

##### Production Settings [Important]

In production please put DJANGO_DEBUG environment variable to False in the `.env` file:

    DJANGO_DEBUG=False
    
Also, the **Django secret key** must be a **large random value** and it must be kept secret.
There is one by default but consider to change it in the `.env` file:

    DJANGO_SECRET_KEY=[large random value]
    
Time Zone settings in the `.env` file:

    # Time Zone
    TZ=Europe/Paris

If you have modified some of these parameters, don't forget to restart all containers:

    docker-compose down
    docker-compose up
    
## Remove the database

You may want to **reset** your database entirely, in case of troubleshooting or other. To do this you need to remove the database stored in your host system and re-build the image:

    docker-compose down
    docker volume rm watcher-project_db_data
    docker volume rm watcher-project_db_log

Now, you can rebuild the image and the parameters will be taken into account:

    docker-compose build
    docker-compose up -d

`-d` to launch the task in background.

Don't forget to [migrate](#migrate).

## Useful commands
Run interactive shell session on the Watcher container:

    docker-compose run watcher bash 

## Thehive & MISP Export
// Todo: Expliquer les solutions possible si 
// l'API Client ne marche pas comme espéré:
https://github.com/MISP/PyMISP/issues/523

You have two options there:

1. Update MISP or Thehive
2. Use an older version of PyMISP (https://pypi.org/project/pymisp/#history) or thehive4py 

Changer la version dans le requirements.tkt si en open source on peut le faire.

# Development 
If you want to modify the project, you will need to setup your development environment.

**CERT Team** : I will provide to you a **VirtualBox Image** (.ova) already setup for development.

### Install Mysql

You will need to install a proper mysql database. 

### Install Python dependencies 
Install `python3.6` (this is the dev version, the production version is the latest).
   
    pip install pipenv

From the project `/`:

    pipenv shell 
    pipenv install

### Install React Dependencies
From the project `/`:

    npm install

After modifying some Frontend ReactJs files you will need to run the command below.

    npm run dev
    
You just need to run it one time and it will watch your files and compile them.

For a production release you may use this one:

    npm run build
    
### Build documentation
After modifying some comments you may want to rebluid the documentation:

    pipenv shell

Please comment **line 2** of `/Watcher/threats_watcher/core.py`:

    # from .models import BannedWord, Source, TrendyWord, PostUrl, Subscriber

Please comment **line 2** of `/Watcher/data_leak/core.py`:

    # from .models import Keyword, Alert, PastId, Subscriber

Please comment **line 13** of `/Watcher/site_monitoring/core.py`:

    # from .models import Site, Alert

Please comment **line 4** of `/Watcher/site_monitoring/misp.py`:

    # from .models import Site

Please comment **line 3** of `/Watcher/site_monitoring/thehive.py`:

    # from .models import Site

Please comment **line 10** of `/Watcher/dns_finder/core.py`:

    # from .models import Alert, DnsMonitored, DnsTwisted, Subscriber

Go to `/docs`:
   
    make html 

Please uncomment after the documentation build.

---
Developed by Thales CERT.