// Threats Watcher (home page): trends (briefing, KPI quick filters, word cloud, word drawer with the AI summary, monitor /
// ban / delete), monitored keywords, RSS sources (bulk reliability), banned words, Insights and the anonymous view.
// All API calls are mocked.
describe('Threats Watcher', () => {
  const USER = { id: 1, username: 'analyst', first_name: 'Ana', last_name: 'Lyst', email: '', is_superuser: true, is_staff: false, groups: [], permissions: [] };
  const API = '/api/threats_watcher/';
  const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString().slice(0, 19);
  const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  const NAMES = ['lockbit', 'ivanti', 'cve-2026-1234', 'phishing', 'fortinet', 'akira', 'citrix', 'ransomware', 'botnet', 'apt29', 'zero-day', 'exchange'];
  const WORDS = NAMES.map((name, i) => ({ id: i + 1, name, occurrences: 40 - i * 3, score: [100, 74, 50, 20][i % 4], created_at: ago(i * 500), posts_count: 40 - i * 3 }));
  const POSTS = Array.from({ length: 6 }, (_, i) => ({ url: `https://www.cert.example/advisory-${i}`, created_at: ago(i * 1500) }));
  const KEYWORDS = [
    { id: 1, name: 'acme', level: 'hot', level_display: 'Hot', threshold: 3, last_seen: ago(90), occurrences: 4, posts_count: 4, created_at: ago(20000), last_event: null },
    { id: 2, name: 'acme-corp', level: 'warm', level_display: 'Warm', threshold: 1, last_seen: null, occurrences: 0, posts_count: 0, created_at: ago(9000), last_event: null },
  ];
  const SOURCES = [
    { id: 1, url: 'https://www.cert.ssi.gouv.fr/feed/', confident: 1, country: 'France', country_code: 'FR', last_status_code: 200, last_checked: ago(20), created_at: ago(50000), last_event: null },
    { id: 2, url: 'https://blog.example.com/rss', confident: 3, country: 'United States', country_code: 'US', last_status_code: 404, last_checked: ago(20), created_at: ago(30000), last_event: null },
    { id: 3, url: 'https://news.example.org/feed', confident: 2, country: 'Germany', country_code: 'DE', last_status_code: null, last_checked: null, created_at: ago(10), last_event: null },
  ];
  const BANNED = [{ id: 1, name: 'newsletter', created_at: ago(5000), last_event: null }];
  const STATS = {
    totalWords: 12, newToday: 2, newThisWeek: 7, totalSources: 3, failingSources: 1, bannedWords: 1, monitoredKeywords: 2, monitoredSeen: 1,
    monitoredByLevel: { hot: 1, warm: 1 }, topWords: WORDS.slice(0, 8).map(({ name, occurrences }) => ({ name, occurrences })),
    wordsPerDay: Array.from({ length: 30 }, (_, i) => ({ date: day(i - 29), count: i % 4 })),
    articlesPerDay: Array.from({ length: 30 }, (_, i) => ({ date: day(i - 29), count: 20 + (i % 7) * 5 })),
    sourcesByCountry: [{ code: 'FR', country: 'France', count: 1 }, { code: 'US', country: 'United States', count: 1 }, { code: 'DE', country: 'Germany', count: 1 }],
    sourcesByConfidence: { 1: 1, 2: 1, 3: 1 },
  };
  // Same shape as summary_manager.py: one "• summary" line per topic, then an indented line of details.
  const WEEKLY = {
    id: 1, type: 'weekly_summary', keywords: '', created_at: ago(3000), updated_at: ago(3000),
    summary_text: [
      '• Ivanti patched an actively exploited flaw in Connect Secure that lets attackers run code without signing in.',
      '  Products: Connect Secure, Policy Secure | CVEs: CVE-2026-1234 (https://nvd.nist.gov/vuln/detail/CVE-2026-1234)',
      '',
      '• LockBit claimed attacks on three hospitals this week.',
      '  Threat actors: LockBit',
      '',
      '• A phishing campaign abuses fake invoices to spread a loader.',
    ].join('\n'),
  };
  const BREAKING = { id: 2, type: 'breaking_news', keywords: 'ivanti', summary_text: 'Ivanti zero-day exploited in the wild.', created_at: ago(60), updated_at: ago(60) };
  const WORD_SUMMARY = { id: 3, type: 'trendy_word_summary', keywords: 'lockbit', summary_text: 'LockBit claimed three new victims.', created_at: ago(1), updated_at: ago(1) };
  const page = (results) => ({ count: results.length, next: null, previous: null, results });
  // `cy.wait` hands back the first request nobody waited for yet (the page load); a filter is checked on the last one.
  const expectLastRequest = (alias, text) => cy.get(`@${alias}.all`).should((calls) => expect(calls.at(-1).request.url).to.include(text));
  // Set once the word summary is written, from then on the summaries list returns it.
  let summarized = false;

  const mockApi = () => {
    summarized = false;
    cy.intercept('GET', `${API}trendyword/?*`, { statusCode: 200, body: page(WORDS) }).as('words');
    cy.intercept('GET', `${API}trendyword/1/`, { statusCode: 200, body: { ...WORDS[0], posts: POSTS, monitored: false } });
    cy.intercept('GET', `${API}summary/?*`, (req) => {
      const byType = { weekly_summary: [WEEKLY], breaking_news: [BREAKING] };
      req.reply({ statusCode: 200, body: summarized ? [WORD_SUMMARY] : (byType[req.query.type] ?? []) });
    });
    cy.intercept('GET', `${API}monitored-keywords/?*`, { statusCode: 200, body: page(KEYWORDS) }).as('keywords');
    cy.intercept('GET', `${API}monitored-keywords/1/`, { statusCode: 200, body: { ...KEYWORDS[0], posts: POSTS.slice(0, 4) } });
    cy.intercept('GET', `${API}source/?*`, { statusCode: 200, body: page(SOURCES) }).as('sources');
    // Declared after the list: `source/?*` also matches `source/statistics/`, and the last intercept wins.
    cy.intercept('GET', `${API}source/statistics/`, { statusCode: 200, body: STATS });
    cy.intercept('GET', `${API}source/2/`, { statusCode: 200, body: SOURCES[1] });
    cy.intercept('GET', `${API}bannedword/?*`, { statusCode: 200, body: page(BANNED) });
    cy.intercept('GET', '/api/timeline/events/?*', { statusCode: 200, body: [] });
  };

  describe('signed in', () => {
    beforeEach(() => {
      cy.on('uncaught:exception', () => false);
      cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: USER });
      cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: 'bootstrap', preferences: {}, avatar_color: null } });
      mockApi();
      cy.visit('/#/threats_watcher', { onBeforeLoad: (win) => win.localStorage.setItem('token', 'mock-token-threats') });
      cy.get('[data-testid="word-row"]', { timeout: 20000 }).should('have.length', 12);
    });

    it('shows the breaking news and the weekly digest, with real links only', () => {
      cy.get('[data-testid="breaking-news"]').should('contain', 'Ivanti zero-day exploited in the wild.');
      cy.get('[data-testid="weekly-summary"]').within(() => {
        cy.contains('a', 'CVE-2026-1234').should('have.attr', 'href', 'https://nvd.nist.gov/vuln/detail/CVE-2026-1234');
        cy.get('li').should('have.length', 2);
        cy.contains('button', 'Read the whole digest - 3 topics').click();
        cy.get('li').should('have.length', 3);
      });
    });

    it('filters from the KPI cards and the search, all kept in the URL', () => {
      cy.contains('button', 'New today').click();
      expectLastRequest('words', 'period=today');
      cy.location('hash').should('include', 'period=today');
      cy.contains('button', 'Trending words').click();
      cy.location('hash').should('not.include', 'period=');
      cy.get('input[aria-label="Search words"]').type('lock');
      expectLastRequest('words', 'search=lock');
    });

    it('opens a word from the cloud, writes its summary, then monitors and bans it', () => {
      cy.intercept('GET', `${API}summary/by-keyword/lockbit/`, (req) => {
        summarized = true;
        req.reply({ statusCode: 200, body: WORD_SUMMARY });
      }).as('summarize');
      cy.intercept('POST', `${API}monitored-keywords/`, (req) => req.reply({ statusCode: 201, body: { ...KEYWORDS[1], id: 9, ...req.body } })).as('monitor');
      cy.intercept('POST', `${API}trendyword/1/ban/`, { statusCode: 200, body: { detail: 'banned' } }).as('ban');
      cy.get('[data-testid="word-cloud"] [aria-label^="lockbit,"]').click();
      cy.location('hash').should('include', 'word=1');
      cy.get('.MuiDrawer-paper').within(() => {
        cy.get('[data-testid="word-articles"] a').should('have.length', 6);
        cy.get('[data-testid="mentions-chart"] svg').should('exist');
        cy.contains('button', 'Summarize the articles').click();
      });
      cy.wait('@summarize');
      cy.get('.MuiDrawer-paper').should('contain', 'LockBit claimed three new victims.');
      cy.get('.MuiDrawer-paper').contains('button', 'Monitor').click();
      cy.wait('@monitor').its('request.body').should('deep.equal', { name: 'lockbit', level: 'warm' });
      cy.get('.MuiDrawer-paper').contains('button', 'Ban').click();
      cy.contains('[role="dialog"]', 'Ban “lockbit”?').contains('button', /^Ban$/).click();
      cy.wait('@ban');
      cy.location('hash').should('not.include', 'word=');
    });

    it('filters, opens and adds monitored keywords', () => {
      cy.intercept('POST', `${API}monitored-keywords/`, (req) => req.reply({ statusCode: 201, body: { ...KEYWORDS[1], id: 9, ...req.body } })).as('add');
      cy.contains('[role="tab"]', 'Monitored keywords').click();
      cy.get('[data-testid="keyword-row"]').should('have.length', 2).first().should('contain', 'Hot');
      cy.get('[role="combobox"]').eq(0).click();
      cy.contains('[role="option"]', 'Hot').click();
      expectLastRequest('keywords', 'level=hot');
      cy.location('hash').should('include', 'klevel=hot');
      cy.contains('button', 'Clear').click();
      cy.get('[data-testid="keyword-row"]').first().click();
      cy.location('hash').should('include', 'keyword=1');
      cy.get('[data-testid="keyword-articles"] a').should('have.length', 4);
      cy.get('body').type('{esc}');
      cy.contains('button', /^Add$/).click();
      cy.contains('[role="menuitem"]', 'Monitored keywords').click();
      cy.location('hash').should('include', 'dialog=add-keyword');
      cy.get('[role="dialog"]').within(() => {
        cy.get('input[name="name"]').type('acme-labs');
        cy.contains('button', 'Super hot').click();
        cy.contains('button', /^Add$/).click();
      });
      cy.wait('@add').its('request.body').should('deep.equal', { name: 'acme-labs', level: 'super_hot' });
    });

    it('lists the sources with their reliability and changes it in bulk', () => {
      cy.intercept('POST', `${API}source/bulk_update/`, (req) =>
        req.reply({ statusCode: 200, body: { succeeded: 2, skipped: 0, errors: 0, ok_status: 'updated', results: req.body.ids.map((id) => ({ value: String(id), status: 'updated', reason: '', id })) } }),
      ).as('bulkUpdate');
      cy.contains('[role="tab"]', 'Sources').click();
      // 1 is the most reliable source (core.get_confidence_score).
      cy.get('[data-testid="source-row"]').eq(0).should('contain', 'cert.ssi.gouv.fr').and('contain', 'High - 100%').and('contain', 'OK');
      cy.get('[data-testid="source-row"]').eq(1).should('contain', 'Low - 20%').and('contain', 'HTTP 404');
      cy.get('[role="combobox"]').eq(1).click();
      cy.contains('[role="option"]', 'Failing').click();
      expectLastRequest('sources', 'status=failing');
      cy.contains('button', 'Clear').click();
      cy.get('[data-testid="source-row"]').eq(0).find('input[type="checkbox"]').check();
      cy.get('[data-testid="source-row"]').eq(1).find('input[type="checkbox"]').check();
      cy.contains('button', 'Set reliability…').click();
      cy.contains('[role="menuitem"]', 'Medium').click();
      cy.wait('@bulkUpdate').its('request.body').should('deep.equal', { ids: [1, 2], changes: { confident: 2 } });
    });

    it('unbans a word', () => {
      cy.intercept('DELETE', `${API}bannedword/1/`, { statusCode: 204 }).as('unban');
      cy.contains('[role="tab"]', 'Banned words').click();
      cy.get('[data-testid="banned-row"]').first().click();
      cy.get('.MuiDrawer-paper').contains('button', 'Unban').click();
      cy.contains('[role="dialog"]', 'Unban this word?').contains('button', 'Unban').click();
      cy.wait('@unban');
    });

    it('shows the insights and filters from them', () => {
      cy.contains('[role="tab"]', 'Insights').click();
      cy.get('[data-testid="articles-chart"] svg').should('exist');
      cy.get('[data-testid="words-chart"] svg').should('exist');
      cy.get('button[aria-label="Show ivanti in the trends"]').click();
      cy.location('hash').should('include', 'q=ivanti').and('not.include', 'tab=');
      cy.contains('[role="tab"]', 'Insights').click();
      cy.get('button[aria-label="Show the sources of Germany"]').click();
      cy.location('hash').should('include', 'tab=sources').and('include', 'scountry=DE');
    });
  });

  it('is read only for an anonymous visitor', () => {
    cy.on('uncaught:exception', () => false);
    cy.intercept('GET', '/api/auth/user', { statusCode: 401, body: { detail: 'Authentication credentials were not provided.' } });
    mockApi();
    cy.visit('/#/threats_watcher');
    cy.get('[data-testid="word-row"]', { timeout: 20000 }).should('have.length', 12);
    cy.contains('[role="tab"]', 'Banned words').should('not.exist');
    cy.contains('button', /^Add$/).should('not.exist');
    cy.get('[data-testid="word-row"]').first().click();
    cy.get('.MuiDrawer-paper').contains('button', /^(Monitor|Ban|Delete)$/).should('not.exist');
  });
});
