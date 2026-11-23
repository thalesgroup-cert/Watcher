import { EFFECT_NAMES, EFFECTS, type Effects } from '../../styles/effects';
import { THEMES, type ThemeName } from '../../styles/themes';

/**
 * What the Ctrl+K window can do besides searching the data: open a page (or one tab of a page), run an action, change
 * the theme. The list is built from what the person may see, and filtered by the text typed.
 */
export type CommandGroup = 'Go to' | 'Actions' | 'Themes';

export interface Command {
    id: string;
    group: CommandGroup;
    title: string;
    /** Words that find the command without being in its title ("typosquatting" finds DNS Threats). */
    keywords: string;
    /** Shown under the title. */
    hint?: string;
    run: () => void;
}

export interface CommandContext {
    signedIn: boolean;
    superuser: boolean;
    navigate: (to: string) => void;
    logout: () => void;
    setTheme: (name: ThemeName) => void;
    themeName: ThemeName;
    /** The theme in use has a backdrop: the effects can be set. */
    ambient: boolean;
    effects: Effects;
    setEffects: (level: Effects) => void;
    docsUrl: string;
    apiDocsUrl: string;
    apiDocsLabel: string;
}

interface Page {
    to: string;
    title: string;
    keywords: string;
    /** Open to visitors who are not signed in. */
    public?: boolean;
    superuser?: boolean;
}

// One entry per page, then one per tab: the tabs are what people look for ("insights", "sources", "versions").
const PAGES: Page[] = [
    { to: '/', title: 'Overview', keywords: 'home dashboard summary', public: true },
    { to: '/threats_watcher', title: 'Threats Watcher', keywords: 'trending words rss news cloud', public: true },
    { to: '/threats_watcher?tab=keywords', title: 'Threats Watcher · Monitored keywords', keywords: 'rules alert words', public: true },
    { to: '/threats_watcher?tab=sources', title: 'Threats Watcher · Sources', keywords: 'rss feeds reliability', public: true },
    { to: '/threats_watcher?tab=insights', title: 'Threats Watcher · Insights', keywords: 'charts statistics trends', public: true },
    { to: '/cyber_watch', title: 'Cyber Watch', keywords: 'cve ransomware watch rules matches' },
    { to: '/cyber_watch?tab=cves', title: 'Cyber Watch · CVEs', keywords: 'vulnerabilities severity cvss' },
    { to: '/cyber_watch?tab=ransomware', title: 'Cyber Watch · Ransomware victims', keywords: 'leaks groups countries' },
    { to: '/cyber_watch?tab=insights', title: 'Cyber Watch · Insights', keywords: 'charts statistics' },
    { to: '/data_leak', title: 'Data Leak', keywords: 'leaks paste alerts' },
    { to: '/data_leak?tab=patterns', title: 'Data Leak · Search patterns', keywords: 'keywords regex templates' },
    { to: '/data_leak?tab=insights', title: 'Data Leak · Insights', keywords: 'charts statistics sources' },
    { to: '/dns_finder', title: 'DNS Threats', keywords: 'typosquatting look-alike certstream dnstwist takeover' },
    { to: '/dns_finder?tab=domains', title: 'DNS Threats · Monitored domains', keywords: 'assets' },
    { to: '/dns_finder?tab=keywords', title: 'DNS Threats · Certificate keywords', keywords: 'certificates transparency' },
    { to: '/dns_finder?tab=insights', title: 'DNS Threats · Insights', keywords: 'charts statistics' },
    { to: '/website_monitoring', title: 'Website Monitoring', keywords: 'sites malicious udrp takedown' },
    { to: '/website_monitoring?tab=changes', title: 'Website Monitoring · Changes', keywords: 'alerts ip mx content' },
    { to: '/website_monitoring?tab=pages', title: 'Website Monitoring · Pages', keywords: 'monitored pages versions diff screenshots' },
    { to: '/website_monitoring?tab=insights', title: 'Website Monitoring · Insights', keywords: 'charts statistics' },
    { to: '/legitimate_domains', title: 'Legitimate Domains', keywords: 'assets expiry registrar ssl', public: true },
    { to: '/activity', title: 'Activity', keywords: 'history timeline audit who changed' },
    { to: '/connectors', title: 'Connectors', keywords: 'integrations thehive misp slack smtp notifications health', superuser: true },
    { to: '/connectors?tab=notifications', title: 'Connectors · Notifications', keywords: 'messages channels slack email', superuser: true },
    { to: '/profile', title: 'My profile', keywords: 'account avatar password', public: false },
    { to: '/profile?tab=appearance', title: 'My profile · Appearance', keywords: 'theme colors dark light', public: false },
];

