// What a visitor (not signed in) sees: the open modules, and the others locked, in the menu, on the Overview, on their own page and
// on the sign-in page. The locked pages call no API. All API calls are mocked.
describe('Visitor', () => {
  const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString().slice(0, 19);
  const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const series = (f) => Array.from({ length: 30 }, (_, i) => ({ date: day(i - 29), ...f(i) }));
  const page = (results) => ({ count: results.length, next: null, previous: null, results });
  const LOCKED = [
    { to: '/cyber_watch', label: 'Cyber Watch' },
    { to: '/data_leak', label: 'Data Leak' },
    { to: '/dns_finder', label: 'DNS Threats' },
    { to: '/website_monitoring', label: 'Website Monitoring' },
    { to: '/activity', label: 'Activity' },
  ];
  const CYBER = {
    cves: { total: 10, critical7d: 2, newToday: 1, new7d: 5, archived: 0, matched: 0, bySeverity: { CRITICAL: 2 }, perDay: series(() => ({ count: 1 })) },
    victims: { total: 20, newToday: 2, new7d: 9, archived: 0, matched: 0, groups: 4, activeGroups7d: 3, perDay: series(() => ({ count: 1 })), topGroups: [], topSectors: [], byCountry: [] },
  };
  const THREATS = {
    totalWords: 6, newToday: 2, newThisWeek: 6, totalSources: 217, failingSources: 0, bannedWords: 10, monitoredKeywords: 2, monitoredSeen: 1,
    monitoredByLevel: {}, topWords: [], wordsPerDay: series(() => ({ count: 1 })), articlesPerDay: series(() => ({ count: 3 })), sourcesByCountry: [], sourcesByConfidence: {},
  };

  const visit = (hash) => {
    cy.on('uncaught:exception', () => false);
    cy.intercept('GET', '/api/auth/user', { statusCode: 401, body: { detail: 'Authentication credentials were not provided.' } });
    cy.intercept('GET', '/api/config/', { statusCode: 200, body: {} });
    cy.intercept('GET', '/api/threats_watcher/source/statistics/', { statusCode: 200, body: THREATS });
    cy.intercept('GET', '/api/threats_watcher/trendyword/graph/?*', { statusCode: 200, body: { nodes: [], links: [] } });
    cy.intercept('GET', '/api/threats_watcher/summary/?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '/api/cyber_watch/statistics/', { statusCode: 200, body: CYBER });
    cy.intercept('GET', '/api/cyber_watch/cves/?*', { statusCode: 200, body: page([]) }).as('cves');
    cy.intercept('GET', '/api/cyber_watch/ransomware/victims/?*', { statusCode: 200, body: page([]) }).as('victims');
    cy.intercept('GET', '/api/common/legitimate_domains/statistics/', { statusCode: 200, body: { total: 30, expired: 1, expiringSoon: 2, sslExpiringSoon: 1, repurchased: 0 } });
    cy.intercept('GET', /\/api\/(data_leak|dns_finder|site_monitoring|timeline|connectors)\//, { statusCode: 401, body: { detail: 'Authentication credentials were not provided.' } }).as('private');
    cy.visit(hash);
  };

  describe('the menu', () => {
    beforeEach(() => {
      visit('/#/');
      cy.get('[data-testid="week-hero"]', { timeout: 20000 });
    });

    it('lists every module: the open ones, then the others locked under "With an account"', () => {
      cy.get('nav[aria-label="Main navigation"]').within(() => {
        cy.get('[aria-label="Threats Watcher"]').should('exist');
        cy.get('[aria-label="Legitimate Domains"]').should('exist');
        cy.get('[data-testid="locked-nav"]').should('contain', 'With an account').within(() => {
          cy.get('a').should('have.length', LOCKED.length);
          LOCKED.forEach(({ label }) => cy.get(`[aria-label="${label}"] .rail-lock`).should('exist'));
        });
        cy.get('[aria-label="Connectors"]').should('not.exist');
      });
    });

    it('opens the presentation of a locked module from the menu', () => {
      cy.get('[data-testid="locked-nav"] [aria-label="Data Leak"]').click();
      cy.location('hash').should('eq', '#/data_leak');
      cy.get('[data-testid="locked-module"]').should('contain', 'Data Leak').and('contain', 'With an account');
    });
  });

  describe('the Overview', () => {
    beforeEach(() => {
      visit('/#/');
      cy.get('[data-testid="week-hero"]', { timeout: 20000 });
    });

    it('shows a locked card for each module that needs an account', () => {
      cy.get('[data-testid="locked-modules-row"]').should('contain', 'More with an account').within(() => {
        cy.get('[data-testid^="locked-card-"]').should('have.length', LOCKED.length);
        LOCKED.forEach(({ label }) => cy.contains(label).should('be.visible'));
      });
    });

    it('opens the presentation from a card', () => {
      cy.get('[data-testid="locked-card-dns_finder"]').click();
      cy.location('hash').should('eq', '#/dns_finder');
      cy.get('[data-testid="locked-module"]').should('contain', 'DNS Threats');
    });

    it('asks for the top five CVEs only, and for no list of victims', () => {
      cy.get('@victims.all').should('have.length', 0);
      cy.get('@cves.all').then((calls) => {
        calls.forEach((call) => expect(new URL(call.request.url).searchParams.get('page_size')).to.eq('5'));
      });
    });
  });

  describe('a locked module, by its address', () => {
    LOCKED.forEach(({ to, label }) => {
      it(`${label} presents itself instead of the page, and asks for nothing private`, () => {
        visit(`/#${to}`);
        cy.get('[data-testid="locked-module"]', { timeout: 20000 }).should('contain', label).and('contain', 'Sign in to open it');
        cy.get('[data-testid="locked-module"] li').should('have.length', 3);
        cy.get('@private.all').should('have.length', 0);
        cy.get('@victims.all').should('have.length', 0);
      });
    });

    it('leads to the sign-in page, and shows it is the module that waits', () => {
      visit('/#/website_monitoring');
      cy.get('[data-testid="locked-sign-in"]', { timeout: 20000 }).click();
      cy.location('hash').should('eq', '#/login');
      cy.get('input[autocomplete="username"]').should('be.visible');
    });
  });

  describe('the sign-in page', () => {
    beforeEach(() => visit('/#/login'));

    it('only says that Watcher answers: no figure of what the instance watches', () => {
      cy.get('[role="status"]', { timeout: 20000 }).should('contain', 'Watcher is reachable').and('not.contain', 'sources').and('not.contain', 'trending');
    });

    it('has one short link to the open pages, and no list of modules', () => {
      cy.get('[data-testid="login-browse"]').should('contain', 'Browse without signing in').and('have.attr', 'href', '#/');
      cy.contains('With an account').should('not.exist');
    });
  });

  describe('signed in', () => {
    it('shows no locked entry and no locked card', () => {
      cy.on('uncaught:exception', () => false);
      cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: { id: 1, username: 'analyst', first_name: 'Ana', last_name: 'Lyst', email: '', is_superuser: true, is_staff: false, groups: [], permissions: [] } });
      cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: 'bootstrap', preferences: {}, avatar_color: null } });
      cy.intercept('GET', '/api/config/', { statusCode: 200, body: {} });
      cy.intercept('GET', '/api/threats_watcher/**', { statusCode: 200, body: page([]) });
      cy.intercept('GET', '/api/threats_watcher/source/statistics/', { statusCode: 200, body: THREATS });
      cy.intercept('GET', '/api/cyber_watch/statistics/', { statusCode: 200, body: CYBER });
      cy.intercept('GET', '/api/cyber_watch/**', { statusCode: 200, body: page([]) });
      cy.intercept('GET', '/api/common/**', { statusCode: 200, body: page([]) });
      cy.intercept('GET', /\/api\/(data_leak|dns_finder|site_monitoring|timeline|connectors)\//, { statusCode: 200, body: page([]) });
      cy.visit('/#/', { onBeforeLoad: (win) => win.localStorage.setItem('token', 'mock-token-visitor') });
      cy.contains('h1', 'Overview', { timeout: 20000 });
      cy.get('[data-testid="locked-nav"]').should('not.exist');
      cy.get('[data-testid="locked-modules-row"]').should('not.exist');
      cy.get('nav[aria-label="Main navigation"] [aria-label="Data Leak"]').should('exist').find('.rail-lock').should('not.exist');
    });
  });
});
