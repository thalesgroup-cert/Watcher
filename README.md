<p align="center">
    <img alt="Watcher Logo" src="/Watcher/static/watcher-logo-resize.png" height="270" width="270">
</p>

<p align="center">
    <strong>AI-Powered Automated Cybersecurity Threat Detection Platform</strong>
</p>

<p align="center">
    <a href="https://thalesgroup-cert.github.io/Watcher/README.html">
        <img src="https://img.shields.io/badge/Install-Guide-informational?style=for-the-badge&logo=docker" alt="Install">
    </a>
    <a href="https://thalesgroup-cert.github.io/Watcher/">
        <img src="https://img.shields.io/badge/Documentation-Read-informational?style=for-the-badge&logo=readthedocs" alt="Documentation">
    </a>
    <a href="https://github.com/thalesgroup-cert/Watcher">
        <img src="https://img.shields.io/github/stars/thalesgroup-cert/Watcher?style=for-the-badge&logo=github" alt="Stars">
    </a>
    <a href="https://github.com/thalesgroup-cert/Watcher/issues?q=is%3Aissue+is%3Aclosed">
        <img src="https://img.shields.io/github/issues-closed-raw/thalesgroup-cert/Watcher?style=for-the-badge&logo=github" alt="Closed Issues">
    </a>
    <a href="./LICENSE">
        <img src="https://img.shields.io/github/license/thalesgroup-cert/Watcher?style=for-the-badge&logo=opensourceinitiative&logoColor=white" alt="License">
    </a>
    <a href="https://hub.docker.com/r/felix83000/watcher/tags">
        <img src="https://img.shields.io/docker/pulls/felix83000/watcher?style=for-the-badge&logo=docker" alt="Docker Pulls">
    </a>
</p>

<p align="center">
    <a href="https://trendshift.io/repositories/15680?utm_source=repository-badge&utm_medium=badge&utm_campaign=badge-repository-15680" target="_blank" rel="noopener noreferrer">
        <img src="https://trendshift.io/api/badge/repositories/15680" alt="thalesgroup-cert/Watcher | Trendshift" width="250" height="55"/>
    </a>
    <a href="https://trendshift.io/repositories/15680?utm_source=trendshift-badge&utm_medium=badge&utm_campaign=badge-trendshift-15680" target="_blank" rel="noopener noreferrer">
        <img src="https://trendshift.io/api/badge/trendshift/repositories/15680/daily?language=JavaScript" alt="thalesgroup-cert/Watcher | Trendshift" width="250" height="55"/>
    </a>
</p>

Watcher is a Django & React JS platform designed to discover and monitor emerging cybersecurity threats with **AI-powered threat intelligence analysis**. It can be deployed on webservers or quickly run via Docker.

## Watcher Capabilities

Watcher empowers your security operations with comprehensive threat detection and monitoring:

- **AI-Driven Threat Intelligence** - Transform raw threat data into actionable intelligence with the LLM of your choice (OpenAI, Anthropic, Gemini, Ollama or any OpenAI-compatible endpoint), with an automatic fallback to a local model. Get a weekly report clustering the top threats by severity, real-time breaking news alerts with impact level, targeted sectors, threat actors and CVEs, and on-demand summaries for any security keyword. Any summary can be regenerated on demand.

