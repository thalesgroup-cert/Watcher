Thanks to [**ISEN-Toulon Engineering School**](https://www.isen-mediterranee.fr/) and to [**Thales Group**](https://www.thalesgroup.com/) CERT (THA-CERT) for allowing me to carry out this project.

---
# Watcher Installation

## Prerequisites
- [Install docker](https://docs.docker.com/install/)
- [Install docker-compose](https://docs.docker.com/compose/install/)

## Launch watcher

- Grab the `docker-compose.yml`, `.env` files and `Searx`, `Rss-bridge` directories (Keep directory structure).
- Configure Watcher settings using the `.env` file ([Static configuration](#static-configuration)). 
- `docker-compose up`

This should run Docker containers.

Please wait until you see:

    watcher          | db_watcher is up, starting Watcher.
    watcher          | Performing system checks...
    watcher          | 
    watcher          | System check identified no issues (0 silenced).
    watcher          | October 08, 2020 - 10:28:02
    watcher          | Django version 3.1.1, using settings 'watcher.settings'
    watcher          | Starting development server at http://0.0.0.0:9002/
    watcher          | Quit the server with CONTROL-C.

- Try Access Watcher on http://0.0.0.0:9002 or http://yourserverip:9002.
- `CONTROL-C`
- `docker-compose down` to stop all containers.

### Migrate
Updates the state of the database in accordance with all current models and migrations. Migrations, their relationships 
with applications...

    docker-compose down
    docker-compose run watcher bash
    python manage.py migrate
    
### Create admin user
You will need to create the first superuser to access `/admin` page.

    docker-compose down
    docker-compose run watcher bash
    python manage.py createsuperuser

### Populate your database
Populate your database with hundred of banned words and RSS sources related to Cybersecurity.

Use `populate_db` script:

    docker-compose down
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

### Add your RSS source to Threats Detection
As you know this feature allow the detection of emerging vulnerability, malware using social network & other RSS sources (www.cert.ssi.gouv.fr, www.cert.europa.eu, www.us-cert.gov, www.cyber.gov.au...).

Watcher currently provides hundreds of RSS cybersecurity sources ([Populate default RSS sources](#populate-your-database)).

However, you can add your RSS Cybersecurity source to your Watcher instance:

- First, make sure you have a URL leading to an RSS file (Atom 1.0, Atom 0.3, RSS 2.0, RSS 2.0 with Namespaces, RSS 1.0). 
- Your RSS file must be composed of several articles.
- Please prefer to use https instead of http. 

Connect to the `/admin` page:

- Click on **Sources** in **THREATS_WATCHER** part.
- Click on **ADD SOURCE**.
- Fill **Url** text input.
- Click on **SAVE**.

### Static configuration
Most of the settings can be modify from the `/admin` page.

There are other settings located in the `.env` file that you can configure:     

##### Production Settings [Important]

In production please put DJANGO_DEBUG environment variable to **False** in the `.env` file:

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

##### SMTP Server Settings (Email Notifications) 
In the `.env` file:

    EMAIL_FROM=watcher@example.com
    SMTP_SERVER=smtp.example.com
    
Website url, which will be the link in the email notifications body:

    WATCHER_URL=https://example.watcher.local

##### TheHive Settings
If you want to use **TheHive export**, please fill the **IP** of your TheHive instance and an **API key generated**.

In the `.env` file:

    # THE HIVE SETUP
    THE_HIVE_URL=
    THE_HIVE_KEY=
    THE_HIVE_CASE_ASSIGNEE=watcher

##### MISP Settings
If you want to use **MISP export**, please fill the **IP** of your MISP instance and an **API key**.

In the `.env` file:

    # MISP Setup
    MISP_URL=
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

## Update Watcher
To update Watcher image please follow the instructions below:

- Stop all containers: `docker-compose down`
- Remove the old image: `docker rmi felix83000/watcher:latest`
- Pull the newer image: `docker-compose up`

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

Use `docker-compose up -d` if you want to run it in Background.

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