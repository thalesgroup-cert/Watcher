export interface TourStep {
    title: string;
    text: string;
    /** CSS selector of what the step points at. Without one the step is centred; a missing target skips the step. */
    target?: string;
    /** Open this tab (by its label) of the page before the step. It stays open for the steps that follow. */
    tab?: string;
    /** Point at the button of this tab (by its label) instead of a selector. */
    tabButton?: string;
}

export interface Tour {
    title: string;
    steps: TourStep[];
}

const TITLE = '[data-tour="page-title"]';
const ACTIONS = '[data-tour="page-actions"]';
const TABS = '[data-tour="page-tabs"]';
const TABLE = 'main table, main [role="grid"], main [role="table"]';
const SEARCH = 'main input[type="search"], main [role="searchbox"], main input[placeholder*="earch"]';
const CARD = 'main .MuiCard-root';
const NAV = 'nav[aria-label="Main navigation"]';

/** Keeps the names of the tours while every step is read as a plain TourStep. */
const defineTours = <K extends string>(tours: Record<K, Tour>) => tours;

export const TOURS = defineTours({
    dashboard: {
        title: 'Dashboard',
        steps: [
            { title: 'Welcome to Watcher', text: 'Watcher watches for threats against your organisation and tells you what needs a decision. This tour shows you around; every page has its own "?".' },
            { target: NAV, title: 'Navigation', text: 'One entry per module. Hover the rail to open it, or pin it to keep it open. On a phone it becomes a drawer.' },
            { target: '[aria-label="Search"]', title: 'Search everything', text: 'Look up a domain, a CVE, a keyword or a victim across every module at once. Ctrl+K (or Cmd+K) opens it from anywhere.' },
            { target: '[data-tour="setup-guide"]', title: 'Setup guide', text: 'The steps to get Watcher watching your organisation. They tick themselves as you add things. Hide the guide any time and bring it back from the header.' },
            { target: '[aria-label="Needs attention"]', title: 'What needs attention', text: 'Open items in every module: matches, DNS threats, data leaks, website changes, expiring domains and pending actions. Click a card to land on the matching list.' },
            { title: 'The threat landscape', text: 'Below, the trending words of the week (as a cloud or as a graph of words linked by their articles), a world map of ransomware victims and news sources, and the latest critical CVEs and victims.' },
            { target: '[aria-label="My profile"]', title: 'Your profile', text: 'Pick one of eleven themes, change your password and see what you are allowed to do.' },
        ],
    },
    threatsWatcher: {
        title: 'Threats Watcher',
        steps: [
            { target: TITLE, title: 'Trending words', text: 'Watcher reads cybersecurity RSS feeds every 30 minutes and counts the words that suddenly come up. A word that spikes is often a new campaign or vulnerability.' },
            { target: TABS, title: 'Five sections', text: 'Trends, the words and rules you monitor, the sources read, the words ignored, and charts.' },
            { tab: 'Trends', target: TABLE, title: 'Trends', text: 'Every trending word with its mentions. Open one to read the articles behind it, ask for an AI summary of what is said, or add it to your monitored words.' },
            { tab: 'Monitored keywords', tabButton: 'Monitored keywords', title: 'Monitored keywords', text: 'Words you care about, such as a product or a vendor. When the news mention one, Watcher raises an alert and can notify your team. Tick Rule to ask for several words in the same article: a threat actor AND one of your partners, for instance.' },
            { tab: 'Sources', tabButton: 'Sources', title: 'RSS sources', text: 'The feeds Watcher reads: CERT-FR, CERT-EU, US-CERT and many more. Add your own, and see how reliable each one is.' },
            { tab: 'Banned words', tabButton: 'Banned words', title: 'Banned words', text: 'Everyday words that would otherwise always trend ("security", "update"). Banned words are left out of the counts.' },
            { tab: 'Insights', target: CARD, title: 'Insights', text: 'Charts of the last 30 days: top words, new words per day and the reliability of your sources. Click a bar to list what it counts.' },
            { target: ACTIONS, title: 'Add', text: 'Add a monitored keyword or rule, an RSS source or a banned word from anywhere on the page.' },
        ],
    },
    cyberWatch: {
        title: 'Cyber Watch',
        steps: [
            { target: TITLE, title: 'CVEs and ransomware', text: 'New CVEs and ransomware victims, collected every 30 minutes and checked against your watch rules.' },
            { target: TABS, title: 'Five sections', text: 'The matches to review, then the raw CVEs and victims, your rules and charts.' },
            { tab: 'Matches', target: TABLE, title: 'Matches', text: 'What your rules found. Review each match, then archive it once handled. This is the list to look at first.' },
            { tab: 'CVEs', target: TABLE, title: 'CVEs', text: 'Every CVE collected, with its severity and CVSS score. Filter by severity or period, and open one for its description and references.' },
            { tab: 'Ransomware', target: TABLE, title: 'Ransomware victims', text: 'Victims posted by ransomware groups, with the group, country and sector. Filter to the sectors and countries that matter to you.' },
            { tab: 'Watch rules', tabButton: 'Watch rules', title: 'Watch rules', text: 'A rule is a keyword (a product you run, your company name) applied to CVEs, to victims or to both. A matching item shows up in Matches and can notify your team.' },
            { tab: 'Insights', target: CARD, title: 'Insights', text: 'CVEs by severity, the most active groups, targeted sectors and countries. Click a bar to list what it counts.' },
            { target: ACTIONS, title: 'New watch rule', text: 'Create a rule here. Start with the products you run.' },
        ],
    },
    dataLeak: {
        title: 'Data leaks',
        steps: [
            { target: TITLE, title: 'Leaks about you', text: 'Watcher searches paste sites, code hosts and forums for your search patterns, and tells you when something shows up.' },
            { target: TABS, title: 'Three sections', text: 'The findings to review, the patterns that are searched, and charts.' },
            { tab: 'Alerts', target: TABLE, title: 'Alerts', text: 'Each finding with the keyword that matched and where it was found. Open the link to read it, then archive the alert once handled.' },
            { tab: 'Search patterns', tabButton: 'Search patterns', title: 'Search patterns', text: 'The keywords searched: a project name, an internal domain, an employee email domain. The more specific, the fewer false positives.' },
            { tab: 'Insights', target: CARD, title: 'Insights', text: 'Alerts per day, the keywords that find the most and the sites where leaks appear.' },
            { target: ACTIONS, title: 'Add patterns', text: 'Add several patterns at once, one per line.' },
        ],
    },
    dnsFinder: {
        title: 'DNS threats',
        steps: [
            { target: TITLE, title: 'Look-alike domains', text: 'Domains that imitate yours, certificates issued for your keywords, and subdomains at takeover risk.' },
            { target: TABS, title: 'Four sections', text: 'The threats found, the domains and keywords watched, and charts.' },
            { tab: 'Threats', target: TABLE, title: 'Threats', text: 'Each suspicious domain and where it came from: a generated look-alike, a new certificate, or a subdomain that points nowhere. Open one to see its details, then take it down or mark it handled.' },
            { tab: 'Monitored domains', tabButton: 'Monitored domains', title: 'Monitored domains', text: 'Your own domains. Watcher generates their typosquatted variants (swapped letters, homoglyphs, other TLDs) and checks which exist.' },
            { tab: 'Keywords', tabButton: 'Keywords', title: 'Keywords', text: 'Words searched in every new certificate issued on the internet, in real time. A phishing site often gets a certificate before it goes live.' },
            { tab: 'Insights', target: CARD, title: 'Insights', text: 'Threats per day, by source, the most used techniques and the certificate issuers.' },
            { target: ACTIONS, title: 'Watch more', text: 'Add a domain to generate its look-alikes, or a keyword to watch in certificates.' },
        ],
    },
    siteMonitoring: {
        title: 'Website monitoring',
        steps: [
            { target: TITLE, title: 'Websites and pages', text: 'Websites you suspect of impersonating you, checked every 15 minutes for a change of hosting, mail servers, content, registration or certificate; and precise web pages whose text you want to follow.' },
            { target: TABS, title: 'Four sections', text: 'The websites, the changes detected on them, the web pages whose text is watched, and charts.' },
            { tab: 'Websites', target: TABLE, title: 'Websites', text: 'Each monitored website with its IP, mail servers and expiry. Open one to follow the takedown: request, legal team, blocking and UDRP case.' },
            { tab: 'Changes', target: TABLE, title: 'Changes', text: 'What moved: a new IP, a new mail server (a sign it is being prepared for phishing) or different content. Review each one, then archive it.' },
            { tab: 'Pages', target: TABLE, title: 'Pages', text: 'A precise web page, such as a researcher\'s blog that has no RSS feed. Watcher keeps its text each time it changes and tells you when enough of it did: dates, counters and menus are ignored. Open one to see its versions and what changed between them.' },
            { tab: 'Insights', target: CARD, title: 'Insights', text: 'Changes per day and by kind, and the websites that are offline or about to expire.' },
            { target: ACTIONS, title: 'Add to monitor', text: 'On Websites and Changes, add several websites at once, one per line. On Pages, add the address of a page, how much change is worth a notification, and how often to look.' },
        ],
    },
    legitimateDomains: {
        title: 'Legitimate domains',
        steps: [
            { target: TITLE, title: 'Your own domains', text: 'The domains the organisation owns. Watcher keeps their registration and certificate dates up to date, and never raises an alert about them.' },
            { target: CARD, title: 'At a glance', text: 'How many domains you own, how many expire within 30 days, which have expired and which certificates need renewing.' },
            { tab: 'Domains', target: TABLE, title: 'Domains', text: 'Each domain with its registrar, expiry and certificate. Open one for its details.' },
            { target: SEARCH, title: 'Search and filter', text: 'Find a domain, or filter by registrar, expiry or repurchased status.' },
            { tab: 'Insights', target: CARD, title: 'Insights', text: 'Expiries over the next 12 months and the most used extensions.' },
            { target: ACTIONS, title: 'Add domains', text: 'Add your domains first: they feed the other modules, which use them to tell what is yours from what is not.' },
        ],
    },
    changes: {
        title: 'what moved',
        steps: [
            { title: 'Same Watcher, new layout', text: 'Everything you used is still here. The top bar became a sidebar, and every page gained tabs, charts and bulk actions. This tour shows where each part went.' },
            { target: 'nav[aria-label="Main navigation"]', title: 'The top bar is now a sidebar', text: 'Same blue as before. Hover it to open, or pin it to keep it open. The entries are grouped: Monitor, Assets and Workspace.' },
            { target: 'nav[aria-label="Main navigation"] [aria-label="Dashboard"]', title: 'Dashboard', text: 'What needs your attention across every module, plus the setup guide.' },
            { target: 'nav[aria-label="Main navigation"] [aria-label="Threats Watcher"]', title: 'Threats Watcher', text: 'The trending words used to be the home page. They now have a page of their own, with the word cloud, the graph of linked words and the sources.' },
            { target: 'nav[aria-label="Main navigation"] [aria-label="Cyber Watch"]', title: 'Cyber Watch', text: 'CVEs, ransomware victims and your watch rules, now with a Matches tab to review what your rules found.' },
            { target: 'nav[aria-label="Main navigation"] [aria-label="Data Leak"]', title: 'Data Leak', text: 'Alerts and search patterns, with charts under Insights.' },
            { target: 'nav[aria-label="Main navigation"] [aria-label="DNS Threats"]', title: 'DNS Threats', text: 'Was "DNS Threats Monitored". Look-alike domains, certificate transparency and subdomain takeovers are now triaged in one list.' },
            { target: 'nav[aria-label="Main navigation"] [aria-label="Website Monitoring"]', title: 'Website Monitoring', text: 'The same websites, with a Changes tab listing what moved.' },
            { target: 'nav[aria-label="Main navigation"] [aria-label="Legitimate Domains"]', title: 'Legitimate Domains', text: 'Unchanged in purpose, with expiry charts and filters.' },
            { target: 'nav[aria-label="Main navigation"] [aria-label="Activity"]', title: 'Activity (new)', text: 'Who changed what, across every module.' },
            { target: 'nav[aria-label="Main navigation"] [aria-label="Connectors"]', title: 'Connectors', text: 'Same connectors, plus a Notifications tab to choose and write what is sent.' },
            { target: '[aria-label="Help"]', title: 'Help', text: 'The documentation, the API and the GitHub page, which were in the help menu of the top bar.' },
            { target: '[aria-label="My profile"]', title: 'Your account', text: 'The user menu moved here: profile, theme, password and sign out. Darkly, the original look, is the default theme.' },
        ],
    },
    connectors: {
        title: 'Connectors',
        steps: [
            { target: TITLE, title: 'External services', text: 'Credentials and endpoints of TheHive, MISP, Slack, Citadel, email and the other services Watcher uses.' },
            { target: TABS, title: 'Two sections', text: 'The services themselves, and what is sent through them.' },
            { tab: 'Connectors', target: CARD, title: 'Status at a glance', text: 'How many connectors are configured, incomplete or disabled.' },
            { target: SEARCH, title: 'Find a connector', text: 'Search, filter by status or health, or group by category.' },
            { tab: 'Notifications', tabButton: 'Notifications', title: 'Notifications', text: 'Every notification Watcher can send, on each channel. Switch one on, choose the fields of the message, or write the whole message yourself.' },
            { tab: 'Notifications', target: TABLE, title: 'Pick a notification', text: 'Open one to see its channels. The preview shows the message exactly as it will arrive, with fictional data.' },
        ],
    },
    activity: {
        title: 'Activity',
        steps: [
            { target: TITLE, title: 'Who changed what', text: 'Every change made in every module, whether by a person or by Watcher itself.' },
            { target: CARD, title: 'At a glance', text: 'Changes today and over 7 days, who contributed, and how much was automated.' },
            { target: SEARCH, title: 'Filter the feed', text: 'Narrow it by module, person, kind of change or period.' },
            { title: 'History of an object', text: 'Open an entry to see the full history of that object: every value it had and who changed it.' },
        ],
    },
});

export type TourId = keyof typeof TOURS;