export function buildCommands(ctx: CommandContext): Command[] {
    const pages: Command[] = PAGES.filter((p) => (ctx.signedIn || p.public) && (!p.superuser || ctx.superuser)).map((p) => ({
        id: `page-${p.to}`,
        group: 'Go to',
        title: p.title,
        keywords: p.keywords,
        run: () => ctx.navigate(p.to),
    }));

    const actions: Command[] = [
        { id: 'docs', group: 'Actions', title: 'Documentation', hint: 'The user and admin guide', keywords: 'help guide manual', run: () => window.open(ctx.docsUrl, '_blank', 'noopener,noreferrer') },
        { id: 'api-docs', group: 'Actions', title: ctx.apiDocsLabel, hint: 'The API documentation', keywords: 'api swagger openapi', run: () => window.open(ctx.apiDocsUrl, '_blank', 'noopener,noreferrer') },
    ];
    if (ctx.signedIn) actions.push({ id: 'logout', group: 'Actions', title: 'Sign out', hint: 'End your session', keywords: 'logout log out exit', run: ctx.logout });

    const themes: Command[] = (Object.entries(THEMES) as [ThemeName, (typeof THEMES)[ThemeName]][])
        .filter(([name]) => name !== ctx.themeName)
        .map(([name, def]) => ({
            id: `theme-${name}`,
            group: 'Themes' as const,
            title: `Theme: ${def.label}`,
            hint: def.dark ? 'Dark' : 'Light',
            keywords: `theme appearance ${def.dark ? 'dark night' : 'light day'}`,
            run: () => ctx.setTheme(name),
        }));

    // Only offered while a theme with a backdrop (Clay) is in use, and not the level already set
    const effects: Command[] = ctx.ambient
        ? EFFECT_NAMES.filter((level) => level !== ctx.effects).map((level) => ({
              id: `effects-${level}`,
              group: 'Actions' as const,
              title: `Background effects: ${EFFECTS[level].label}`,
              hint: EFFECTS[level].description,
              keywords: 'animation motion backdrop calm full off performance',
              run: () => ctx.setEffects(level),
          }))
        : [];

    return [...pages, ...actions, ...effects, ...themes];
}

const norm = (text: string) =>
    text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');

/** 0: the title starts with the text, 1: a word of it does, 2: the text is inside, 3: only the keywords have it, -1: no match. */
function rank(command: Command, query: string): number {
    const title = norm(command.title);
    if (title.startsWith(query)) return 0;
    if (title.split(/[\s·-]+/).some((word) => word.startsWith(query))) return 1;
    if (title.includes(query)) return 2;
    return norm(command.keywords).includes(query) ? 3 : -1;
}

/** How many commands the window shows with no text typed, and while typing. */
const IDLE_LIMIT = 8;
const TYPED_LIMIT = 6;

/**
 * The commands that answer the text. With no text, the pages people open most and the actions; the themes are only
 * offered when something is typed, otherwise ten of them would fill the window.
 */
export function matchCommands(commands: Command[], text: string): Command[] {
    const query = norm(text.trim());
    if (!query) {
        const pages = commands.filter((c) => c.group === 'Go to').slice(0, IDLE_LIMIT);
        return [...pages, ...commands.filter((c) => c.group === 'Actions')];
    }
    return commands
        .map((command) => ({ command, rank: rank(command, query) }))
        .filter((entry) => entry.rank >= 0)
        .sort((a, b) => a.rank - b.rank)
        .slice(0, TYPED_LIMIT)
        .map((entry) => entry.command);
}
