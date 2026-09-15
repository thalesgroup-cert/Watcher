# Prompt — Refonte du module DNS Finder (Watcher)

## Contexte

Le module `dns_finder` du repo `thalesgroup-cert/Watcher` doit être refondu pour s'aligner sur
le pattern déjà utilisé par le module `site_monitoring` (page "Suspicious Websites Monitored").
Actuellement, le dashboard DNS Finder (`frontend/src/components/DnsFinder/Dashboard.js`) affiche
6 panneaux : Statistics, DNS Alerts, DNS Monitored, Archived Alerts, Keyword Monitored, Dangling
Subdomains. Il doit devenir 3 modules :

1. **DNS Threats Monitored** (remplace Alerts + Archived Alerts + Dangling Subdomains)
2. **Corporate DNS Assets Monitored** (ex-DNS Monitored)
3. **Corporate Keywords Monitored** (ex-Keyword Monitored)

Trois moteurs de détection distincts alimentent aujourd'hui des alertes séparées et doivent être
centralisés dans le nouveau module DNS Threats Monitored :

- **Dnstwist Algorithm** (`check_dnstwist` dans `dns_finder/core.py`) → crée `Alert` + `DnsTwisted`
  (avec `fuzzer` renseigné)
- **Certificate Transparency Stream Monitoring** (`print_callback` dans `dns_finder/core.py`,
  branche mot-clé) → crée `Alert` + `DnsTwisted` (sans `fuzzer`)
- **Subdomain Takeover Detection** (`evaluate_dangling_subdomain` dans `dns_finder/core.py`,
  appelé depuis le cron `recheck_dangling_subdomains`) → crée `DanglingAlert` + `DanglingSubdomain`

## Fichiers de référence existants (repo, branche `test`)

Backend : `dns_finder/models.py`, `dns_finder/core.py`, `dns_finder/serializers.py`,
`dns_finder/api.py`, `dns_finder/urls.py`, `dns_finder/certstream_client.py`,
`common/misp.py` (génération d'objets MISP, aujourd'hui limitée à `Site` et `DnsTwisted` via
`isinstance` dans `create_objects()`).

Frontend, à retirer : `frontend/src/components/DnsFinder/Alerts.js`,
`ArchivedAlerts.js`, `DanglingSubdomains.js`.
Frontend, à garder tel quel (juste redimensionnés dans le layout) :
`DnsMonitored.js`, `KeywordMonitored.js`, `DnsFinderStats.js`.
Frontend de référence à imiter : `frontend/src/components/SiteMonitoring/SuspiciousSites.js`
(colonne Domain Name + tags, modale `Technical details for`), `SiteMonitoring/Dashboard.js`
(layout `PanelGrid` pleine largeur + panneaux).

## 1. Modèle de données (backend)

### 1.1 `Alert` (dns_finder/models.py)
Ajouter un champ `source` :
```python
SOURCE_DNSTWIST = 'dnstwist'
SOURCE_CERTSTREAM_KEYWORD = 'certstream_keyword'
SOURCE_CHOICES = [
    (SOURCE_DNSTWIST, 'Dnstwist Algorithm'),
    (SOURCE_CERTSTREAM_KEYWORD, 'Certificate Transparency Stream'),
]
source = models.CharField(max_length=30, choices=SOURCE_CHOICES, default=SOURCE_CERTSTREAM_KEYWORD)
```
**Bug existant à corriger** : dans `core.py`, `print_callback` et `check_dnstwist` font
`alert.source = '...'; alert.save()` après coup — `source` n'existe pas sur le modèle
aujourd'hui, cette affectation ne persiste jamais rien. Une fois le champ ajouté, passer la
valeur directement à la création : `Alert.objects.create(dns_twisted=dns_twisted, source='dnstwist')`
(idem `'certstream_keyword'` dans `print_callback`).

Migration : `AddField` avec un default temporaire, puis `RunPython` de backfill par déduction
heuristique sur les lignes existantes (`dns_twisted.fuzzer` renseigné → `dnstwist`, sinon →
`certstream_keyword`), via deux `UPDATE` en masse (`.filter(...).update(...)`, pas de boucle
Python), avec `apps.get_model()`. Accepté comme heuristique pour l'historique — non nécessaire
pour les alertes futures grâce au correctif ci-dessus.

