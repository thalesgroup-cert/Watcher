<p align="center">
    <img alt="Watcher Logo" src="/Watcher/static/watcher-logo-resize.png" height="270" width="270">
</p>

<p align="center">
    <strong>Automated Cybersecurity Threat Detection Platform</strong>
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

Watcher is a Django & React JS platform designed to discover and monitor emerging cybersecurity threats. It can be deployed on webservers or quickly run via Docker.

## Watcher Capabilities

Watcher empowers your security operations with comprehensive threat detection and monitoring:

- **Emerging Threat Detection** — Monitor cybersecurity trends via RSS feeds from CERT-FR (www.cert.ssi.gouv.fr), CERT-EU (www.cert.europa.eu), US-CERT (www.us-cert.gov), Australian Cyber Security Centre (www.cyber.gov.au), and more. Track new vulnerabilities, malware campaigns, and threat advisories as they appear.

- **Legitimate Domain Management** — Centralized approved domains with expiry, repurchase status, registrar info, and contacts. Easily convert monitored malicious domains into legitimate ones.

- **Information Leak Monitoring** — Detect sensitive data exposure across the webs including Pastebin, StackOverflow, GitHub, GitLab, Bitbucket, APKMirror, npm registries, and other platforms. Catch leaked credentials, API keys, and confidential information early.

- **Malicious Domain Surveillance** — Monitor malicious domains for changes in IP addresses, mail/MX records, and web content. Use [TLSH](https://github.com/trendmicro/tlsh) fuzzy hashing to detect modifications. Automatic RDAP/WHOIS checks with registrar and expiry alerts.

- **Suspicious Domain Detection** — Identify potentially malicious domains targeting your organisation via:
  - **Domain Generation Algorithm Detection** using [dnstwist](https://github.com/elceef/dnstwist) to find typosquatting, homograph attacks, and similar domain variants
  - **Certificate Transparency Monitoring** via [certstream](https://github.com/CaliDog/certstream-python) to catch newly registered suspicious domains in real-time

## Additional Features

Extend Watcher's capabilities with powerful integrations and management tools:

- **Incident Response Integration** — Automatically create cases on [TheHive](https://thehive-project.org/) and events on [MISP](https://www.misp-project.org/) for streamlined incident handling
- **IOCs Export** — Seamlessly export Indicators of Compromise (IOCs) to TheHive and MISP for threat intelligence sharing
- **Flexible Authentication** — Support for both LDAP and local authentication systems
- **Smart Notifications** — Receive email alerts for critical findings and threshold violations
- **Ticketing System Integration** — Automatically feed your ticketing system with security findings
- **Comprehensive Admin Interface** — Manage all aspects of Watcher through Django's powerful admin panel
- **Advanced Access Control** — Granular user permissions and group management for team collaboration
- **Modern UI Experience** — A modern interface with customizable themes, resizable dashboard panels, advanced filtering with saved filter sets, and persistent user preferences

## Involved dependencies

Watcher leverages open source tools and libraries:
- [**certstream**](https://github.com/CaliDog/certstream-python)
- [**dnstwist**](https://github.com/elceef/dnstwist)
- [**Searx**](https://searx.github.io/searx/)
- [**PyMISP**](https://github.com/MISP/PyMISP)
- [**TLSH**](https://github.com/trendmicro/tlsh)
- [**shadow-useragent**](https://github.com/lobstrio/shadow-useragent)
- [**NLTK**](https://www.nltk.org/)

## App Preview

### Threat Detection
<p align="center">
    <img alt="Threats Watcher" src="/Watcher/static/threats-watcher.gif" width="90%">
</p>

### Weekly Summary & Breaking News
<p align="center">
    <img alt="Threats Watcher" src="/Watcher/static/weekly-breaking-summary.gif" width="90%">
</p>

### Legitimate Domain List
<p align="center">
    <img alt="Legitimate Domain" src="/Watcher/static/legitimate-domain.gif" width="90%">
</p>

### Data Leak Detection
<p align="center">
    <img alt="Data Leak Detection" src="/Watcher/static/data-leak-detection.gif" width="90%">
</p>

### Suspicious domain names monitoring
<p align="center">
    <img alt="Suspicious domain names monitoring" src="/Watcher/static/suspicious-domain-names-monitoring.gif" width="90%">
</p>

### Suspicious domain names detection
<p align="center">
    <img alt="Suspicious domain names detection" src="/Watcher/static/suspicious-domain-names-detection.gif" width="90%">
</p>

Django provides a ready-to-use user interface for administrative activities. We all know how an admin interface is important for a web project: Users management, user group management, Watcher configuration, usage logs...

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

## Installation

Get Watcher up and running in just **10 minutes** using Docker. **Detailed instructions available in our [Installation Guide](https://thalesgroup-cert.github.io/Watcher/README.html)**

## Platform Architecture

<p align="center">
    <img alt="Platform Architecture" src="/Watcher/static/Platform-architecture.png">
</p>

Watcher's modular architecture ensures scalability, reliability, and easy integration with your existing security stack.

## Contributing

We welcome contributions from the security community!

To report bugs, request features, or submit code, please read our full [Contributing Guide](CONTRIBUTING.md).

## Pastebin Compliance

In order to use Watcher pastebin API feature, you need to subscribe to a pastebin pro account and whitelist Watcher public IP (see https://pastebin.com/doc_scraping_api).

