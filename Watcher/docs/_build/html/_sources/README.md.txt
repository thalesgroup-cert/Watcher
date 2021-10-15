Developed by [Thales Group CERT](https://github.com/thalesgroup-cert).

---
# Install Watcher

## Prerequisites
- [Install docker](https://docs.docker.com/install/)
- [Install docker-compose](https://docs.docker.com/compose/install/)

## Launch watcher
- Grab the `docker-compose.yml`, `.env` files and `Searx`, `Rss-bridge` directories (keep the directory structure).
- According to your existing infrastructure you may need to configure **Watcher settings** using the `.env` file ([Static configuration](#static-configuration)). 
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

- Try to access Watcher on http://0.0.0.0:9002 or http://yourserverip:9002.
- `CONTROL-C`
- `docker-compose down` to stop all containers.

### Migrate
Updates the state of the database in accordance with all current models and migrations. Migrations, their relationships 
with applications...

    docker-compose down
    docker-compose run watcher bash
    python manage.py migrate
    
### Create admin user
You will need to create the first superuser to access the `/admin` page.

    docker-compose down
    docker-compose run watcher bash
    python manage.py createsuperuser

### Populate your database
Populate your database with hundred of banned words and RSS sources related to Cyber Security.

Use `populate_db` script:

    docker-compose down
    docker-compose run watcher bash
    python manage.py populate_db

### Good to know
The first time you run Watcher, you will not have any new threats on the homepage, this is normal.

You just have to wait for Watcher to crawl the Internet. This will happen every 30 minutes.

## Static configuration
Most of the settings can be modified from the `/admin` page.

There are other settings located in the `.env` file that you can configure. 

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

##### Access Watcher remotely within your server instance
In case of **"Bad Request" Error** when accessing Watcher web interface, fill `ALLOWED_HOST` variable (in `.env` file) with your Watcher Server Instance **IP** / or your **FQDN**.

It is limited to a **single IP address** / **single FQDN**. 

Please use this syntax: 

    ALLOWED_HOST=X.X.X.X or ALLOWED_HOST=mywebsite.com
    
Now, you can restart your instance and the parameters will be taken into account:

    docker-compose down
    docker-compose up
    
##### SMTP Server Settings (Email Notifications) 
In the `.env` file:

    EMAIL_FROM=watcher@example.com
    SMTP_SERVER=smtp.example.com
    
Website url, which will be the link in the email notifications body:

    WATCHER_URL=https://example.watcher.local
    
Now, you can restart your instance and the parameters will be taken into account:

    docker-compose down
    docker-compose up
 
##### TheHive Settings
If you want to use **TheHive export**, please fill the **IP** of your TheHive instance and a **generated API key**.

In the `.env` file:

    # THE HIVE SETUP
    THE_HIVE_URL=
    THE_HIVE_KEY=
    THE_HIVE_CASE_ASSIGNEE=watcher
 
Now, you can restart your instance and the parameters will be taken into account:

    docker-compose down
    docker-compose up
 
##### MISP Settings
If you want to use **MISP export**, please fill the **IP** of your MISP instance and an **API key**.

In the `.env` file:

    # MISP Setup
    MISP_URL=
    MISP_VERIFY_SSL=False
    MISP_KEY=
 
Now, you can restart your instance and the parameters will be taken into account:

    docker-compose down
    docker-compose up
 
##### LDAP Settings
You can configure an LDAP authentication within Watcher:

In the `.env` file:

    # LDAP Setup
    AUTH_LDAP_SERVER_URI=
    AUTH_LDAP_BIND_DN=
    AUTH_LDAP_BIND_PASSWORD=
    AUTH_LDAP_BASE_DN=
    AUTH_LDAP_FILTER=(uid=%(user)s)
 
Now, you can restart your instance and the parameters will be taken into account:

    docker-compose down
    docker-compose up

## Troubleshooting
### Remove the database

You may want to **reset** your database entirely, in case of troubleshooting or other. To do this, you need to remove the database stored in your host system and restart the instance:

    docker-compose down
    docker volume rm watcher-project_db_data
    docker volume rm watcher-project_db_log

Now, you can rebuild the image and the parameters will be taken into account:

    docker-compose up

Don't forget to [migrate](#migrate).

### Useful commands

Use `docker-compose up -d` if you want to run it in background.

Run interactive shell session on the Watcher container:

    docker-compose run watcher bash

# Use Watcher
## User enrollment 
To create a simple user, staff user or admin user:

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
 
## Add email notifications subscriber
Receive email notifications when subscribing to a topic.

Connect to the `/admin` page:

   - Click on **Subscribers**.
   - Click on **ADD SUBSCRIBER**.
   - Select the **User** and Click on **SAVE**.

## Add your RSS source to Threats Detection
As you know this feature allow the detection of emerging vulnerabilities, malwares using social networks & other RSS sources (www.cert.ssi.gouv.fr, www.cert.europa.eu, www.us-cert.gov, www.cyber.gov.au...).

Watcher currently provides hundreds of RSS cybersecurity sources ([Populate default RSS sources](#populate-your-database)).

However, you can add your RSS Cybersecurity source to your Watcher instance:

- First, make sure you have a URL leading to an RSS file (Atom 1.0, Atom 0.3, RSS 2.0, RSS 2.0 with Namespaces, RSS 1.0). 
- Your RSS file must be composed of several articles.
- Please consider the use of https over http. 

Connect to the `/admin` page:

- Click on **Sources** in **THREATS_WATCHER** part.
- Click on **ADD SOURCE**.
- Fill **Url** text input.
- Click on **SAVE**.

## How to use RSS-Bridge to add more sources from Facebook, GoogleSearch, YouTube…
RSS-Bridge is, by default, configured with Twitter only, but users can use it for all other sources like Facebook, DuckDuckGo, GoogleSearch…

To do so, you need to add the new bridge needed in the `Watcher/Rss-bridge/whitelist.txt` file.

An RSS-Bridge source URL looks like this: `http://10.10.10.7/?action=display&bridge=Twitter&context=By+username&u=tomchop_&norep=on&nopic=on&noimg=on&noimgscaling=on&format=Mrss`

To add your own custom url, simply change the bridge, if necessary, with the associated parameters (just keep `http://10.10.10.7/` & `format=Mrss`).

You can test RSS-Bridge API with a public instance like this one: [https://wtf.roflcopter.fr/rss-bridge/](https://wtf.roflcopter.fr/rss-bridge/)

RSS API request example: [https://wtf.roflcopter.fr/rss-bridge/?action=display&bridge=Twitter&context=By+username&u=tomchop_&norep=on&nopic=on&noimg=on&noimgscaling=on&format=Mrss](https://wtf.roflcopter.fr/rss-bridge/?action=display&bridge=Twitter&context=By+username&u=tomchop_&norep=on&nopic=on&noimg=on&noimgscaling=on&format=Mrss)

## Thehive & MISP Export
You can export **monitored DNS** to [TheHive](https://thehive-project.org/) or [MISP](https://www.misp-project.org/):

  - Go to **/website_monitoring** page.
  - Add new DNS to monitored.
  - Click on the **blue upload/cloud button**.
  - Choose which service you want to use.

### Troubleshooting
If the export do not work as expected, this may be related with 
the version of your TheHive or MISP instance.

In fact, if you are using an outdated TheHive/MISP instance, the client API version will not correspond with your 
TheHive/MISP instance version:

- Update Thehive or MISP.

## Remove & Add to Blocklist
There is a **blocklist** to prevent a **false positive trendy words** from reappearing again.

To add **1** word:

- Go to the landing page.
- Authenticate and Click on the "**Delete & Blocklist**" **button**.

To add **several** words:

- Go to **/admin** page.
- Click on **Trendy words**.
- **Check** words that you want to remove & blocklist.
- Click on **Action** dropdown.
- Select "**Delete & Blocklist selected trendy words**".

## Archived Alerts
Once you have processed an alert, you can archive it.

To archived **1** alert:

- Go to the alert that you want to archived.
- Select the "**disable**" **button**.

To archived **several** alerts:

- Go to **/admin** page.
- Click on **Alerts**.
- **Check** alerts that you want to archived.
- Click on **Action** dropdown.
- Select "**Disable selected alerts**".

# Update Watcher
To update Watcher image please follow the instructions below:

- Stop all containers: `docker-compose down`
- Remove the old docker images: `docker rmi felix83000/watcher searx/searx rssbridge/rss-bridge`
- Pull the newer docker images: `docker-compose up`

This will update the all project **Watcher**, **Rss-bridge** and **Searx**.

Verify that your local files `/.env`, `/docker-compose.yml` and `/Searx/` are **up-to-date**.

Sometimes you will see in Watcher logs a <span style="color:red"> **database migration request in red**</span>. 
If so, please follow the migration [process](#migrate).

# Developers
If you want to modify the project and Pull Request (PR) your work, you will need to setup your development environment.

## Open a Pull Request (PR) to contribute to this project
- Fork the official Watcher repository
- Install`Git`
- Open a terminal: `git clone <your_forked_repository.git>`
- Switch to the dev branch: `git checkout -b feature/<name_of_the_new_feature>`
- Make your changes on the working files and then: `git add *`
- Add a commit message and description: `git commit -m "Title" -m "Description"`
- Publish the changes: `git push origin feature/<name_of_the_new_feature>`
- Back to GitHub on your forked repository, click Under Contribute > Open Pull Request and then Confirm the operation
- Done! Your work will be reviewed by the team! 

## Setup Watcher environment
Use a Linux server, we recommend the use of a Virtual Machine (Ubuntu 20.04 LTS in our case).

Then, follow the steps below:

- **Install** `Python 3.8` **&** `Node.js 16`
- **Pull Watcher code:** `git clone <your_forked_repository.git>`
- `cd Watcher/Watcher`
- **Install** `python-ldap` **dependencies:** `sudo apt install -y libsasl2-dev python-dev libldap2-dev libssl-dev`
- **Install** `mysqlclient` **dependency:** `sudo apt install default-libmysqlclient-dev`
- **Install Python dependencies:** `pip install -r requirements.txt`
- **Install NLTK/punkt dependency:** `python3 ./nltk_dependencies.py`
     - If you have a proxy, you can configure it in `nltk_dependencies.py` script.  
- **Install Node.js dependencies:**
     - `sudo apt install npm`
     - `npm install`
- **Install MySQL:**
     - `sudo apt install mysql-server`
     - `sudo mysql_secure_installation`
          - Enter root password.
          - You may now enter `Y` and `ENTER`. Accept all fields. This will remove some anonymous users and the test database, 
    disable remote root logins, and load these new rules so that MySQL immediately respects any changes made.

**Create & Configure Watcher database:**

    sudo mysql 
    CREATE USER 'watcher'@'localhost' IDENTIFIED BY 'Ee5kZm4fWWAmE9hs';
    GRANT ALL PRIVILEGES ON *.* TO 'watcher'@'localhost' WITH GRANT OPTION;
    CREATE DATABASE db_watcher;
    use db_watcher;
    exit
    systemctl status mysql.service
    cd watcher

In `settings.py` change `HOST` variable to `localhost`:

    DATABASES = {
       'default': {
           'ENGINE': 'django.db.backends.mysql',
           'CONN_MAX_AGE': 3600,
           'NAME': 'db_watcher',
           'USER': 'watcher',
           'PASSWORD': 'Ee5kZm4fWWAmE9hs',
           'HOST': 'localhost',
           'PORT': '3306',
           'OPTIONS': {
               'init_command': "SET sql_mode='STRICT_TRANS_TABLES'",
           },
       }
    }

- <span style="color:red">**[IMPORTANT]** When **commit** put `HOST` variable back to `db_watcher`</span>
- `cd ..`
- **[Migrate](#migrate) the database:** `python3 manage.py migrate`
- **Run Watcher:** `python3 manage.py runserver`

## Deploy a simple SMTP server to test the email notifications
If you are working on a test environment and willing to have email alerts, here is a simple way to configure the SMTP settings to make it work.
- Grab the docker-compose file: [here](https://github.com/rnwood/smtp4dev/blob/master/docker-compose.yml).
- Run the command: `docker-compose up`
- The mails will be available here by default: `localhost:5000`
- Modify the mail settings in the environment variables: `vi /.env`
    - `EMAIL_FROM=from@from.com`
    - `SMTP_SERVER=localhost`
- Launch Watcher: `python3 Watcher/Watcher/manage.py runserver` 

## Modify the frontend
If you need to modify the frontend `/Watcher/Watcher/frontend`:

From `/Watcher/Watcher/`, run the command below:

    npm run dev

Let this command run in background. 
Now, when modifying some frontend ReactJs files it will automatically build them into one file (`/Watcher/Watcher/frontend/static/frontend/main.js`).

<span style="color:red">**[IMPORTANT]** When **commit** you have to run **1 time** the command below:</span>

    npm run build

## Migrations: Change the database schema
Migrations are Django’s way of propagating changes you make to your models 
(adding a field, deleting a model, etc.) into your database schema. They’re designed to be mostly automatic, 
but you’ll need to know when to make migrations, when to run them, and the common problems you might run into.

### The commands
There are several commands which you will use to interact with migrations and Django’s handling of database schema:
- `migrate`, which is responsible for applying and unapplying migrations.
- `makemigrations`, which is responsible for creating new migrations based on the changes you have made to your models.
- `sqlmigrate`, which displays the SQL statements for a migration.
- `showmigrations`, which lists a project’s migrations and their status.

### Change a model (adding a field, deleting a model, etc.)
When you are **making a change to a model**, for instance, adding a new field to: **/Watcher/Watcher/data_leak/models.py**
Then, you need to create a new migration based on the changes you have made:
- Go to **/Watcher/Watcher/** and run this command: `python3 manage.py makemigrations`

<span style="color:red"> **[IMPORTANT]** Run the `makemigrations` command **only once**</span>, when you have made **all the changes**. 
Otherwise, it will create **several unnecessary migration files**.

## Build the documentation
Modify some function comments or the `/Watcher/README.md` file.

Go to `/Watcher/docs` and run:
   
     ./build_the_docs.sh

When commit please add the all `/Watcher/docs` folder and the `README.md` file:

    git add ../docs ../README.md
