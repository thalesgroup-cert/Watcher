Thanks to [**ISEN-Toulon Engineering School**](https://www.isen-mediterranee.fr/) and to [**Thales Group**](https://www.thalesgroup.com/) CERT (THA-CERT) for allowing me to carry out this project.

---
# Watcher Installation

## Prerequisites
- Installed Docker
- Installed docker-compose

Configure Watcher settings using the `.env` file ([Static configuration](#Static-configuration)).

## Launch watcher

- Grab the `docker-compose.yml`, `.env` files and `Searx`, `Rss-bridge` directories (Keep directory structure).
    
- `docker-compose up`

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
In the `.env` file:

    EMAIL_FROM=watcher@example.com
    SMTP_SERVER=smtp.example.com
    
Website url, link in the email notifications body:

    WATCHER_URL=https://example.watcher.local

##### TheHive Settings
You will need to fill the IP of your TheHive instance and an API key generated.

In the `.env` file:

    # THE HIVE SETUP
    THE_HIVE_URL=http://10.10.10.10:9000
    THE_HIVE_KEY=
    THE_HIVE_CASE_ASSIGNEE=watcher

##### MISP Settings
You will need to fill the IP of your MISP instance and an API key generated.

In the `.env` file:

    # MISP Setup
    MISP_URL=https://localhost
    MISP_VERIFY_SSL=False
    MISP_KEY=

##### LDAP Settings
You can configure an LDAP authentication within Watcher:

In the `.env` file:

    # LDAP Setup
    AUTH_LDAP_SERVER_URI=
    AUTH_LDAP_BIND_DN=
    AUTH_LDAP_BIND_PASSWORD=
    AUTH_LDAP_BASE_DN=
    AUTH_LDAP_FILTER=(uid=%(user)s)

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
If the export do not work as expected, this may be related with 
the version of your TheHive or MISP instance.

In fact, if you are using an outdated TheHive/MISP instance, the client API version will not correspond with your 
TheHive/MISP instance version:

- Update MISP or Thehive

---
Developed by Thales Group CERT.