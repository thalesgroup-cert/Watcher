<p align="center">
    <img alt="Watcher Logo" src="/Watcher/static/watcher-logo-resize.png" height="270" width="270">
</p>

---

[![Install](/Watcher/static/Install-informational.svg)](https://felix83000.github.io/Watcher/README.html)
[![Documentation](/Watcher/static/Documentation-informational.svg)](https://felix83000.github.io/Watcher/)
[![LICENSE](https://img.shields.io/github/license/Felix83000/Watcher?logo=github&style=flat-square)](/LICENSE)
[![Docker Build Status](https://img.shields.io/docker/cloud/build/felix83000/watcher?logo=docker&style=flat-square)](https://hub.docker.com/r/felix83000/watcher/builds)
[![Docker Automated Status](https://img.shields.io/docker/cloud/automated/felix83000/watcher?logo=docker&style=flat-square)](https://hub.docker.com/r/felix83000/watcher/builds)

Watcher is a Django & React JS automated platform for discovering new potentially cybersecurity threats targeting your organisation. 

It should be used on webservers and available on Docker.

## Watcher capabilities

- Detect emerging vulnerability, malware using social network & other RSS sources (www.cert.ssi.gouv.fr, www.cert.europa.eu, www.us-cert.gov, www.cyber.gov.au...). 
- Detect Keywords in pastebin & in other IT content exchange websites (stackoverflow, github, gitlab, bitbucket, apkmirror, npm...).
- Monitor malicious domain names (IPs, mail/MX records, web pages using [TLSH](https://github.com/trendmicro/tlsh)).
- Detect suspicious domain names targeting your organisation, using [dnstwist](https://github.com/elceef/dnstwist). 

Useful as a bundle regrouping threat hunting/intelligence automated features.

## Additional features

- Create cases on [TheHive](https://thehive-project.org/) and events on [MISP](https://www.misp-project.org/).
- Integrated IOCs export to [TheHive](https://thehive-project.org/) and [MISP](https://www.misp-project.org/).
- LDAP & Local Authentication.
- Email notifications.
- Ticketing system feeding.
- Admin interface.
- Advance users permissions & groups.

## Involved dependencies

- [RSS-Bridge](https://github.com/RSS-Bridge/rss-bridge)
- [dnstwist](https://github.com/elceef/dnstwist)
- [Searx](https://searx.github.io/searx/)
- [pymisp](https://github.com/MISP/PyMISP)
- [thehive4py](https://github.com/TheHive-Project/TheHive4py)
- [TLSH](https://github.com/trendmicro/tlsh)
- [shadow-useragent](https://github.com/lobstrio/shadow-useragent)
- [NLTK](https://www.nltk.org/)

## Screenshots
Watcher provides a powerful user interface for data visualization and analysis. This interface can also be used to manage Watcher usage and to monitor its status.

**Threats detection**

<p align="center">
    <img alt="Threats detection" src="/Watcher/static/Watcher-threats-detection.png">
</p>

**Keywords detection**

<p align="center">
    <img alt="Keywords detection" src="/Watcher/static/Watcher-keywords-detection.png">
</p>

**Malicious domain names monitoring**

<p align="center">
    <img alt="Malicious domain names monitoring" src="/Watcher/static/Watcher-malicious-domain-names-monitoring.png">
</p>

**IOCs export to TheHive & MISP**

<p align="center">
    <img alt="IOCs export to TheHive & MISP" src="/Watcher/static/Watcher-iocs-export.png">
</p>

**Potentially malicious domain names detection**

<p align="center">
    <img alt="Potentially malicious domain names detection" src="/Watcher/static/Watcher-malicious-domain-names-detection.png">
</p>

Django provides a ready-to-use user interface for administrative activities. We all know how an admin interface is important for a web project: Users management, user group management, Watcher configuration, usage logs...  

**Admin interface**

<p align="center">
    <img alt="Admin interface" src="/Watcher/static/Watcher-admin-interface.png">
</p>

## Installation

Create a new Watcher instance in ten minutes using Docker (see [Installation Guide](https://felix83000.github.io/Watcher/README.html)).

## Platform architecture

<p align="center">
    <img alt="Platform architecture" src="/Watcher/static/Platform-architecture.png">
</p>

## Get involved
There are many ways to getting involved with Watcher:

- Report bugs by opening [Issues](https://github.com/Felix83000/Watcher/issues) on GitHub.
- Request new features or suggest ideas (via [Issues](https://github.com/Felix83000/Watcher/issues)).
- Make pull-requests.
- Discuss bugs, features, ideas or issues.
- Share Watcher to your community (Twitter, Facebook...).

## Pastebin compliant
In order to use Watcher pastebin API feature, you need to subscribe to a pastebin pro account and whitelist Watcher public IP (see https://pastebin.com/doc_scraping_api).


---
Thanks to [**Thales Group CERT**](https://www.thalesgroup.com/en/cert) (THA-CERT) and [**ISEN-Toulon Engineering School**](https://www.isen-mediterranee.fr/) for allowing me to carry out this project.