### 1.2 `DnsTwisted` (dns_finder/models.py)
Ajouter les colonnes dédiées suivantes (nullable/blank, vides pour les lignes source Dnstwist,
renseignées pour les lignes source Certificate Transparency Stream) :
```python
issuer = models.CharField(max_length=255, blank=True, null=True)
san_list = models.JSONField(blank=True, null=True)
not_before = models.DateTimeField(blank=True, null=True)
not_after = models.DateTimeField(blank=True, null=True)
serial_number = models.CharField(max_length=100, blank=True, null=True)
fingerprint_sha256 = models.CharField(max_length=100, blank=True, null=True)
```
Renseigner ces champs dans `print_callback` (dns_finder/core.py) à partir du message CertStream
(`message['data']['leaf_cert']`, et `message['data']['chain']` pour l'issuer si besoin) au moment
de `DnsTwisted.objects.create(...)`. Vérifier la structure exacte fournie par le
`certstream-server-go` utilisé par `certstream_client.py` avant de finaliser le mapping de
champs (les clés exactes peuvent varier légèrement selon la version du flux).

### 1.3 `DanglingAlert` (dns_finder/models.py)
Renommer le champ existant `source` (valeurs réelles observées : `'periodic_recheck'`) en
`trigger`, pour libérer le nom `source` au sens de la table unifiée (où il vaudra toujours
`subdomain_takeover`, fixé côté API — pas un champ DB sur ce modèle). Migration
`RenameField('DanglingAlert', 'source', 'trigger')`.

Ne pas ajouter de mécanisme d'archivage sur `DanglingAlert` : le statut du `DanglingSubdomain`
(`resolved` / `false_positive`) sert déjà d'équivalent "archivé" pour cette source.

## 2. API backend

### 2.1 Endpoint unifié pour DNS Threats Monitored
Nouvelle vue DRF qui fusionne `Alert` et `DanglingAlert` en un flux unique, avec un **tri
chronologique réellement mélangé** entre les 3 sources (pas un simple regroupement) — utiliser
des querysets annotés avec les mêmes noms de champs virtuels puis `QuerySet.union()`, ou une vue
matérialisée / SQL brut si `union()` s'avère trop limitant pour le filtrage dynamique nécessaire
(voir 2.2). Forme de sortie normalisée par élément :

```json
{
  "id": 123,
  "source": "dnstwist | certstream_keyword | subdomain_takeover",
  "domain_name": "...",
  "corporate_dns": "...",
  "corporate_keyword": "... | null",
  "status_tag": "active | archived | dangling_confirmed | ...",
  "created_at": "...",
  "misp_event_uuid": [...],
  "technical_details": { /* forme différente selon `source`, voir 3.3 */ }
}
```

### 2.2 Filtres dynamiques par source
Le frontend doit afficher un jeu de filtres qui change selon la source sélectionnée (voir 3.4).
L'API doit accepter en query params, selon la source active : `fuzzer` (dnstwist),
`corporate_keyword` (certstream_keyword), `provider` / `cname_target` / `status`
(subdomain_takeover). Le filtre `corporate_dns` reste commun aux 3 sources.

### 2.3 Endpoint détail Corporate DNS Asset
Nouvel endpoint on-demand (pas embarqué dans la liste `DnsMonitoredSerializer`, pour ne pas
alourdir le payload principal) : `GET /api/dns_finder/dns_monitored/{id}/dangling_subdomains/`,
retournant les `DanglingSubdomain` liés à ce `DnsMonitored`, appelé uniquement à l'ouverture de la
modale détail de l'asset côté frontend.

### 2.4 Export MISP étendu au Subdomain Takeover
Aujourd'hui `common/misp.py::create_objects()` ne gère que `Site` et `DnsTwisted` via
`isinstance`, sur la base d'un objet MISP générique `domain-ip` avec `obj.domain_name`.
`DanglingSubdomain` n'a pas de `domain_name` (il a `subdomain`) et porte des informations
différentes. Créer un **objet MISP dédié** au subdomain takeover (nouvelle branche dans
`create_objects()` ou nouvelle fonction `create_takeover_objects()`) avec au minimum : le
sous-domaine (type `domain`), le CNAME cible (type `domain` ou `text`, relation
`cname-target`), le provider détecté (type `text`), et le code HTTP constaté (type `text` ou
`comment`). Mettre à jour `MISPSerializer._get_target_obj()` (dns_finder/serializers.py) pour
router vers `DanglingSubdomain` selon un identifiant de source (ex. `fuzzer == 'subdomain_takeover'`
en réutilisant le paramètre existant, ou un paramètre dédié plus explicite — à trancher au moment
du code selon ce qui s'intègre le mieux avec `MISPViewSet`).

## 3. Frontend

### 3.1 Dashboard (frontend/src/components/DnsFinder/Dashboard.js)
Retirer les imports et panneaux `ArchivedAlerts`, `DanglingSubdomains`. Nouveau layout :
```js
const DEFAULT_LAYOUT = [
    { i: 'stats',    x: 0, y: 0,  w: 12, h: 8,  minW: 6, minH: 3 },
    { i: 'threats',  x: 0, y: 8,  w: 12, h: 14, minW: 6, minH: 6 },
    { i: 'dns',      x: 0, y: 22, w: 6,  h: 11, minW: 3, minH: 5 },
    { i: 'keywords', x: 6, y: 22, w: 6,  h: 11, minW: 3, minH: 5 },
];
const DEFAULT_ACTIVE = ['stats', 'threats', 'dns', 'keywords'];
```
Panneau `stats` conservé (adapter `DnsFinderStats.js` pour refléter les 3 sources). Le panneau
`threats` (label "DNS Threats Monitored") remplace `alerts`/`archived`/`dangling` en pleine
largeur ; `dns` et `keywords` passent en 50/50 sous ce panneau.

### 3.2 Nouveau composant `DnsFinder/ThreatsMonitored.js` (remplace `Alerts.js` + `ArchivedAlerts.js` + `DanglingSubdomains.js`)
Consomme le nouvel endpoint unifié (2.1). Colonnes de table, sur le modèle de
`SiteMonitoring/SuspiciousSites.js` :
- **Domain Name** : nom en gras + ligne de tags colorés en dessous (statut : actif/archivé pour
  dnstwist/certstream_keyword, ou statut dangling coloré repris de `DanglingSubdomain.STATUS_CHOICES`
  pour subdomain_takeover ; badge MISP existant `getMispStatusBadge`)
- **Source** : badge coloré (Dnstwist Algorithm / Certificate Transparency Stream / Subdomain
  Takeover Detection), triable
- **Corporate Keyword** (vide si non applicable à la source)
- **Corporate DNS**
- **Created At**
- Actions : bouton "Technical details" (ouvre 3.3), export MISP, toggle actif/archivé
  (seulement pour dnstwist/certstream_keyword)

### 3.3 Modale "Technical details for" — 3 variantes
Même structure que `detailsModal()` dans `SuspiciousSites.js` (react-bootstrap `Modal`,
`Container`/`Row`/`Col`), contenu conditionné par `alert.source` :

| Source | Champs affichés |
|---|---|
| `dnstwist` | Fuzzer, domaine Corporate DNS d'origine, date de détection |
| `certstream_keyword` | Mot-clé Corporate matché, Issuer, SAN (liste), Not Before / Not After, Serial Number, Fingerprint SHA-256 |
| `subdomain_takeover` | Provider, CNAME Target, code HTTP, dernière vérification (`last_checked_at`), domaine Corporate DNS parent |

### 3.4 Filtres dynamiques
Au-dessus de la table, un sélecteur de Source pilote l'affichage des filtres spécifiques :
Fuzzer (dnstwist), Corporate Keyword (certstream_keyword — redondant avec la colonne mais utile
en filtre rapide), Provider / CNAME Target / Statut dangling (subdomain_takeover). Le filtre
Corporate DNS et le champ de recherche texte restent communs aux 3 sources en permanence.

### 3.5 Nouvelle modale détail "Corporate DNS Asset"
Sur `DnsMonitored.js` (Corporate DNS Assets Monitored), ajouter une action par ligne ouvrant une
modale qui appelle l'endpoint 2.3 à l'ouverture (pas de préchargement) et affiche la liste des
`DanglingSubdomain` suivis pour cet asset (y compris ceux en statut `pending`/`ok` qui n'ont
jamais généré d'alerte — c'est le remplacement du panneau `Dangling Subdomains` supprimé).

## 4. Séquençage suggéré (commits)

1. `fix(dns_finder): add persisted source field on Alert + backfill migration`
2. `feat(dns_finder): add CT certificate metadata columns on DnsTwisted`
3. `refactor(dns_finder): rename DanglingAlert.source to trigger`
4. `feat(dns_finder): capture certificate issuer/SAN/validity in print_callback`
5. `feat(dns_finder): unified threats endpoint (Alert + DanglingAlert)`
6. `feat(dns_finder): on-demand dangling subdomains endpoint per DnsMonitored`
7. `feat(common): dedicated MISP object for subdomain takeover findings`
8. `feat(frontend): ThreatsMonitored component with per-source technical details modal`
9. `feat(frontend): Corporate DNS Asset detail modal`
10. `chore(frontend): remove ArchivedAlerts/DanglingSubdomains panels, update Dashboard layout`
11. `test(e2e): cover the unified DNS Threats Monitored table`

## 5. Contraintes à respecter

- Réutiliser les composants communs existants sans les dupliquer : `TableManager`, `PanelGrid`,
  `DateWithTooltip`, `ExportModal`, `LAYOUT_PRESETS`.
- Ne pas casser le flux MISP existant pour `Site` et `DnsTwisted` dans `common/misp.py` — la
  nouvelle branche subdomain takeover s'ajoute, ne remplace rien.
- Migrations Django : utiliser `apps.get_model()` dans tout `RunPython`, jamais un import direct
  des modèles.
- Le backfill de `Alert.source` doit être fait en `UPDATE` en masse (`.filter().update()`), pas
  en boucle Python ligne à ligne.
- **Ne jamais faire de `git push` (branche `test`, `master`, ou toute autre) sans autorisation
  explicite au préalable.** Commits locaux, diffs, ou branches locales sont acceptables ; tout
  push distant doit être validé par moi avant d'être exécuté.
- **Ne jamais `git push` (ni ouvrir de PR) sans autorisation explicite au préalable.** Commits
  locaux, oui ; tout envoi vers le remote doit être validé avant coup par moi.
