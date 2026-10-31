// Dashboard (home page): attention cards linking to each module, word cloud and word graph (issue #334), world map
// layers, latest CVEs and victims, anonymous view and the old Threats Watcher links. All API calls are mocked.
describe('Dashboard', () => {
  const USER = { id: 1, username: 'analyst', first_name: 'Ana', last_name: 'Lyst', email: '', is_superuser: true, is_staff: false, groups: [], permissions: [] };
  const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString().slice(0, 19);
  const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const series = (f) => Array.from({ length: 30 }, (_, i) => ({ date: day(i - 29), ...f(i) }));
  const page = (results) => ({ count: results.length, next: null, previous: null, results });

  const NODES = ['microsoft', 'adobe', 'apple', 'lockbit', 'citrix', 'ivanti'].map((name, i) => ({ id: i + 1, name, occurrences: 30 - i * 4, score: 70, posts_count: 10 }));
  const GRAPH = { nodes: NODES, links: [{ source: 1, target: 2, weight: 3 }, { source: 1, target: 3, weight: 2 }, { source: 5, target: 6, weight: 1 }] };
  const THREATS = {
    totalWords: 6, newToday: 2, newThisWeek: 6, totalSources: 217, failingSources: 3, bannedWords: 10, monitoredKeywords: 2, monitoredSeen: 1,
    monitoredByLevel: {}, topWords: [], wordsPerDay: series(() => ({ count: 1 })), articlesPerDay: series(() => ({ count: 3 })),
    sourcesByCountry: [{ code: 'FR', country: 'France', count: 40 }, { code: 'US', country: 'United States', count: 80 }], sourcesByConfidence: {},
  };
  const CYBER = {
    cves: { total: 10, critical7d: 2, newToday: 1, new7d: 5, archived: 0, matched: 1, bySeverity: {}, perDay: series(() => ({ count: 1 })) },
    victims: {
      total: 20, newToday: 2, new7d: 9, archived: 0, matched: 1, groups: 4, activeGroups7d: 3, perDay: series(() => ({ count: 1 })), topGroups: [], topSectors: [], topCountries: [],
      byCountry: [{ name: 'US', count: 12 }, { name: 'DE', count: 5 }, { name: 'FR', count: 3 }],
    },
    hits: { open: 7, openCve: 4, openVictims: 3, new7d: 5, archived: 2, perDay: series(() => ({ count: 0 })) },
  };
  const CVES = [{ id: 1, cve_id: 'CVE-2026-1001', description: 'Fortinet FortiOS heap overflow', cvss_score: 9.8, severity: 'CRITICAL', published: ago(60), references: [], fetched_at: ago(50), is_archived: false, hits_count: 1 }];
  const VICTIMS = [{ id: 11, group: 7, group_name: 'akira', victim_name: 'Clinique du Nord', country: 'FR', sector: 'Healthcare', attacked_at: ago(300), url: '', fetched_at: ago(290), is_archived: false, hits_count: 0 }];

  const mockPublic = () => {
    cy.intercept('GET', '/api/threats_watcher/source/statistics/', { statusCode: 200, body: THREATS });
    cy.intercept('GET', '/api/threats_watcher/trendyword/graph/?*', { statusCode: 200, body: GRAPH }).as('graph');
    cy.intercept('GET', '/api/threats_watcher/summary/?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '/api/cyber_watch/statistics/', { statusCode: 200, body: CYBER });
    cy.intercept('GET', '/api/cyber_watch/cves/?*', { statusCode: 200, body: page(CVES) });
    cy.intercept('GET', '/api/cyber_watch/ransomware/victims/?*', { statusCode: 200, body: page(VICTIMS) });
    cy.intercept('GET', '/api/common/legitimate_domains/statistics/', { statusCode: 200, body: { total: 30, expiringSoon: 2, sslExpiringSoon: 1 } });
  };

  describe('signed in', () => {
    beforeEach(() => {
      cy.on('uncaught:exception', () => false);
      cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: USER });
      cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: 'bootstrap', preferences: {}, avatar_color: null } });
      mockPublic();
      cy.intercept('GET', '/api/data_leak/keyword/statistics/', { statusCode: 200, body: { activeAlerts: 4 } });
      cy.intercept('GET', '/api/dns_finder/dns_monitored/statistics/', { statusCode: 200, body: { openAlerts: 12 } });
      cy.intercept('GET', '/api/site_monitoring/site/statistics/', { statusCode: 200, body: { openAlerts: 5 } });
      cy.intercept('GET', '/api/common/pending_actions/count/', { statusCode: 200, body: { count: 1 } });
      // Pages the dashboard links to.
      cy.intercept('GET', '/api/threats_watcher/trendyword/?*', { statusCode: 200, body: page([]) });
      cy.intercept('GET', '/api/threats_watcher/trendyword/1/', { statusCode: 200, body: { ...NODES[0], created_at: ago(30), posts: [], monitored: false } });
      cy.intercept('GET', '/api/cyber_watch/cves/1/', { statusCode: 200, body: CVES[0] });
      cy.intercept('GET', '/api/cyber_watch/watch-rule-hits/?*', { statusCode: 200, body: page([]) });
      cy.visit('/#/', { onBeforeLoad: (win) => win.localStorage.setItem('token', 'mock-token-dashboard') });
      cy.contains('h1', 'Dashboard', { timeout: 20000 });
    });

    it('shows what needs attention in every module and links to it', () => {
      cy.get('[aria-label="Needs attention"] button').should('have.length', 6);
      cy.contains('button', 'Cyber Watch matches').should('contain', '7').click();
      cy.location('hash').should('eq', '#/cyber_watch');
    });

    it('opens a word from the cloud, and switches to the word graph', () => {
      cy.get('[data-testid="word-cloud"] [aria-label^="microsoft,"]').click();
      cy.location('hash').should('eq', '#/threats_watcher?word=1');
      cy.visit('/#/', { onBeforeLoad: (win) => win.localStorage.setItem('token', 'mock-token-dashboard') });
      cy.get('button[aria-label="Words linked by their articles"]').click();
      cy.get('[data-testid="word-graph"] canvas').should('exist');
    });

    it('tells how many times a word was caught when hovering it in the cloud', () => {
      cy.get('[data-testid="word-cloud"] [aria-label^="microsoft,"]').trigger('mouseover');
      cy.get('[role="tooltip"]').should('contain', 'The word "microsoft" caught 30 times.');
    });

    it('shows the world map layers and opens a country', () => {
      cy.get('[data-testid="world-map"]').should('have.attr', 'aria-label').and('include', '20 ransomware victims');
      cy.contains('button', /^Sources$/).click();
      cy.get('[data-testid="world-map"]').should('have.attr', 'aria-label').and('include', 'RSS sources');
    });

    it('lists the latest CVEs and victims', () => {
      cy.get('[data-testid="dashboard-cves"]').should('contain', 'CVE-2026-1001').contains('CVE-2026-1001').click();
      cy.location('hash').should('include', '/cyber_watch').and('include', 'cve=1');
    });

    it('sends the old Threats Watcher links to its new page', () => {
      cy.visit('/#/?tab=sources', { onBeforeLoad: (win) => win.localStorage.setItem('token', 'mock-token-dashboard') });
      cy.location('hash').should('eq', '#/threats_watcher?tab=sources');
    });
  });

  it('shows the public figures to an anonymous visitor', () => {
    cy.on('uncaught:exception', () => false);
    cy.intercept('GET', '/api/auth/user', { statusCode: 401, body: { detail: 'Authentication credentials were not provided.' } });
    mockPublic();
    cy.visit('/#/');
    cy.get('[aria-label="Key figures"]', { timeout: 20000 }).should('exist');
    cy.get('[aria-label="Needs attention"]').should('not.exist');
  });
});
