Developed by [Thales Group CERT](https://github.com/thalesgroup-cert).

---

# Install Watcher

## Prerequisites
- [Install docker](https://docs.docker.com/install/)

## Launch watcher

### With docker command
- Grab the `docker-compose.yml`, `.env.example`, the `Searx` directory and the `screenshotter` directory (keep the directory structure).
- Copy `.env.example` to `.env` (the `.env` is not versioned: it is yours) and fill it in. According to your existing infrastructure you may need to configure **Watcher settings** in it ([Static configuration](#static-configuration)).
- The application uses **SearxNG** as the meta search engine.
- `docker compose up`

This should run Docker containers.

Please wait until you see:

    watcher          | db_watcher is up, starting Watcher.
    watcher          | Performing system checks...
    watcher          | 
    watcher          | System check identified no issues (0 silenced).
    watcher          | [11/May/2026 12:26:52] INFO | gunicorn: Starting gunicorn
    watcher          | [11/May/2026 12:26:52] INFO | gunicorn: Listening at: http://0.0.0.0:9002 (1)

- Try to access Watcher on http://0.0.0.0:9002 or http://yourserverip:9002.
- `CONTROL-C`
- `docker compose down` to stop all containers.

### Simplify method
Use the deployment helper commands from the repository root:

Initialize **your local configuration once**, from the repository root: `cp .env.example .env` (this `.env` is the one of the root `docker-compose.yml`, on port 9002; `make init` below creates `deployment/.env`, a second file for the deployment, on port 9020)

**And after:** 

    cd ../deployment
    make init
    make up

**On first run**:

    make migrate
    make superuser
    make populate-db

Then **access Watcher on**:

- http://0.0.0.0:9020 (default deployment port)
- or your configured domain/port from `deployment/.env`

Deployment configuration is centralized in `deployment/.env` (generated from `deployment/.env.example`).
Set your secrets there, especially `DJANGO_SECRET_KEY`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `DB_ROOT_PASSWORD`.

### Migrate
Updates the state of the database in accordance with all current models and migrations. Migrations, their relationships 
with applications...

    docker compose down
    docker compose run watcher bash
    python manage.py migrate
    
### Create admin user
You will need to create the first superuser to access the `/admin` page.

    docker compose down
    docker compose run watcher bash
    python manage.py createsuperuser

### Populate your database
Populate your database with hundred of banned words and RSS sources related to Cyber Security.

Use `populate_db` script:

    docker compose down
    docker compose run watcher bash
    python manage.py populate_db

### Good to know
The first time you run Watcher, you will not have any new threats on the homepage, this is normal.

You just have to wait for Watcher to crawl the Internet. This will happen every 30 minutes.

## Static configuration
Most of the settings can be modified from the `/admin` page.

There are other settings located in the `.env` file that you can configure.

Many of the external-integration settings below (SMTP, Slack, MISP, TheHive, Citadel, CyberWatch feeds, LLM providers) can also be viewed, overridden, and tested live from the [Connectors](#connectors) page, without editing the `.env` file.

### Production Settings [Important]

In production please put DJANGO_DEBUG environment variable to **False** in the `.env` file:

    DJANGO_DEBUG=False
    
Also, the **Django secret key** must be a **large random value** and it must be kept secret.
There is one by default but consider to change it in the `.env` file:

    DJANGO_SECRET_KEY=[large random value]
    
Time Zone settings in the `.env` file:

    # Time Zone
    TZ=Europe/Paris

If you have modified some of these parameters, don't forget to restart all containers:

    docker compose down
    docker compose up

### Access Watcher remotely within your server instance
In case of **"Bad Request" Error** when accessing Watcher web interface, fill `ALLOWED_HOST` variable (in `.env` file) with your Watcher Server Instance **IP** / or your **FQDN**.

It is limited to a **single IP address** / **single FQDN**. 

Please use this syntax: 

    ALLOWED_HOST=X.X.X.X or ALLOWED_HOST=mywebsite.com
    
Now, you can restart your instance and the parameters will be taken into account:

    docker compose down
    docker compose up
 
### MISP Settings
If you want to use **MISP export**, please fill the **IP** of your MISP instance and an **API key**.

In the `.env` file:

    # MISP Setup
    MISP_URL=
    MISP_VERIFY_SSL=False
    MISP_KEY=
 
Now, you can restart your instance and the parameters will be taken into account:

    docker compose down
    docker compose up
 
### LDAP Settings
You can configure an LDAP authentication within Watcher:

In the `.env` file:

    # LDAP Setup
    AUTH_LDAP_SERVER_URI=
    AUTH_LDAP_BIND_DN=
    AUTH_LDAP_BIND_PASSWORD=
    AUTH_LDAP_BASE_DN=
    AUTH_LDAP_FILTER=(uid=%(user)s)
 
Now, you can restart your instance and the parameters will be taken into account:

    docker compose down
    docker compose up

### SSO / OpenID Connect Settings

Watcher supports federated login via any **OpenID Connect (OIDC)** provider (Keycloak, Azure AD...)

The login page behaviour is controlled by a single variable `LOGIN_MODE`:

| Value | Effect |
|---|---|
| `form_only` | Username / password form only - **default** |
| `sso_only` | SSO button only, the credential form is hidden |
| `both` | SSO button **and** the credential form are both shown |

In the `.env` file:

    # SSO / OIDC Setup
    # Controls the login page: form_only | sso_only | both
    LOGIN_MODE=form_only
    OIDC_COMPANY_NAME=
    # Required when LOGIN_MODE is 'sso_only' or 'both'
    OIDC_RP_CLIENT_ID=
    OIDC_RP_CLIENT_SECRET=
    OIDC_OP_AUTHORIZATION_ENDPOINT=
    OIDC_OP_TOKEN_ENDPOINT=
    OIDC_OP_USER_ENDPOINT=
    OIDC_OP_JWKS_ENDPOINT=
    OIDC_OP_ISSUER=
    # Optional - set to False to only allow SSO login for pre-existing users (default: True)
    OIDC_CREATE_USER=True

Set `LOGIN_MODE=sso_only` (or `both`) and fill in the OIDC credentials to activate the SSO login button and the OIDC routes.

`OIDC_COMPANY_NAME` is optional - when set it is displayed on the SSO button (e.g. `Sign in with Acme Corp`).

`OIDC_CREATE_USER` controls whether a new local account is automatically created the first time someone logs in via SSO. Set it to `False` to require an admin to create the account first - unrecognized SSO users are then redirected back to the login page instead of being auto-provisioned.

The callback URL to register with your identity provider is:

    https://<your-domain>/api/auth/oidc/callback/

Now, you can restart your instance and the parameters will be taken into account:

    docker compose down
    docker compose up

### CyberWatch Settings

Configure the external threat intelligence feed endpoints used by the CyberWatch module. All variables have working defaults and can be left unset.

In the `.env` file:

    # CyberWatch Setup
    CYBER_WATCH_CVE_API_URL=https://cve.circl.lu/api/last
    # CISA KEV (vulnerabilities exploited in the wild) and FIRST EPSS (probability of exploitation): two connectors, with their
    # own Test button in Connectors. Leave the address empty to switch one off.
    CYBER_WATCH_KEV_URL=https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json
    CYBER_WATCH_EPSS_API_URL=https://api.first.org/data/v1/epss
    # Days the CVEs and the ransomware victims are kept (0 keeps everything); a nightly job removes the older ones,
    # except the CVEs exploited in the wild and what a watch rule matched
    CYBER_WATCH_CVE_RETENTION_DAYS=365
    CYBER_WATCH_VICTIM_RETENTION_DAYS=365
    CYBER_WATCH_RANSOMWARE_GROUPS_URL=
    CYBER_WATCH_RANSOMWARE_VICTIMS_URL=
    CYBER_WATCH_RANSOMLOOK_GROUPS_URL=
    CYBER_WATCH_RANSOMLOOK_RECENT_URL=
    CYBER_WATCH_RANSOMLOOK_ACTORS_URL=

Now, you can restart your instance and the parameters will be taken into account:

    docker compose down
    docker compose up

### LLM Settings

The AI features (breaking news, keyword summaries and the weekly report) use the LLM selected as **Default AI** on the [Connectors](#connectors) page. API keys, models and base URLs of the supported providers (OpenAI, Anthropic, Gemini, Ollama) can be set there, or in the `.env` file.

The model name must start with the [LiteLLM provider prefix](https://docs.litellm.ai/docs/providers) of the provider it targets: `openai/`, `anthropic/`, `gemini/` or `ollama/` (e.g. `gemini/gemini-2.5-flash`).

To use another endpoint (an internal LLM platform, for instance), fill the **Generic LLM Provider** variables. Prefix its model with the provider that matches the API format of the endpoint: `openai/` for an OpenAI-compatible API, `mistral/` for a Mistral API, and so on. Its base URL must be complete, including the version path when the API requires it (e.g. `https://llm.example.com/v1`).

Leave the base URL of OpenAI, Anthropic and Gemini empty to use the official API URL known by LiteLLM. Set it only to go through a proxy or a custom endpoint.

> **Important:** Configuring a provider is not enough. Once its connector is set up, select it as **Default AI** on the [Connectors](#ai-connectors--default-ai) page. As long as no Default AI is selected, every summary is generated by the local Hugging Face fallback model.

The TLS certificates of the LLM endpoints are verified by default: the API keys go to them. Set `LITELLM_VERIFY_SSL=False` only for an endpoint with a self-signed certificate, or point `CA_PATH` to the certificate of its authority.

In the `.env` file:

    # OpenAI (optional)
    OPENAI_API_KEY=
    OPENAI_MODEL=
    OPENAI_BASE_URL=

    # Anthropic (optional)
    ANTHROPIC_API_KEY=
    ANTHROPIC_MODEL=
    ANTHROPIC_BASE_URL=

    # Gemini (optional)
    GEMINI_API_KEY=
    GEMINI_MODEL=
    GEMINI_BASE_URL=

    # Ollama (optional)
    OLLAMA_API_KEY=
    OLLAMA_MODEL=
    OLLAMA_API_URL=

    # Generic LLM Provider (optional)
    GENERIC_LLM_URL=
    GENERIC_LLM_KEY=
    GENERIC_LLM_MODEL=

    # Local fallback model (Hugging Face)
    HF_LOCAL_MODEL=Qwen/Qwen2.5-0.5B-Instruct

    # TLS certificate verification for LLM endpoints (default: True)
    LITELLM_VERIFY_SSL=True

Now, you can restart your instance and the parameters will be taken into account:

    docker compose down
    docker compose up

### Local Models and Load

Threats Watcher reads the title of every article with a small entity model (`dslim/bert-base-NER`) every 30 minutes, and a local language model (`HF_LOCAL_MODEL`) writes the summaries when no AI connector is available. The image carries both, so Watcher does not need to reach Hugging Face. In the `.env` file:

    # 1: never reach Hugging Face (an instance without Internet access). Commented: a model that is not in the image is downloaded
    # HF_HUB_OFFLINE=1
    # Computing threads the entity model may use while it reads the titles (0: no limit, every core)
    NER_TORCH_THREADS=2

- A title is given to the model **once**: its entities are kept in memory, so an article that stays in a feed for days is not read again at each run. Only the new ones are.
- The end line of the job says what it did: `titles` (looked at), `titles_analyzed` (given to the model), `titles_cached` (already known), and `ner_unavailable` when the model could not be loaded (the words of the run are then not counted).
- The jobs that run every 15 or 30 minutes start on their own minute (3, 6, 9, 11, 2...) instead of all on the same second, and the model uses at most `NER_TORCH_THREADS` cores: the web interface stays responsive while a run is under way.
- To build a smaller image that downloads the models at their first use: `docker build --build-arg PRELOAD_HF_MODELS=false .`

### Configurable Help Button

The header help quick-link is configurable via environment variables:

    # Help button
    WATCHER_HELP_BUTTON_LABEL=API Docs
    WATCHER_HELP_BUTTON_URL=/api/docs/

### Data Retention

Some tables only grow if nothing removes the oldest rows. A nightly job of each module does it; **0 keeps everything**. In the `.env` file:

    # Cyber Watch (03:30): the CVEs and the ransomware victims older than this go,
    # except the CVEs exploited in the wild and what a watch rule matched
    CYBER_WATCH_CVE_RETENTION_DAYS=365
    CYBER_WATCH_VICTIM_RETENTION_DAYS=365
    # AI summaries (03:50): one is added at each Regenerate. The latest summary of each kind (weekly report,
    # breaking news, each word) is always kept
    SUMMARY_RETENTION_DAYS=90
    # Activity journal (03:50): the lines of the Timeline and of the "History" of each object
    TIMELINE_RETENTION_DAYS=365

To see what a purge would remove before it runs (for example before updating an instance that has never been cleaned), run the command with `--dry-run`; without it, the command does what the night job does:

    docker compose exec watcher python manage.py purge_cyber_watch --dry-run
    docker compose exec watcher python manage.py purge_history --dry-run

### Logs and Web Server

Watcher is served by **Gunicorn** with **one worker and 16 threads, on purpose**: the scheduled jobs run inside the web process, so a second worker would run every job (and send every notification) twice. `GUNICORN_THREADS`, `GUNICORN_TIMEOUT` and `GUNICORN_LOG_LEVEL` tune it; do not raise the number of workers.

Three logs are kept apart:
- **Application log** (what Watcher detects, schedules and sends): console and `logs/<module>.log`. Each scheduled job ends with a `CRON TASK done` line and each notification with a `Notification …: slack=ok, email=no recipients` line. `TRACE_LEVEL` sets the level (`INFO` by default).
- **Access log** (who did what): `logs/access.log`, one line per request with the user, the address, the method, the path, the status and the duration. `ACCESS_LOG_CONSOLE=1` also prints it on the console.
- **Server log**: Gunicorn's own messages, on the console, prefixed `gunicorn:`.

### Encryption Key of the Connectors

The credentials of the connectors saved in the interface are encrypted in the database with the key `CONNECTORS_ENCRYPTION_KEY` (a Fernet key). **When it is empty, a key built into the code is used, which every installation shares: set your own** before saving credentials:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Changing the key later makes the credentials already saved unreadable: they have to be entered again.

### Corporate Proxy / Custom CA Certificates

If Watcher runs behind a corporate proxy that intercepts or re-signs HTTPS traffic (SSL/TLS inspection), or must trust an internal Certificate Authority for internal services, drop the CA certificate(s) in `deployment/certificates/` alongside the existing `rootcafile.pem`.

The `watcher` container merges every CA mounted there with the system's public trust store at startup, via the standard `update-ca-certificates` tool, into `/etc/ssl/certs/ca-certificates.crt` — the file `REQUESTS_CA_BUNDLE` points to. This **extends** the trust store instead of replacing it, so public HTTPS endpoints (RSS feeds, CVE APIs, ransomware.live...) keep working alongside your internal ones.

See [deployment/README.md](https://github.com/thalesgroup-cert/Watcher/blob/master/deployment/README.md#corporate-proxy--custom-ca-certificates) for the exact `compose_apps.yaml` volume configuration and how to mount more than one CA file.

## Troubleshooting
### Remove the database

You may want to **reset** your database entirely, in case of troubleshooting or other. To do this, you need to remove the database stored in your host system and restart the instance:

    docker compose down
    docker volume rm watcher-project_db_data
    docker volume rm watcher-project_db_log

Now, you can rebuild the image and the parameters will be taken into account:

    docker compose up

Don't forget to [migrate](#migrate).

### Useful commands

Use `docker compose up -d` if you want to run it in background.

Run interactive shell session on the Watcher container:

    docker compose run watcher bash

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
 
## Subscribe to notifications

Receive notifications via different channels when subscribing to a topic.

To add a subscriber, follow these steps:

1. Go to the `/admin` page.
2. Click on **Subscribers**.
3. Click on **ADD SUBSCRIBER**.
4. Select the **USER**.
5. Choose your preferred notification channel from the following options:
   - **EMAIL**
   - **THEHIVE**
   - **SLACK**
   - **CITADEL**

Make sure to configure the necessary settings for each channel in your `.env` file.

The weekly report and breaking news have dedicated layouts for each channel: colored attachments in Slack, formatted HTML in Citadel, and a clean HTML version for emails. Summaries regenerated manually from the interface never send notifications.

### Configure your Email notifications

To configure Email, you need the following variables, in the `.env` file:

    # DJANGO EMAIL Configuration
    SMTP_SERVER=
    EMAIL_PORT=25
    EMAIL_USE_TLS=False
    EMAIL_USE_SSL=False
    EMAIL_HOST_USER=
    EMAIL_HOST_PASSWORD=
    EMAIL_FROM=

Follow these steps to get the required information:

1. Choose your email provider (example: Gmail, Outlook...)
2. Go to the email provider’s settings and generate the **SMTP configuration**:
   - For **Gmail**, detailed instructions can be found in [Google's SMTP documentation](https://support.google.com/a/answer/176600?hl=en).
   - For **Outlook**, you can refer to the [Outlook SMTP documentation](https://support.microsoft.com/en-us/office/pop-imap-and-smtp-settings-for-outlook-com-d088b986-291d-42b8-9564-9c414e2aa040) for more information.
3. Follow the instructions to retrieve the SMTP server, email port, and other necessary credentials.
4. Save these values in your `.env` file.
   - `SMTP_SERVER`
   - `EMAIL_PORT`
   - `EMAIL_USE_TLS`
   - `EMAIL_USE_SSL` 
   - `EMAIL_HOST_USER` 
   - `EMAIL_HOST_PASSWORD` 
   - `EMAIL_FROM` 

Now, you can restart your instance and the parameters will be taken into account:

    docker compose down
    docker compose up

### Configure your TheHive notifications

To configure TheHive, you need the following variables, in the `.env` file:

    # THE HIVE Setup
    THE_HIVE_URL=
    THE_HIVE_VERIFY_SSL=False
    THE_HIVE_KEY=
    # Ensure the custom field referenced here is CREATED IN THEHIVE. Otherwise, Alert exports to TheHive will be impacted
    THE_HIVE_CUSTOM_FIELD=watcher-id
    THE_HIVE_EMAIL_SENDER=watcher@watcher.com

Follow these steps to get the required information:

1. Go to your TheHive instance’s API section (typically located at `/account/api`).
2. Copy the API Key from this page and save it as `THEHIVE_API_TOKEN` in your `.env` file.


3. Also, you need to set the URL of your TheHive instance as `THEHIVE_URL` in your `.env` file.
4. For proper integration, Watcher uses a custom field in TheHive for its ticketing system. By default, this field is named **watcher-id** and should be set as `THE_HIVE_CUSTOM_FIELD` in your .env file.

    # Note: Ensure the custom field referenced here is CREATED IN THEHIVE. Otherwise, Alert exports to TheHive will be impacted

   You can modify the name of this custom field in your .env file to match your specific TheHive instance setup.

5. The **second custom** field is used to track the email sender and is defined as `THE_HIVE_EMAIL_SENDER`. By default, this is set to watcher@watcher.com. You can update this value in your .env file as needed.

Now, you can restart your instance and the parameters will be taken into account:

    docker compose down
    docker compose up

### Configure your Slack notifications

To configure Slack, you need the following variables, in the `.env` file:

    # SLACK Setup
    SLACK_API_TOKEN=
    SLACK_CHANNEL=

Follow these steps to get the required information:

1. Go to the [Slack API page](https://api.slack.com/apps).
2. Click on **Create New App**.
3. Choose **From scratch**.
4. Once your app is created, go to **OAuth & Permissions**.
5. Under **OAuth Scopes**, ensure you add the required permission:
   - `chat:write` (This allows your app to send messages to channels).
6. On **OAuth Tokens**, click on **Install App** to install the app to your workspace.
7. After installation, you will be provided with an **OAuth Access Token**. Copy this token and save it as `SLACK_API_TOKEN` in your `.env` file.
8. Lastly, create the channel in Slack if you haven’t already and save its name as `SLACK_CHANNEL` in the `.env` file.

Now, you can restart your instance and the parameters will be taken into account:

    docker compose down
    docker compose up

### Configure your Citadel notifications

To configure Citadel, you need the following variables, in the `.env` file:

    # CITADEL Setup
    CITADEL_API_TOKEN=
    CITADEL_CHANNEL=
    CITADEL_URL=

Follow these steps to get the required information:

1. If you don't have an account, go to this link to create one: Citadel Team Documentation.
2. Create a **New Room**.
3. Retrieve the `CITADEL_ROOM_ID` from the room's settings. Copy the room's link, then extract the ID after `/#/room/` and add it to your .env file.
4. Next, visit this link: [Citadel Team Website](https://cds.thalesgroup.com/en/ercom/citadel) to request your `CITADEL_API_TOKEN`. This token will allow you to send automatic notifications.
5. For the `CITADEL_URL` variable, if you're using a public instance, the URL should be: [https://join.citadel.team/](https://join.citadel.team/). Otherwise, enter your customized instance URL.

Now, you can restart your instance and the parameters will be taken into account:

    docker compose down
    docker compose up

## Add your RSS source to Threats Detection
As you know this feature allow the detection of emerging vulnerabilities, malwares using social networks & other RSS sources (www.cert.ssi.gouv.fr, www.cert.europa.eu, www.us-cert.gov, www.cyber.gov.au...)

Watcher currently provides hundreds of RSS cybersecurity sources ([Populate default RSS sources](#populate-your-database)).

However, you can add your RSS Cybersecurity source to your Watcher instance:

- First, make sure you have a URL leading to an RSS file (Atom 1.0, Atom 0.3, RSS 2.0, RSS 2.0 with Namespaces, RSS 1.0).
- Your RSS file must be composed of several articles.
- Please consider the use of https over http.

From the web interface (signed in, with the right to add sources):

- Go to **Threats Watcher** (`/#/threats_watcher`), **Sources** tab.
- Click **Add**, then **RSS sources**.
- Fill the feed URL, its country and its reliability (High 100 %, Medium 50 %, Low 20 %). Switch on **Add several, one per line** to paste a list; **Preview** shows what would be added.
- Click **Add**. The source is read at the next run (every 30 minutes); its last fetch status shows in the list.

You can still do it from the `/admin` page: **Sources** in the **THREATS_WATCHER** part, **ADD SOURCE**.


## Monitored Keywords and Rules

In **Threats Watcher > Monitored keywords**, each entry is either a **single word** or a **rule**. Watcher checks them against every article of the RSS sources it collects (every 30 minutes); nothing is searched anywhere else, so the words of a rule never leave Watcher.

- **A single word** matches inside longer words, ignoring case and accents. Each new article that mentions it counts as a mention, and the entry rises from *warm* to *hot* and *super hot* as the mentions add up (the level applies to every entry).
- **A rule** (tick *Rule: several words in the same article*) asks for **all** the words of "must contain all of" (logical AND), **at least one** of "and at least one of" (optional), and **none** of "never when it contains". Matching ignores case and accents, and can be limited to whole words (`apt` does not match `adapt`).

A rule keeps each article it matched, to review and archive from its drawer, and notifies once per article. A new rule only applies to the articles collected after it was created. Rules can be paused, singly or in bulk.

The notification **Keyword rule match** goes to Slack, Citadel and e-mail (the Threats Watcher subscribers who ticked *E-mail* and *Monitored Keywords*). Like every notification, it is **off until a superuser switches it on** in **Connectors > Notifications**.

## Manage Legitimate Domains

The **Legitimate Domains** module helps track company-approved domains, monitor expiry dates, and manage domain lifecycle.

### Add a Legitimate Domain

1. Navigate to the `/#/legitimate_domains` page
2. Click **Add domains**
3. Fill in the following fields:
   - **Domain name**: Company-owned domain (e.g., `company.com`); switch on **Add several, one per line** to paste a list
   - **Ticket** and **Contact**: Reference and responsible team/person
   - **Registered on**, **Domain expiry**, **Certificate expiry**: Dates (filled from RDAP / the certificate when left empty)
   - **Repurchased**: Mark if the domain was bought back
   - **Comments**

4. Click **Add**

Click a domain to open its details on the right (expiry, comments, MISP events, history of changes).

### Convert Monitored Site to Legitimate Domain

From the **Website Monitoring** module:
1. Go to `/#/website_monitoring`
2. Click a monitored website, then **Export** > **To Legitimate Domains** (or select several websites and use **Export** in the selection bar)
3. Check the details in the dialog
4. The domain moves to Legitimate Domains and stops being monitored as a malicious website

### RDAP Alerts for Legitimate Domains

Watcher automatically monitors RDAP changes for legitimate domains:
- **Registrar changes**: Alerts when domain ownership transfers
- **Expiry date updates**: Notifications 30/15/7 days before expiration
- **Status changes**: Tracks available/disabled/registered transitions

Expiring domains and certificates are counted at the top of `/#/legitimate_domains` (a click filters the list) and on the Overview.

### Domains the Registry Does Not Know

A legitimate domain that the registry says does not exist is not yours (any more). After two answers in a row it goes to **Pending actions** ("Domain lost"): approving moves it to Website Monitoring, rejecting keeps it and it is not asked again. A name with a part before its registrable domain (`en.wordpress.com`) is never called lost.

After updating from 3.x, list the domains found before this release, then queue them with `--apply`:

    docker compose exec watcher python manage.py queue_lost_domains

To compare a stored expiry date with what the registries say now (nothing is written):

    docker compose exec watcher python manage.py check_expiry_dates <domain>


## API Key Creation & Management

Connect to the `/admin` page:

- Click on **API Keys** in **Accounts** part.
- Click on **ADD API KEY**.
- Select the **expiration** date.
- Click on **SAVE**.

You must pass your API keys via the Authorization header. It should be formatted as follows: **`Authorization: Token <API_KEY>`** where **<API_KEY>** refers to the full generated API key.

### Browser sessions and scripts

The browser never holds the token of its session in a place a script of the page can read: the server keeps it in an `httpOnly` cookie (`knox_token`, `SameSite=Strict`, `Secure` when the page is served in HTTPS) and sets a second cookie, `session_active`, that only tells the page that there is a session. A request of the browser that changes something carries the CSRF token (`X-CSRFToken`, from the `csrftoken` cookie).

A script is not concerned: `POST /api/auth/login` still answers the token, and the `Authorization: Token <token>` header is accepted as before, on every route, as are API keys. `POST /api/auth/logout/` answers 204 as before (and clears the cookies of a browser); `POST /api/auth/logoutall/` ends every session of the user.

### Pagination

**Usage Examples:**

```bash
# Get first page with default size (100 items)
GET /api/data_leak/keyword/

# Get specific page
GET /api/data_leak/keyword/?page=2

# Customize page size (between 1 and 1000)
GET /api/data_leak/keyword/?page=1&page_size=50

# Maximum page size
GET /api/data_leak/keyword/?page=1&page_size=1000
```

**Response Fields:**
- `count`: Total number of items across all pages
- `next`: URL to the next page (null if last page)
- `previous`: URL to the previous page (null if first page)
- `results`: Array containing the actual items for the current page

**Notes:**
- Pagination is implemented across all major API endpoints
- Default page size is 100 items
- Maximum page size is 1000 items
- Every page of the web interface reads its lists through this pagination (with `ordering`, `search` and the filters of each list in the query string).

### Interactive API Documentation

Watcher ships with a fully auto-generated REST API documentation powered by **drf-spectacular**.

- **Swagger UI** - available at `/api/docs/` - interactive interface to browse every endpoint, inspect request/response schemas, and execute authenticated calls directly from the browser.
- **OpenAPI 3 schema** - downloadable at `/api/schema/` (JSON/YAML) for import into Postman, Insomnia, or any API client.

All six modules are fully covered, including the `/statistics/` endpoints and the CyberWatch Watch Rule engine.

Below, you will find our 6 modules with their API functions:

<details>

<summary>Threats Watcher</summary>  <br>

`^api/threats_watcher/trendyword/$`
- **HTTP Method:** GET, POST, PATCH, DELETE
- **Pagination:** No
- **Description:** 
  - **GET:** Returns a paginated list of trending words monitored by the application.
  - **POST:** Adds a new trending word to the monitored list.
  - **PATCH:** Updates an existing trending word in the monitored list.
  - **DELETE:** Removes a trending word from the monitored list.
- **Usage:** Used to get, add, update, or delete currently monitored trending keywords.

`^api/threats_watcher/bannedword/$`
- **HTTP Method:** GET, POST, PATCH, DELETE
- **Pagination:** No
- **Description:** 
  - **GET:** Returns a paginated list of banned words monitored by the application.
  - **POST:** Adds a new banned word to the monitored list.
  - **PATCH:** Updates an existing banned word in the monitored list.
  - **DELETE:** Removes a banned word from the monitored list.
- **Usage:** Used to get, add, update, or delete currently monitored banned keywords.

</details> <br>

<details>

<summary>Data Leak</summary> <br>

`^api/data_leak/keyword/$`
- **HTTP Method:** GET, POST, PATCH, DELETE
- **Pagination:** Yes (100 items per page by default)
- **Description:** 
  - **GET:** Returns a paginated list of keywords monitored for data leaks.
  - **POST:** Adds a new keyword to the monitored list for data leaks.
  - **PATCH:** Updates an existing keyword in the monitored list for data leaks.
  - **DELETE:** Removes a keyword from the monitored list for data leaks.
- **Usage:** Used to get, add, update, or delete keywords monitored for data leaks.

`^api/data_leak/alert/$`
- **HTTP Method:** GET, POST, PATCH, DELETE
- **Pagination:** Yes (100 items per page by default)
- **Description:** 
  - **GET:** Returns a paginated list of alerts related to data leaks.
  - **POST:** Adds a new alert for data leaks.
  - **PATCH:** Updates an existing alert for data leaks.
  - **DELETE:** Removes an alert related to data leaks.
- **Usage:** Used to get, add, update, or delete current alerts regarding data leaks.

</details> <br>

<details>

<summary>Website Monitoring</summary> <br>

`^api/site_monitoring/site/$`
- **HTTP Method:** GET, POST, PATCH, DELETE
- **Pagination:** Yes (100 items per page by default)
- **Description:** 
  - **GET:** Returns a paginated list of sites monitored by the application.
  - **POST:** Adds a new site to the monitored list.
  - **PATCH:** Updates an existing site in the monitored list.
  - **DELETE:** Removes a site from the monitored list.
- **Usage:** Used to get, add, update, or delete currently monitored sites.

`^api/site_monitoring/alert/$`
- **HTTP Method:** GET, POST, PATCH, DELETE
- **Pagination:** Yes (100 items per page by default)
- **Description:** 
  - **GET:** Returns a paginated list of alerts related to site monitoring.
  - **POST:** Adds a new alert related to site monitoring.
  - **PATCH:** Updates an existing alert related to site monitoring.
  - **DELETE:** Removes an alert related to site monitoring.
- **Usage:** Used to get, add, update, or delete current alerts regarding site monitoring.

`^api/site_monitoring/misp/$`
- **HTTP Method:** POST
- **Pagination:** No
- **Description:** 
  - **POST:** Exports a monitored site to MISP threat intelligence platform.
- **Usage:** Used to integrate site monitoring data with MISP.

`^api/site_monitoring/site/statistics/$`
- **HTTP Method:** GET
- **Pagination:** No
- **Description:**
  - **GET:** Returns aggregated statistics for site monitoring (total sites, malicious count, takedown requests, legal team cases).
- **Usage:** Used to display dashboard statistics.

</details> <br>

<details>

<summary>DNS Threats Monitored</summary> <br>

`^api/dns_finder/dns_monitored/$`
- **HTTP Method:** GET, POST, PATCH, DELETE
- **Pagination:** Yes (100 items per page by default)
- **Description:** 
  - **GET:** Returns a paginated list of monitored DNS domains.
  - **POST:** Adds a new DNS domain to the monitored list.
  - **PATCH:** Updates an existing monitored DNS domain.
  - **DELETE:** Removes a DNS domain from the monitored list.
- **Usage:** Used to get, add, update, or delete currently monitored DNS domains.

`^api/dns_finder/keyword_monitored/$`
- **HTTP Method:** GET, POST, PATCH, DELETE
- **Pagination:** Yes (100 items per page by default)
- **Description:** 
  - **GET:** Returns a paginated list of monitored DNS keywords.
  - **POST:** Adds a new keyword to the monitored list.
  - **PATCH:** Updates an existing monitored keyword.
  - **DELETE:** Removes a keyword from the monitored list.
- **Usage:** Used to get, add, update, or delete currently monitored DNS keywords.

`^api/dns_finder/dns_twisted/$`
- **HTTP Method:** GET, POST, PATCH, DELETE
- **Pagination:** Yes (100 items per page by default)
- **Description:** 
  - **GET:** Returns a paginated list of twisted DNS domains (typosquatting).
  - **POST:** Adds a new twisted DNS domain to the monitored list.
  - **PATCH:** Updates an existing twisted DNS domain in the monitored list.
  - **DELETE:** Removes a twisted DNS domain from the monitored list.
- **Usage:** Used to get, add, update, or delete currently monitored twisted DNS domains.

`^api/dns_finder/alert/$`
- **HTTP Method:** GET, POST, PATCH, DELETE
- **Pagination:** Yes (100 items per page by default)
- **Description:** 
  - **GET:** Returns a paginated list of DNS alerts.
  - **POST:** Adds a new DNS alert.
  - **PATCH:** Updates an existing DNS alert.
  - **DELETE:** Removes a DNS alert.
- **Usage:** Used to get, add, update, or delete current DNS alerts.

`^api/dns_finder/misp/$`
- **HTTP Method:** POST
- **Pagination:** No
- **Description:** 
  - **POST:** Exports DNS findings to MISP threat intelligence platform.
- **Usage:** Used to integrate DNS findings with MISP.

</details> <br>

<details>

<summary>Legitimate Domains</summary> <br>

`^api/common/legitimate_domains/$`
- **HTTP Method:** GET, POST, PATCH, DELETE
- **Pagination:** Yes (100 items per page by default)
- **Description:**
  - **GET:** Returns a paginated list of legitimate company-owned domains.
  - **POST:** Export a domain from Website Monitoring to the legitimate domains list. Payload includes: domain_name, ticket_id, contact, expiry, repurchased (bool), comments.
  - **PATCH:** Updates an existing legitimate domain.
  - **DELETE:** Removes a legitimate domain.
- **Usage:** Add a company-approved domain for expiry/contact monitoring and tracking.

`^api/common/legitimate_domains/statistics/$`
- **HTTP Method:** GET
- **Pagination:** No
- **Description:**
  - **GET:** Returns aggregated statistics for legitimate domains (total, repurchased, expired, expiring soon).
- **Usage:** Used to display dashboard statistics.

`^api/common/legitimate_domains/misp/$`
- **HTTP Method:** POST
- **Pagination:** No
- **Description:**
  - **POST:** Exports a legitimate domain to MISP threat intelligence platform.
- **Usage:** Used to integrate legitimate domain data with MISP.

</details> <br>

<details>

<summary>CyberWatch</summary> <br>

`^api/cyber_watch/cves/$`
- **HTTP Method:** GET
- **Pagination:** Yes (100 items per page by default)
- **Description:**
  - **GET:** Returns a paginated list of CVE alerts fetched from cve.circl.lu.
- **Usage:** Used to display CVE monitoring data in the CyberWatch dashboard.

`^api/cyber_watch/cves/statistics/$`
- **HTTP Method:** GET
- **Pagination:** No
- **Description:**
  - **GET:** Returns aggregated CVE statistics (total, critical, high, new today).
- **Usage:** Used to display the CVEStats KPI panel.

`^api/cyber_watch/ransomware/victims/$`
- **HTTP Method:** GET
- **Pagination:** Yes (100 items per page by default)
- **Description:**
  - **GET:** Returns a paginated list of ransomware victims fetched from ransomware.live and ransomlook.io.
- **Usage:** Used to display victim data in the CyberWatch dashboard.

`^api/cyber_watch/ransomware/statistics/$`
- **HTTP Method:** GET
- **Pagination:** No
- **Description:**
  - **GET:** Returns aggregated ransomware statistics (total victims, groups, new this week).
- **Usage:** Used to display the RansomwareStats KPI panel.

`^api/cyber_watch/watch-rules/$`
- **HTTP Method:** GET, POST, PATCH, DELETE
- **Pagination:** Yes (100 items per page by default)
- **Description:**
  - **GET:** Returns all defined watch rules.
  - **POST:** Creates a new keyword-based watch rule scoped to CVEs, ransomware victims, or both.
  - **PATCH:** Updates an existing watch rule.
  - **DELETE:** Removes a watch rule.
- **Usage:** Manage keyword alert rules from the CyberWatch dashboard.

`^api/cyber_watch/watch-rule-hits/$`
- **HTTP Method:** GET
- **Pagination:** Yes (100 items per page by default)
- **Description:**
  - **GET:** Returns all recorded rule hits (deduplicated matches between rules and incoming data).
- **Usage:** Display rule match history in the CyberWatch module.

</details> <br>

<details>

<summary>Threat Intelligence Summaries</summary> <br>

`^api/threats_watcher/summary/?type=weekly_summary`
- **HTTP Method:** GET
- **Pagination:** No
- **Description:**
  - **GET:** Returns the AI-generated weekly summary of threats detected by the watcher.
- **Usage:** Fetch and display the weekly threat intelligence report.

`^api/threats_watcher/summary/?type=breaking_news`
- **HTTP Method:** GET
- **Pagination:** No
- **Description:**
  - **GET:** Returns breaking news / high-priority alerts detected by the watcher.
- **Usage:** Fetch and display breaking news alerts.

`^api/threats_watcher/summary/?type=trendy_word_summary&keyword=<keyword>`
- **HTTP Method:** GET
- **Pagination:** No
- **Description:**
  - **GET:** Returns the existing AI-generated summary for a given trendy word (keyword).
- **Usage:** Retrieve a previously generated summary for a keyword.

`^api/threats_watcher/summary/by-keyword/<keyword>/`
- **HTTP Method:** GET
- **Pagination:** No
- **Description:**
  - **GET:** Trigger generation (or regeneration) of an AI summary for the specified keyword and return the generated result.
- **Usage:** Request backend to generate a new threat intelligence summary.

`^api/threats_watcher/summary/regenerate-weekly/`
- **HTTP Method:** POST
- **Pagination:** No
- **Description:**
  - **POST:** Regenerates the weekly report, subject to the global cooldown. Returns `502` with the most recent report if the generation fails.
- **Usage:** Used by the **Regenerate** button of the weekly report. Manual regenerations never send notifications.

`^api/threats_watcher/summary/by-keyword/<keyword>/regenerate/`
- **HTTP Method:** POST
- **Pagination:** No
- **Description:**
  - **POST:** Regenerates the AI summary of the given keyword, subject to the global cooldown.
- **Usage:** Used by the **Regenerate** button of keyword summaries.

`^api/threats_watcher/summary/by-keyword/<keyword>/regenerate-breaking/`
- **HTTP Method:** POST
- **Pagination:** No
- **Description:**
  - **POST:** Regenerates the breaking news alert of the given keyword, subject to the global cooldown.
- **Usage:** Used by the **Regenerate** button of breaking news.

`^api/threats_watcher/summary/config/`
- **HTTP Method:** GET, POST
- **Pagination:** No
- **Description:**
  - **GET:** Returns the global regeneration cooldown (`regenerate_cooldown_minutes`). Available to any authenticated user.
  - **POST:** Updates the cooldown, between 1 and 1440 minutes. Superusers only.
- **Usage:** Used by the regeneration buttons and the admin setting of the profile page.

</details> <br>

<details>

<summary>Connectors</summary> <br>

`^api/connectors/<connector_id>/set-default-ai/`
- **HTTP Method:** POST
- **Pagination:** No
- **Description:**
  - **POST:** Sets (`{"is_default_llm": true}`) or unsets (`{"is_default_llm": false}`) the connector as the Default AI. Superusers only.
- **Usage:** Used by the **Use as the default AI** switch of the Connectors page.

</details> <br>

### Specific Details

To obtain detailed information about a specific item, such as an alert, a monitored site, or any other entity in the system, you can access its details by appending `/(?P<pk>[^/.]+)/$` to the end of the corresponding API URL.

For instance, let's say you want to retrieve information about an alert with the ID "1". You would construct the URL as follows: `http://0.0.0.0:9002/api/site_monitoring/alert/1`

By making a GET request to this URL using your web browser, CURL, or any HTTP client, you will receive comprehensive details about the alert with the ID "1".

Following this pattern, you can easily navigate and retrieve specific information for any item in the system, ensuring efficient use of the available API endpoints.


## TheHive Export

Watcher provides automatic integration with [TheHive](https://strangebee.com/thehive/) for streamlined case management and incident response across multiple modules:

### Automatic Export from All Modules
- **Threats Watcher**: Automatically exports trending cybersecurity threats and buzzwords.
- **Data Leak**: Automatically creates alerts when data leaks are detected via keywords.
- **Website Monitoring**: Automatically creates alerts in TheHive when site changes are detected.
- **DNS Threats Monitored**: Automatically exports twisted DNS findings and certificate transparency alerts.
- **CyberWatch**: Automatically pushes CVE alerts and ransomware victim matches (rule hits) as tagged observables.

### TheHive Integration Features

Watcher provides comprehensive TheHive integration with intelligent automation and the following capabilities:

- **Automatic Alert Creation**: When threats are detected, Watcher automatically creates alerts in TheHive without manual intervention, ensuring immediate incident response workflow initiation.

- **Smart Case Management**: For existing cases, Watcher intelligently updates alerts by adding new observables and comments rather than creating duplicate alerts, maintaining case consistency and reducing noise.

- **Observable Enrichment**: Watcher automatically populates alerts with relevant observables (domains, IPs, URLs) and contextual tags based on the detection source and type, providing analysts with enriched threat intelligence.

- **Custom Field Integration**: Watcher uses custom fields to maintain proper relationships between alerts and the originating Watcher instance, enabling seamless cross-platform tracking.

- **Ticket ID Correlation**: For website monitoring, Watcher correlates alerts with existing ticket IDs to group related incidents and maintain proper case lineage.

This automated TheHive integration ensures immediate threat visibility and accelerates incident response workflows by eliminating manual alert creation and maintaining proper case relationships.

### Troubleshooting
If the export does not work as expected, this may be related to the configuration of your TheHive instance.

Ensure that your TheHive API configuration is properly set up in the `.env` file and that the custom fields are correctly configured:

- Verify TheHive connectivity and API permissions.
- Check custom field configuration in your TheHive instance.


## MISP Export
You can export monitored domains to [MISP](https://www.misp-project.org/) from two different modules:

### From Website Monitoring
- Go to **/website_monitoring** page.
- Add new domains to monitored list.
- Click on the **cloud button** next to each domain.

### From DNS Threats Monitored
- Go to **/dns_finder** page.
- View detected DNS alerts.
- Click on the **cloud button** next to each DNS finding.

### MISP Export Features

Watcher provides comprehensive MISP integration with intelligent cloud button indicators and the following capabilities:

- **Smart Cloud Button Status**: The cloud button appearance changes based on the domain's MISP status:
  - **Blue cloud button**: Domain is not yet exported to MISP.
  - **Green cloud button**: Domain already exists in MISP and is linked to an event.

- **Automatic Object Creation**: When exporting to MISP for the first time, Watcher automatically creates MISP objects during the export process.

- **Attribute Updates**: For domains already present in MISP, Watcher does not automatically overwrite existing attributes but allows users to manually add new IOC's. The user must manually trigger the update to add new IOC's to MISP, and Watcher only appends them without removing or overwriting current data to maintain data consistency.

- **Manual UUID Support**: During export, you can manually specify an existing MISP Event UUID to link your data to a specific MISP event.

- **UUID Display**: If a domain is already linked to a MISP event, Watcher displays the existing UUID for reference in the export dialog.

This enhanced MISP integration ensures seamless threat intelligence sharing and maintains proper relationships between your monitored assets and MISP events.

### Troubleshooting
If the export do not work as expected, this may be related with 
the version of your MISP instance.

In fact, if you are using an outdated MISP instance, the client API version will not correspond with your MISP instance version:

- Update MISP.

## Remove & Add to Blocklist
There is a **blocklist** to prevent a **false positive trendy words** from reappearing again.

To add **1** word:

- Go to **Threats Watcher** (`/#/threats_watcher`) and authenticate.
- Click the word (in the cloud or the list), then **Ban** in its details: it is added to the blocklist and removed from the trends.

To add **several** words:

- **Threats Watcher** > **Banned words** tab > **Add** > **Banned words**, one per line.

Or from the **/admin** page:

- Go to **/admin** page.
- Click on **Trendy words**.
- **Check** words that you want to remove & blocklist.
- Click on **Action** dropdown.
- Select "**Delete & Blocklist selected trendy words**".

## Overview

The home page (`/#/`) gathers the best of every module. **Customise**, in the header, lets you choose the blocks you want to see; the choice follows your account.

- **This week**: a greeting and the new detections of the last 7 days in one figure, with the count of each module (click one to open it).
- **Intelligence brief**: the latest AI summary, the breaking news of the last 24 hours or else the weekly report.
- **Modules**: one card per module with its figures, what is new this week and a red dot when something needs a look. Click a card to open the module. A visitor who is not signed in sees the public modules only.
- **Latest detections** (signed in): the newest findings of every module in one list, newest first. The list scrolls.
- **Top vulnerabilities**: the CVEs with the highest score of the last 30 days.
- **Trending now**: the most mentioned words, with a dot for the reliability of their sources.
- The **setup guide** (signed in) lists the first steps of a new instance, until it is hidden.

The trending words as a word cloud or as a **graph of the words linked by their articles**, and the **world map** (ransomware victims by country, or where the RSS sources come from) are on the Threats Watcher page.

Navigation is the sidebar on the left: a rail of icons that opens on hover, and stays open with the pin.

## CyberWatch Module

CyberWatch is a standalone threat intelligence module that continuously fetches, correlates, and surfaces external threat data directly inside Watcher.

### CVE Monitoring

- Fetches CVEs from [cve.circl.lu](https://cve.circl.lu) on a 30-minute schedule.
- Stores CVE ID, severity, CVSS score, full description, and external references.
- **CVEs** tab: filter by severity (several at once, or "not scored yet"), publication date and whether a rule matched; each CVE opens with its description, references (NVD link) and the rules that matched it.
- **Exploited in the wild**: the CISA *Known Exploited Vulnerabilities* catalogue is read every day. A CVE listed there gets a red **Exploited** badge (**Exploited - ransomware** when ransomware groups are known to use it), with the date it was added and the date it should be fixed by, and can be filtered on. A notification tells when a CVE enters the catalogue.
- **EPSS**: the probability, given by [FIRST](https://www.first.org/epss/), that a CVE is exploited in the next 30 days, refreshed every day. It helps to sort what is not exploited yet but may be.
- **Advisories that are not CVEs**: the source also publishes advisories of its own (`OSV-`, `PYSEC-`, `GHSA-`, `DEBIAN-CVE-`). One that is about a CVE is kept under that CVE, so it is not counted twice; the others are kept under their own identifier.
- KEV and EPSS are two connectors (**Threat Intelligence** category), each with its **Test** button; leave their address empty to switch them off.

### Ransomware Intelligence

- Pulls ransomware group and victim data from [ransomware.live](https://ransomware.live) and [ransomlook.io](https://ransomlook.io).
- Stores victim name, ransomware group, country, sector, and attack date.
- **Ransomware** tab: filter by group, country, sector and date; a victim opens with its group (victims posted, latest post, description).

### Watch Rule Engine

Users can define keyword-based rules scoped to CVEs, ransomware victims, or both:

1. Navigate to `/#/cyber_watch`.
2. Click **New watch rule**.
3. Give it a name, choose what it watches (CVEs / ransomware victims / both), enter its keywords (one per line or separated by commas) and, if needed, exceptions. A preview shows what it would match in the data already collected.
4. Keep **Also record the matches in the CVEs and victims already collected** checked to start with them; new CVEs and victims are checked as they come in.
5. Matches land in the **Matches** tab, a triage inbox: open one to see why it matched, then archive it (the next one opens).

Notifications fire across all four channels (Email, Slack, Citadel, TheHive) for each rule hit.

## Monitored Pages

**Website Monitoring > Pages** follows the text of precise web pages, such as the blog of a researcher that has no RSS feed. It does not replace the monitoring of suspicious domains: it works on its own list.

For each page you give the address, a name, the share of the text that has to change for a notification (5 % by default), how often to look (15 minutes to a week, hourly by default), an optional CSS selector (only that part of the page is compared) and optional regular expressions of text to ignore.

- Watcher extracts the text of the page and leaves out scripts, menus, footers, forms, hidden elements, **dates, hours and counters** ("3 hours ago", "1,204 views"), so that what changes by itself does not count.
- The first check keeps a first version and notifies nothing. Each later check that finds a different text keeps a new **version** (50 by default, the oldest are deleted); a change at least as big as the threshold is notified.
- A page opens in a drawer with its versions and a **diff** between any two of them (added lines in green, removed lines in red). *Check now* runs a check at once.
- Only public `http(s)` addresses are visited: private, loopback and link-local addresses are refused, and so is a redirect that leads to one.

The notification **Monitored page change** goes to Slack, Citadel and e-mail (the Website Monitoring subscribers who ticked *E-mail*) and shows a few shortened lines of the change. It is **off until a superuser switches it on** in **Connectors > Notifications**.

## Screenshots

Watcher can keep screenshots of web pages, taken by a headless browser that runs in its own container (`screenshotter`). That browser executes the code of the pages it visits, so it is isolated: its own network, shared with Watcher only (no database, no other service), a read-only filesystem, no capability, limited memory, and it refuses anything that is not a public `http(s)` address, including each image, script and redirect a page asks for.

- **Monitored pages**: a screenshot is kept with every new version, so that a change can be compared **before / after** next to the text diff (*Text / Screenshots* in the drawer). A page can be left out in its form, and *Screenshot* takes one at once.
- **Data leaks** and **legitimate domains**: a *Take a screenshot* button in the drawer (it needs the right to change the object). A leaked page is often deleted afterwards: the screenshot keeps what it looked like. Every capture is written in the application log with who asked for it, because it is a visit from Watcher.
- Up to `SCREENSHOT_KEEP` (10) screenshots are kept per object. Some sites answer a robot with a "confirm you are human" page: Watcher does not try to get around it, and the screenshot then shows that page.

The browser leaves from the address of the server, with an ordinary Chrome user agent. To make it leave through a dedicated proxy, set `SCREENSHOT_PROXY`. `SCREENSHOT_SERVICE_URL` points Watcher to the service; set it to an empty value to switch the screenshots off. The service is in the root `docker-compose.yml`, in the `deployment/` stack (with its own network, shared with Watcher only) and in the Helm chart (off by default: build and push the image from `screenshotter/`, then set `screenshotter.enabled`; a network policy only lets Watcher in and keeps the browser away from private addresses).

## UDRP Tracking

Automated UDRP (Uniform Domain-Name Dispute-Resolution Policy) case monitoring integrated into Site Monitoring.

- Two new fields on monitored sites: `udrp_status` (`pending` / `won` / `lost` / `unknown`) and `udrp_last_checked`.
- A scheduled job queries the WIPO UDRP database every 6 hours for every site where `legal_team = True`.
- When a case is **won**, the domain is automatically transferred to Legitimate Domains.
- Notifications fire on all four channels (TheHive, Slack, Citadel, Email) when a decision is detected or changes.

## User Profile Page

A dedicated `/profile` route provides a centralised settings and preferences hub.

### Overview
- Displays user avatar, username, email, role badges (Superuser, Staff, groups), and group permissions.
- **Appearance**: avatar colour, and light or dark mode (also in the sidebar).
- **Change password** in the page header; sign out from the bottom of the sidebar.

### My activity
- Everything you changed in Watcher, with the same filters as the Activity page.

### Interface & AI Preferences
- **Text size** (Appearance > Display): Very small (15 % smaller, for laptop screens), Small, Normal or Large. It is the only size setting; it is saved in your profile and applied on every page.
- **Typewriter Effect**: Displays AI summaries with a progressive typing animation. Turn it off to display them instantly.
- **AI Summary Regeneration Cooldown** (superusers only): A slider to set the waiting time required between two regenerations, from 1 minute to 24 hours. This setting applies to all users (see [Regenerate a Summary](#regenerate-a-summary)).

## Connectors

A dedicated `/connectors` page (**superuser only**) centralises configuration and health-check testing for every external integration Watcher can talk to: SMTP, Slack, Citadel, TheHive, MISP, LDAP, SSO/OIDC, CertStream, SearxNG, the CyberWatch feeds (CVE, Ransomware.live, RansomLook), WIPO UDRP, the LLM providers (OpenAI, Anthropic, Gemini, Ollama, Generic LLM Provider), and the primary MySQL database.

### How it works

- **At startup**, a connector's fields are seeded from the corresponding `.env` / `settings.py` variables described in [Static configuration](#static-configuration) the first time they're read - nothing changes for existing deployments, and a connector that's already configured via environment variables needs no action here.
- **Editing a value** from the dashboard (click **Edit** on a connector's card) stores an override in the database, which takes effect immediately across the whole app - not just this page's own **Test** button. SMTP, Slack, Citadel, TheHive, MISP, CertStream, SearxNG, and the CyberWatch feeds all read their live configuration through this same override system, so changing a value here changes real app behaviour immediately, with no restart required.
- **Once a field has been saved here - even cleared to empty - it stops following `.env`/`settings.py`, for good.** Clearing a field is a deliberate "leave this blank" action, not a way to fall back to the environment default. Each field shows a **"From .env"** or **"Manually set"** badge so you always know which state it's in, and a **reset button** appears on manually-set fields to drop the override and resume following `.env`/`settings.py` live.
- **The base URL of the OpenAI, Anthropic and Gemini connectors** shows the official API URL known by LiteLLM, with a **"LiteLLM default"** badge, when neither the dashboard nor `.env` sets one. Resetting the field brings back the `.env` value, or this default URL.
- **Sensitive fields** (passwords, tokens, API keys) are encrypted at rest with Fernet and shown masked by default. Click the eye icon to decrypt and reveal the stored value, or the crossed-out eye to hide it again.
- **Test** runs a real connectivity check (an SMTP handshake, an authenticated API call...) using the values currently saved for that connector, and reports success or failure directly on its card.
- **Two independent statuses** are shown per connector: **Configured** / **Incomplete** / **Disabled** reflects whether the required fields are filled in, while **Healthy** / **Unhealthy** / **Not tested yet** reflects the outcome of the last connectivity test. A connector can be fully configured and still unhealthy if the external service itself is unreachable.
- **A scheduled job tests every connector automatically every Monday at 06:00.** A Pending Action alert is only queued for connectors marked **Configured** that fail - a connector nobody has set up yet is still tested (to keep its health badge current) but doesn't raise noise. Repeated failures for the same connector don't create duplicate alerts - the existing pending one has to be resolved first. Manually clicking **Test** never creates an alert; only the scheduled run does.
- Each connector shows its **plugin version** (e.g. `v1.0.0`) next to its category in the **Edit** window - a static, manually-maintained value for the connector definition itself, unrelated to the version of the external service it talks to.
- **MySQL, LDAP, and OIDC/SSO are read-only/informational**: their configuration always comes from `settings.py` and can't be changed from this page. For LDAP and OIDC this isn't a UI limitation - Django builds its authentication backends from `settings.py` once, at process startup, so an override wouldn't take effect without a restart anyway.

### Dashboard

- KPI cards summarise how many connectors are **Configured**, **Incomplete**, or **Disabled**, based on which of their required fields are currently filled.
- Search and filter connectors by name, category, configuration status, or health status.
- Connectors are grouped by category by default (Notifications, Threat Intelligence, Authentication, Database...). Toggle **Group by category** off to display a flat list instead.

### AI Connectors & Default AI

- Each LLM connector (OpenAI, Anthropic, Gemini, Ollama, Generic LLM Provider) has a **Use as the default AI** switch. The selected connector shows a **Default** badge and is used by every AI feature of Watcher.
- Only one connector can be the Default AI at a time: selecting a new one replaces the previous choice.
- **A Default AI must be selected** for the summaries to use your provider. Without one, Watcher uses the local Hugging Face model, even if a provider is configured.
- If the Default AI fails (service unreachable, invalid key...), Watcher falls back to the local Hugging Face model defined in [LLM Settings](#llm-settings).


### Notifications Tab

The **Notifications** tab lists every notification Watcher can send, by module, with one pill per channel (Slack, Citadel, TheHive, Email).

- A **green pill (On)** sends that notification on that channel for the whole instance; an outlined **Off** pill does not. Click a pill to switch it.
- An **orange pill** is on but cannot deliver: the connector of that channel is not configured or failed its last test (hover it for the reason). The dot in each column header gives the state of the channel: green connected, orange not configured, red last test failed.
- Each module heading says how many of its notifications are sent somewhere (`3/5 active`) and folds away with a click (**Collapse all** / **Expand all** for the whole list).
- **Search a notification** and **Active only** narrow the list; both are kept in the address.
- Click the name of a notification to choose what its message says and to see a preview.
- **Send a test to Slack / Citadel** (in the same panel) posts the saved message with fictional data, marked **[TEST]**, and notes it in the Deliveries tab of the connector.
- **Many alerts at once**: when a job run produces **4 or more** alerts of the same notification (suspicious domains, website changes, CVE or victim rule hits, new CVEs or victims), Slack and Citadel get **one message that lists them** (10 lines, then `... and N more`) instead of one each. Set `NOTIFICATION_DIGEST_THRESHOLD` in the `.env` file to change the number (`0` never groups). TheHive and the e-mail are not grouped.

### Connector Panel and Deliveries

Click a connector to open its panel on the right. Its address (`connector=` and `ctab=`) is kept in the URL.

- **Overview**: what the connector is, what it reads or sends, its status and its health.
- **Configuration**: its fields. A field that still holds the default of the library says so, and shows an example while it is empty.
- **Deliveries** (superusers): the last 100 things the connector did, newest first: a **Test**, the **Weekly check**, a **Notification** (sent or refused, with the reason) or an **AI call** (model, duration, error). Filter by kind. Older lines are dropped as new ones come in. The same list is available at `GET /api/connectors/<id>/deliveries/?kind=`.

### Scheduled Jobs

The **Scheduled jobs** tab (superusers) lists every job of Watcher: when it last ran, how long it took (and the trend of its last passes), what it counted, whether it failed or overran its cycle, whether it runs now and when it runs next. The last 50 passes of each job are kept.

## AI-Powered Threat Intelligence

Watcher uses **Large Language Models (LLMs)** to turn trending cybersecurity topics into actionable threat intelligence: breaking news alerts, keyword summaries and a weekly threat report.

### LLM Gateway

All AI features go through a multi-LLM gateway built on [LiteLLM](https://github.com/BerriAI/litellm):

- **Supported providers**: OpenAI, Anthropic, Gemini, Ollama, and any other endpoint supported by LiteLLM (Generic LLM Provider)
- **Default AI**: Choose the provider used by Watcher from the [Connectors](#ai-connectors--default-ai) page
- **Automatic fallback**: If no Default AI is selected, the API is unreachable or no API key is configured, Watcher falls back to a local Hugging Face model, so summaries keep working offline

See [LLM Settings](#llm-settings) for the configuration. The model used is displayed under each summary, along with its generation date.

### Breaking News Detection

Watcher automatically detects rapidly trending cybersecurity keywords:

1. **Threshold-Based Alerts**: When a keyword appears ≥ `BREAKING_NEWS_THRESHOLD` times (default: 15), a breaking news alert is created
2. **Real-Time Notifications**: Floating messages with a bar that empties while they stay, then auto-dismiss
3. **Structured AI Summary**: Impact level, targeted sectors, threat actors, malware families and CVEs, with an alert score

**Configure in `.env`**:
```bash
BREAKING_NEWS_THRESHOLD=15  # Adjust sensitivity (lower = more alerts)
```

### Keyword Summaries

Clicking a trending word displays an AI summary of the related articles, with:

- **Extracted entities**: CVE identifiers, APT groups, malware families, MITRE ATT&CK techniques, targeted sectors and countries
- **Relevance score**: How relevant the topic is for your organization

### Weekly Threat Intelligence Reports

Automated weekly report of the top trending threats:

1. **Scheduled Generation**: Runs every `WEEKLY_SUMMARY_DAY` at `WEEKLY_SUMMARY_HOUR` (default: Thursday at 09:30)
2. **Threat Clustering**: The week's topics are grouped into at most 5 clusters, most severe first, each with a severity level and its first publication date
3. **Executive Summary**: A short overview of the week's threat landscape
4. **Display**: Clusters are open by default; use **Collapse All** / **Expand All** to toggle them. Your choice is remembered in your browser
5. **Sources**: each cluster ends with the sites it is based on, one link per site. The card of the report shows their icons, stacked, and each one opens an article

> CVEs and threat actors are only shown when they are explicitly cited in the source articles: a week whose news names no CVE identifier shows no CVE.

**Configure in `.env`**:
```bash
WEEKLY_SUMMARY_DAY=Thursday
WEEKLY_SUMMARY_HOUR=09:30
```

### Regenerate a Summary

The weekly report, breaking news and keyword summaries can be regenerated on demand with the **Regenerate** button:

- **Global cooldown**: To avoid repeated requests to the LLM, a cooldown shared by all users applies after each generation (default: 15 minutes). While the button is disabled, its tooltip shows the remaining time
- **Admin setting**: Superusers can adjust the cooldown from their [profile page](#interface--ai-preferences), from 1 minute to 24 hours
- **No notifications**: Manual regenerations only update the summary in Watcher and never send notifications
- **Safe failure**: If a regeneration fails, the current summary is kept and an error message is displayed

### Read a Summary

- A breaking news is shown for the **24 hours** that follow its generation, on the **Overview** and in **Threats Watcher**; then only the weekly report is left
- On the **Overview** and in **Threats Watcher**, the weekly report and the breaking news have the same card: the beginning of the text, the badges of the keywords (and **+N** for the others), when it was written and by which model (with the logo of its connector). **Read more** opens the whole text in a panel that scrolls; its address (`?read=weekly` or `?read=breaking`) can be shared.
- A visitor who is not signed in reads the summaries but sees no **Regenerate** button, and the server refuses to write one for them.
- **Writing is shown to everyone and survives a refresh**: while a summary is being written, the arrow of the button turns and its label is **Writing…**, for every user and even after the page is reloaded.
- Each regeneration adds a summary; the old ones are removed after `SUMMARY_RETENTION_DAYS` days (see [Data Retention](#data-retention)), the latest one of each kind never.

### Named Entity Recognition (NER)

Entity extraction is performed by the LLM as part of each summary. When no LLM is available, a local BERT-based model (`dslim/bert-base-NER`) is used as a fallback:

- **Extracted Entities**:
  - Persons (PER)
  - Organizations (ORG)
  - Locations (LOC)
  - Miscellaneous (MISC): Products, malware, tools

## User Interface Customization

### Themes

Watcher offers **13 themes**, kept on your account and applied on every page. Open **User Profile > Appearance**:

- **Light**: Light, Paper, Sunrise, Clay Light.
- **Dark**: Darkly (the default), Clay, Graphite, Midnight, Slate, High contrast, Cyber, The One, Metal.

The picker can be filtered by mode (light or dark) or by kind: standard, glass effects, high contrast, ambience. A badge says what sets a theme apart. Clay and Clay Light are glass panels over a backdrop; **Background effects** sets how much of it is shown (Full, Calm or Off).

### Display

**User Profile > Appearance > Display** sets, whatever the theme: the **row density** (comfortable or compact), the **text size** (see [Interface & AI Preferences](#interface--ai-preferences)), **reduce animations** and **chart colours** that are safe for colour blindness. A button puts the theme, the effects and the display back to the defaults.

### Filters, Sorting and Selection

Every list follows the same rules:

1. **Filters, sort, page and the open object are kept in the address**: copy the link to send exactly what you see.
2. **The sort is done by the server**, on all the pages of the list, not only on the rows shown.
3. A row opens in a **panel on the right**, docked beside the list on a wide screen.
4. **Select** several rows to act on all of them; anything destructive asks for a confirmation first.

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

Verify that your local `/docker-compose.yml`, `/Searx/` and `/screenshotter/` are **up-to-date**. Keep your own `/.env`: never replace it with `.env.example`, and add by hand the variables that are new in `.env.example` (each one has a default).

> **Note:** Watcher uses the official image from **GitHub Container Registry (GHCR)**: `ghcr.io/thalesgroup-cert/watcher:latest`

Read the notes of the release on the [GitHub releases page](https://github.com/thalesgroup-cert/Watcher/releases) first: they list the migrations, the new variables and the breaking changes.

## Update Process

To update Watcher image please follow the instructions below:

- Stop all containers:

  ```bash
    docker compose down
  ```
- Remove the old docker images:

  ```bash
    docker rmi ghcr.io/thalesgroup-cert/watcher:latest
    docker rmi mysql:8.0.40
    docker rmi searxng/searxng:latest
    docker rmi 0rickyy0/certstream-server-go:v1.8.2
  ```
- Pull the newer docker images:

 ```bash
    docker compose pull
  ```
- Start the containers:

  ```bash
    docker compose up -d
  ```

This will update the Watcher project.

## Migrate & Populate the database (mandatory)

Updates the state of the database in accordance with all current models and migrations. Populate your database with hundred of banned words and RSS sources related to Cyber Security.

    docker compose down
    docker compose run watcher bash
    python manage.py migrate
    python manage.py populate_db

## Managing Breaking Changes (optional)

If the release includes breaking changes, additional steps may be required. Here are the general steps to manage breaking changes:

1. **Review release notes or documentation**: Check the release notes or documentation for any information about breaking changes and specific instructions on how to handle them.

2. **Backup data**: Before proceeding with the update, it's advisable to backup any critical data to prevent loss in case of unexpected issues.

3. **Test in a staging environment**: If possible, test the update in a staging environment to identify any potential issues or conflicts with existing configurations or customizations.

4. **Update configurations**: Review and update any configurations or settings that may be affected by the breaking changes.

5. **Modify custom code**: If you have any custom code or scripts that rely on the previous version's functionality, you may need to modify them to work with the new version.

6. **Run additional migration scripts**: If provided, run any additional migration scripts or commands provided by the developers to handle specific breaking changes.

Always refer to the specific instructions provided with the update.

# Developers
If you want to modify the project and Pull Request (PR) your work, you will need to setup your development environment.

## Open a Pull Request (PR) to contribute to this project
- Fork the official Watcher repository
- Install <a href="https://git-scm.com/install/linux" target="_blank" rel="noopener noreferrer">Git</a>
- Open a terminal: 

  ```bash
    git clone <your_forked_repository.git>
  ```
- Switch to the dev branch:
  
  ```bash
    git checkout -b feature/<name_of_the_new_feature>
  ```
- Make your changes on the working files and then:
  
  ```bash
    git add *
  ``` 
- Add a commit message and description: 

  ```bash
    git commit -m "Title" -m "Description"
  ```
- Publish the changes:

  ```bash
    git push origin feature/<name_of_the_new_feature>
  ```
- Back to GitHub on your forked repository, click Under Contribute > Open Pull Request and then Confirm the operation
- Done! Your work will be reviewed by the team! 

## Setup Watcher environment
Use a Linux server, we recommend the use of a Virtual Machine (Ubuntu 20.04 and Ubuntu 21.10 LTS in our case).

Then, follow the steps below:

- **Update and upgrade your machine:** 
  
  ```bash
  sudo apt update && sudo apt upgrade -y
  ```
- **Install Python and Node.js:**

  ```bash
  sudo apt install python3 python3-pip -y 
  sudo apt install nodejs -y
  ```
  Watcher is built with **Node.js 22** (the version of the Docker image): install it from NodeSource or nvm if your distribution ships an older one.
- **Create and activate a Python virtual environment:**

  ```bash
  python3 -m venv .venv |source .venv/bin/activate
  ```
- **Pull Watcher code:**

  ```bash
  git clone <your_forked_repository.git>
  ```
- **Move to the following directory:**
  
  ```bash
  cd Watcher/Watcher
  ```
- **Install** `python-ldap` **dependencies:**

  ```bash
  sudo apt install -y libsasl2-dev python-dev-is-python3 libldap2-dev libssl-dev
  ```
- **Install** `mysqlclient` **dependency:**

  ```bash
  sudo apt install default-libmysqlclient-dev
  ```
- **Install Rust (for tokenizers, etc)**

  ```bash
  curl https://sh.rustup.rs -sSf | sh -s -- -y |source $HOME/.cargo/env 
  ```
- **Install Python dependencies:**

  ```bash
  pip3 install -r requirements.txt
  ```
- **Install Torch and Torchvision dependencies:**

  ```bash
  pip install --extra-index-url https://download.pytorch.org/whl/cpu torch==2.13.0 torchvision==0.28.0 torchaudio==2.11.0
  ```
- **Install NLTK/punkt dependency:** 
  
  ```bash
    python3 ./nltk_dependencies.py
  ```
    
    - If you have a proxy, you can configure it in `nltk_dependencies.py` script.
- **Install Node.js dependencies:**
    ```bash   
    sudo apt install npm -y
    npm install
    ```
- **Install MySQL:**

  ```bash
  sudo apt install mysql-server -y
  sudo mysql_secure_installation
  ```
  - Enter root password.
  - You may now enter `Y` and `ENTER`. Accept all fields. This will remove some anonymous users and the test database,  
    disable remote root logins, and load these new rules so that MySQL immediately respects any changes made.

**Create & Configure Watcher database:**
  ```sql
    sudo mysql 
    CREATE USER 'watcher'@'localhost' IDENTIFIED BY 'Ee5kZm4fWWAmE9hs!';
    GRANT ALL PRIVILEGES ON *.* TO 'watcher'@'localhost' WITH GRANT OPTION;
    CREATE DATABASE db_watcher;
    use db_watcher;
    exit
  ```

  ```bash
  systemctl status mysql.service
  ```

```bash
  cd Watcher/Watcher
  ```

In `settings.py` change `HOST` variable to `localhost`:

  ```python
    DATABASES = {
      'default': {
        'ENGINE': 'django.db.backends.mysql',
        'CONN_MAX_AGE': 3600,
        'NAME': 'db_watcher',
        'USER': 'watcher',
        'PASSWORD': 'Ee5kZm4fWWAmE9hs!',
        'HOST': 'localhost',
        'PORT': '3306',
        'OPTIONS': {
          'init_command': "SET sql_mode='STRICT_TRANS_TABLES'",
        },
      }
    }
  ```

- <span style="color:red">**[IMPORTANT]** When **commit** put `HOST` variable back to `db_watcher`</span>
 ```bash
    cd ..
  ```
- **[Migrate](#migrate) the database:** 
  
  ```bash
  python3 manage.py migrate
  ```
- **Run Watcher:**

  ```bash
  python3 manage.py runserver
  ```

## Deploy a simple SMTP server to test the email notifications
If you are working on a test environment and willing to have email alerts, here is a simple way to configure the SMTP settings to make it work.
- Grab the docker-compose file: [here](https://github.com/rnwood/smtp4dev/blob/master/docker-compose.yml).
- Run the command: `docker compose up`
- The mails will be available here by default: `localhost:5000`
- Modify the mail settings in the environment variables: `vi /.env`
    - `SMTP_SERVER=localhost`
    - `EMAIL_FROM=from@from.com`
- Launch Watcher: `python Watcher/Watcher/manage.py runserver` 

## Unit Testing

Watcher includes comprehensive unit tests to ensure code quality and reliability. **When contributing new features, you must include corresponding unit tests.**

### Test Coverage & Technologies

The test suite covers all 6 main modules of Watcher:

- **Back-End Tests**: Python's standard unittest module
  - `common/tests.py`
  - `watcher/tests.py`
  - Module-specific test files for each component

- **Front-End Tests**:
  - Cypress specs for every page (`cypress/e2e/`), with the API mocked

### Automated CI/CD Testing

All tests are **automatically executed** in our CI/CD pipeline using **GitHub Actions**:

- **Triggered on**: Push, Pull Requests, and manual workflow dispatch
- **Execution**: Both back-end and front-end tests run automatically
- **Coverage**: Full test suite validation before code integration

The CI/CD workflow ensures that:
- No broken code reaches the main branch
- All new features are properly tested

You can view the workflow file at `.github/workflows/docker-image-latest.yml` and monitor test results in the **Actions** tab of the GitHub repository.


### The commands

**IMPORTANT**: All test commands must be executed from the `Watcher/Watcher` directory:

```bash
cd Watcher/Watcher
```

#### Back-End Tests
To run all Django unit tests:

```bash
python manage.py test
```

To run tests for a specific module:

```bash
python manage.py test <module_name>
```

To run with verbose output:

```bash
python manage.py test --verbosity=2
```

#### Front-End Tests

The Cypress specs are **fully mocked**: they only need Watcher to answer on `baseUrl` (set in `cypress.config.js`, or pass `--config baseUrl=http://localhost:9002`), they read nothing from your database and need no account. The account they sign in with is not a secret: it is `expose.testCredentials` of `cypress.config.js`, read in the specs with `Cypress.expose()` (`Cypress.env()` is deprecated, and `allowCypressEnv` is `false`).

To run with an interactive Cypress Test Runner:

```bash
npm run cypress:open
```

To run in headless mode (CI/CD):

```bash
npm run test:e2e
```

### Development Guidelines

Here is the file structure of the test files in Watcher:
```
Watcher/
├── common/
│   └── tests.py
├── watcher/
│   └── tests.py
├── [module_name]/
│   └── tests.py
└── cypress/
    ├── e2e/
    └── support/
```

- **For new modules**, create a `tests.py` file following Django's testing conventions.
- **For frontend features**, add Cypress tests in the appropriate `cypress/e2e/` directory.

**When developing new features**, ensure your tests cover:
- Happy path scenarios
- Edge cases
- Error handling
- Input validation

<span style="color:red">**[IMPORTANT]** All Pull Requests must include tests for new functionality. PRs without adequate test coverage may be rejected.</span>

## Modify the frontend
If you need to modify the frontend `/Watcher/Watcher/frontend`:

From `/Watcher/Watcher/`, run the command below:

    npm run dev

Let this command run in background.
Now, when modifying the frontend (React 19 + TypeScript + MUI, in `/Watcher/Watcher/frontend/src`), Vite rebuilds it into one file (`/Watcher/Watcher/frontend/static/frontend/main.js`, with `main.css`) that Django serves.

The code is organised by page: `features/<module>/` holds the API calls, the TanStack Query hooks and the components of one page (`features/overview` is the home page), `ui/` the shared building blocks (page header, tables, inspector, world map, charts) and `layouts/AppShell.tsx` the sidebar.

<span style="color:red">**[IMPORTANT]** When **commit** you have to run **1 time** the commands below (type check + production build, then lint):</span>

    npm run build
    npm run lint

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

### Change a model (adding a field, deleting a model...)
When you are **making a change to a model**, for instance, adding a new field to: **/Watcher/Watcher/data_leak/models.py**
Then, you need to create a new migration based on the changes you have made:
- Go to **/Watcher/Watcher/** and run this command: `python3 manage.py makemigrations`

<span style="color:red"> **[IMPORTANT]** Run the `makemigrations` command **only once**</span>, when you have made **all the changes**. 
Otherwise, it will create **several unnecessary migration files**.

## Build the documentation

The documentation site is built from this `README.md` (cut into pages), and from the docstrings of the code (the **Code reference**), with [Zensical](https://zensical.org), which reads the MkDocs configuration. Nothing of it is written twice: change the text here, or a docstring in the code, and the site follows.

- To change a page of the guide, edit this file. Keep a **blank line before a list** and **four spaces** to nest one.
- The pages of the code reference and the home page are written by `docs/build_pages.py` (the `MODULES` list holds one line per module). Write docstrings in the `:param x:` / `:return:` style.
- The menu is made by `docs/build_pages.py` from `docs/mkdocs.template.yml`.

To see the site while you write:

    pip install $(grep -iE '^(zensical|mkdocstrings-python|pymdown-extensions)==' requirements.txt)
    cd docs
    python build_pages.py
    zensical serve

It opens on http://localhost:8000. The site is built and published to GitHub Pages by the `github-pages` workflow at each push on `master` that touches the documentation, the README or the code: there is nothing to commit but the sources.