- **CVE & Ransomware Intelligence** - Continuously fetch, correlate, and surface external threat data: CVEs from [cve.circl.lu](https://cve.circl.lu), ransomware victims and groups from [ransomware.live](https://ransomware.live) and [ransomlook.io](https://ransomlook.io). Define keyword-based Watch Rules to get alerted when specific threats match your organisation's context.

- **Emerging Threat Detection** - Monitor cybersecurity trends via RSS feeds from CERT-FR (www.cert.ssi.gouv.fr), CERT-EU (www.cert.europa.eu), US-CERT (www.us-cert.gov), Australian Cyber Security Centre (www.cyber.gov.au), and more. Track new vulnerabilities, malware campaigns, and threat advisories as they appear.

- **Legitimate Domain Management** - Centralized approved domains with expiry, repurchase status, registrar info, and contacts. Easily convert monitored malicious domains into legitimate ones. Automated UDRP case tracking.

- **Information Leak Monitoring** - Detect sensitive data exposure across the webs including Pastebin, StackOverflow, GitHub, GitLab, Bitbucket, APKMirror, npm registries, and other platforms. Catch leaked credentials, API keys, and confidential information early.

- **Malicious Domain Surveillance** - Monitor malicious domains for changes in IP addresses, mail/MX records, and web content. Use [TLSH](https://github.com/trendmicro/tlsh) fuzzy hashing to detect modifications. Automatic RDAP/WHOIS checks with registrar and expiry alerts.

- **Suspicious Domain Detection** - Identify potentially malicious domains targeting your organisation via:
  - **Domain Generation Algorithm Detection** using [dnstwist](https://github.com/elceef/dnstwist) to find typosquatting, homograph attacks, and similar domain variants
  - **Certificate Transparency Monitoring** via [certstream](https://github.com/CaliDog/certstream-python) to catch newly registered suspicious domains in real-time

## Additional Features

Extend Watcher's capabilities with powerful integrations and management tools:

- **TheHive Full Synchronization** - Integration with [TheHive](https://thehive-project.org/) featuring automated alert creation, smart case management, IOC enrichment, and ready-to-use Cortex Analyzers & Responders. Detailed configuration are provided in the documentation [here.](https://thalesgroup-cert.github.io/Watcher/README.html#thehive-export)
- **MISP Integration** - Seamlessly export Indicators of Compromise (IOCs) to [MISP](https://www.misp-project.org/) with smart UUID tracking, automatic object creation, and manual attribute updates for collaborative threat intelligence sharing
- **SSO / OpenID Connect** - Federated login via any OIDC provider (Keycloak, Azure AD, etc.) with PKCE and Knox token issuance. Configurable per-instance via `.env`
- **Bulk Add & Bulk Actions** - Add many items at once with the *One item per line* toggle (with a no-write Preview and a per-item created / skipped / error summary), or tick rows in any table to edit, delete or export them (to Legitimate Domains or MISP) in one go
- **Flexible Authentication** - Support for LDAP, local, and SSO/OIDC authentication systems
- **Connectors Dashboard** - A superuser-only `/connectors` page to view, edit, and test every external integration (SMTP, Slack, Citadel, TheHive, MISP, CyberWatch feeds, LLM providers, and more) from one place, with encrypted credential storage, per-connector health checks, and a one-click **Default LLM** selection.
- **Smart Notifications** - Receive email, Slack, or Citadel alerts for critical findings and threshold violations across all modules including CyberWatch and UDRP decisions, with dedicated layouts for the weekly report and breaking news
- **Interactive API Documentation** - Auto-generated Swagger UI at `/api/docs/` and OpenAPI 3 schema at `/api/schema/` powered by drf-spectacular
- **Ticketing System Integration** - Automatically feed your ticketing system with security findings
- **Comprehensive Admin Interface** - Manage all aspects of Watcher through Django's powerful admin panel
- **Advanced Access Control** - Granular user permissions and group management for team collaboration
- **Modern UI Experience** - A modern interface with customizable themes, resizable dashboard panels, advanced filtering with saved filter sets, an adjustable interface zoom, an optional typewriter effect for AI summaries, and persistent user preferences

## Involved dependencies

Watcher leverages open source tools and libraries:
- [**LiteLLM**](https://github.com/BerriAI/litellm) - Unified gateway to the LLM providers powering threat intelligence summaries and entity extraction
- [**Hugging Face Transformers**](https://huggingface.co/docs/transformers) - Local models used as a fallback when no LLM provider is available
- [**dslim/bert-base-NER**](https://huggingface.co/dslim/bert-base-NER) - Local Named Entity Recognition fallback for automatic IOC extraction
- [**certstream**](https://github.com/CaliDog/certstream-python) - Certificate Transparency monitoring
- [**dnstwist**](https://github.com/elceef/dnstwist) - Domain name permutation engine
- [**SearxNG**](https://github.com/searxng/searxng) - Privacy-respecting metasearch engine
- [**PyMISP**](https://github.com/MISP/PyMISP) - MISP threat intelligence platform integration
- [**TLSH**](https://github.com/trendmicro/tlsh) - Fuzzy hashing for content similarity detection
- [**mozilla-django-oidc**](https://github.com/mozilla/mozilla-django-oidc) - OpenID Connect authentication backend
- [**drf-spectacular**](https://github.com/tfranzel/drf-spectacular) - OpenAPI 3 schema generation and Swagger UI
- [**deck.gl**](https://deck.gl/) - WebGL-powered geospatial visualization (WorldMap)
- [**MUI (Material UI)**](https://mui.com/) - React component library for KPI cards and charts
- [**shadow-useragent**](https://github.com/lobstrio/shadow-useragent) - User-Agent rotation library
- [**NLTK**](https://www.nltk.org/) - Natural Language Toolkit for text processing

## App Preview

All the screenshots below use fictional data (a made-up company, "Altair Dynamics").

### Overview
<p align="center">
    <img alt="Watcher overview" src="/Watcher/static/watcher-overview.gif" width="90%">
</p>

A tour of the platform: the AI weekly report and breaking news, the threat dashboard, legitimate and suspicious domains, DNS threats, data leaks and Cyber Watch.

### Threat Detection
<p align="center">
    <img alt="Threats Watcher" src="/Watcher/static/threats-watcher.gif" width="90%">
</p>

### AI-Powered Weekly Summary & Breaking News
<p align="center">
    <img alt="Weekly Summary & Breaking News" src="/Watcher/static/weekly-breaking-summary.gif" width="90%">
</p>

### Suspicious domain names detection
<p align="center">
    <img alt="Suspicious domain names detection" src="/Watcher/static/suspicious-domain-names-detection.gif" width="90%">
</p>

### Legitimate Domain List
<p align="center">
    <img alt="Legitimate Domain" src="/Watcher/static/legitimate-domain.gif" width="90%">
</p>

Add several domains in one go with the *One item per line* toggle: defanged links are restored, a *Preview* shows the result before anything is saved, and the summary lists every domain as created, skipped or in error.

### Data Leak Detection
<p align="center">
    <img alt="Data Leak Detection" src="/Watcher/static/data-leak-detection.gif" width="90%">
</p>

### Suspicious domain names monitoring
<p align="center">
    <img alt="Suspicious domain names monitoring" src="/Watcher/static/suspicious-domain-names-monitoring.gif" width="90%">
</p>

Select several domains and change legitimacy, takedown, legal and blocking flags together.

### Bulk actions and exports
<p align="center">
    <img alt="Bulk actions" src="/Watcher/static/bulk-actions.gif" width="90%">
</p>

False positives can be exported to Legitimate Domains in bulk: the exported sites disappear from Website Monitoring and appear in the legitimate list, with no page refresh.

### Cyber Watch
<p align="center">
    <img alt="Cyber Watch" src="/Watcher/static/cyber-watch.gif" width="90%">
</p>

Watch rules, monitored keywords and RSS sources, with the CVE and ransomware matches they produce.

### History of every change
<p align="center">
    <img alt="Timeline history" src="/Watcher/static/timeline-history.gif" width="90%">
</p>

Every create, update and delete is recorded with its author, so you can see who changed what and when.

### Customisable dashboards
<p align="center">
    <img alt="Dashboard layout" src="/Watcher/static/dashboard-layout.gif" width="90%">
</p>

Show, hide, move and resize panels: the layout is saved in your profile.

### Theme Previews

<p align="center">
  <img alt="Theme Preference 1" src="/Watcher/static/theme-preference-1.gif" width="45%">
  <img alt="Theme Preference 2" src="/Watcher/static/theme-preference-2.gif" width="45%">
</p>

<p align="center">
  <img alt="Theme Preference 3" src="/Watcher/static/theme-preference-3.gif" width="45%">
  <img alt="Theme Preference 4" src="/Watcher/static/theme-preference-4.gif" width="45%">
</p>

Watcher offers multiple visual themes to match your preferences and working environment. 

### Admin Interface
<p align="center">
    <img alt="Admin Interface" src="/Watcher/static/admin-interface.gif" width="90%">
</p>

Django provides a ready-to-use user interface for administrative activities. We all know how an admin interface is important for a web project: Users management, user group management, Watcher configuration, usage logs...

## Installation

```bash
# 1. Clone the repo
git clone https://github.com/thalesgroup-cert/watcher.git
cd watcher/deployment

# 2. Initialize environment, configs & directory structure
make init

# 3. Start the stack
make up

# 4. On first run: run database migrations + create superuser
make migrate
make superuser
make populate-db

# 5. Open the web UI
#    http://localhost:9002  (or your configured domain/port)
```

Get Watcher up and running in just **10 minutes** using Docker. **Detailed instructions available in our [Installation Guide](https://thalesgroup-cert.github.io/Watcher/README.html)**

## Platform Architecture

```mermaid
flowchart LR
    subgraph SRC["External sources"]
        RSS["RSS / CERT advisories"]
        CVE["CVE & ransomware feeds"]
        CT["Certificate Transparency"]
        WEB["Paste sites & code registries"]
        RSS ~~~ CVE ~~~ CT ~~~ WEB
    end

    subgraph HOST["Host server (Docker)"]
        TRAEFIK["Traefik<br/>TLS reverse proxy"]
        subgraph WATCHER["Watcher (Django)"]
            UI["React UI / Django admin"]
            API["Django REST API"]
            JOBS["Scheduled jobs (APScheduler)<br/>Threats · CyberWatch · DNS Threats<br/>Data Leak · Website Monitoring"]
            CONN["Connectors"]
        end
        CERTSTREAM["CertStream"]
        SEARX["SearXNG"]
        DB[("MySQL")]
    end

    subgraph OUT["Outputs"]
        HIVE["TheHive"]
        MISP["MISP"]
        CHAT["Slack / Citadel"]
        MAIL["Email (SMTP)"]
    end

    ANALYST(["Analyst"]) --> TRAEFIK --> UI
    UI <--> API
    API <--> DB
    JOBS <--> DB
    RSS & CVE --> JOBS
    CT --> CERTSTREAM --> JOBS
    WEB --> SEARX --> JOBS
    JOBS --> CONN
    API --> CONN
    CONN --> HIVE & MISP & CHAT & MAIL
```

Watcher's modular architecture ensures scalability, reliability, and easy integration with your existing security stack.

## Contributing

We welcome contributions from the security community!

To report bugs, request features, or submit code, please read our full [Contributing Guide](CONTRIBUTING.md).

## Pastebin Compliance

In order to use Watcher pastebin API feature, you need to subscribe to a pastebin pro account and whitelist Watcher public IP (see https://pastebin.com/doc_scraping_api).

