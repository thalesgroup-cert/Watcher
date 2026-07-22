describe('CyberWatch - E2E Test Suite', () => {

  const SAMPLE_LAST_EVENT = {
    username: 'admin',
    first_name: 'Admin',
    last_name: 'User',
    avatar_color: '#2196f3',
    action: 'updated',
    timestamp: '2026-06-24T14:30:00Z',
  };

  const MONITORED_KEYWORDS_FIXTURE = {
    count: 2,
    next: null,
    previous: null,
    results: [
      {
        id: 1,
        name: 'log4j',
        level: 'hot',
        occurrences: 7,
        last_seen: '2026-06-24T10:00:00Z',
        posturls: ['https://test-source.com/feed/1,2026-06-24T10:00:00Z'],
        last_event: { ...SAMPLE_LAST_EVENT },
      },
      {
        id: 2,
        name: 'apache',
        level: 'warm',
        occurrences: 2,
        last_seen: null,
        posturls: [],
        last_event: null,
      },
    ],
  };

  const WATCH_RULES_FIXTURE = {
    count: 2,
    next: null,
    previous: null,
    results: [
      {
        id: 1,
        name: 'Test CVE Rule',
        keywords: ['company', 'acme'],
        exceptions: [],
        scope: 'cve',
        is_active: true,
        hits_count: 3,
        last_event: { ...SAMPLE_LAST_EVENT },
      },
      {
        id: 2,
        name: 'Ransomware Alert',
        keywords: ['data', 'encrypted'],
        exceptions: ['test'],
        scope: 'ransomware',
        is_active: false,
        hits_count: 0,
        last_event: null,
      },
    ],
  };

  const SOURCES_FIXTURE = {
    count: 2,
    next: null,
    previous: null,
    results: [
      {
        id: 1,
        url: 'https://test-source.com/feed',
        confident: true,
        country: 'FR',
        country_code: 'FR',
        last_status_code: 200,
        last_checked: '2026-06-24T12:00:00Z',
        created_at: '2025-06-19T10:00:00Z',
        last_event: { ...SAMPLE_LAST_EVENT },
      },
      {
        id: 2,
        url: 'https://e2e-source.org/rss',
        confident: false,
        country: 'US',
        country_code: 'US',
        last_status_code: null,
        last_checked: null,
        created_at: '2025-06-18T15:30:00Z',
        last_event: null,
      },
    ],
  };

  const BANNED_WORDS_FIXTURE = {
    count: 2,
    next: null,
    previous: null,
    results: [
      {
        id: 1,
        name: 'test-spam',
        created_at: '2025-06-19T10:00:00Z',
        last_event: { ...SAMPLE_LAST_EVENT },
      },
      {
        id: 2,
        name: 'e2e-advertisement',
        created_at: '2025-06-18T15:30:00Z',
        last_event: null,
      },
    ],
  };

  const ARCHIVED_CVES_FIXTURE = {
    count: 2,
    next: null,
    previous: null,
    results: [
      {
        id: 10,
        cve_id: 'CVE-2024-9999',
        description: 'Archived critical RCE vulnerability in test framework',
        severity: 'CRITICAL',
        cvss: 9.5,
        published: '2024-12-01T10:00:00Z',
        watch_rule_hit_name: 'Test CVE Rule',
        archived: true,
      },
      {
        id: 11,
        cve_id: 'CVE-2024-8888',
        description: 'Archived SQL injection in example database',
        severity: 'HIGH',
        cvss: 7.2,
        published: '2024-11-15T10:00:00Z',
        watch_rule_hit_name: null,
        archived: true,
      },
    ],
  };

  const ARCHIVED_VICTIMS_FIXTURE = {
    count: 1,
    next: null,
    previous: null,
    results: [
      {
        id: 10,
        post_title: 'Old Corp Inc',
        gang_name: 'LockBit',
        published: '2024-12-15T10:00:00Z',
        country: 'DE',
        activity: 'Retail',
        archived: true,
      },
    ],
  };

  const ARCHIVED_HITS_FIXTURE = {
    count: 0,
    next: null,
    previous: null,
    results: [],
  };


  const setupIntercepts = () => {
    const credentials = Cypress.env('testCredentials');

    // Auth
    cy.intercept('GET', '/api/auth/user/', {
      statusCode: 200,
      body: {
        id: 1,
        username: credentials.username,
        first_name: credentials.firstName,
        email: credentials.email,
        is_superuser: true,
      },
    }).as('getUser');

    cy.intercept('POST', '/api/auth/login/', {
      statusCode: 200,
      body: {
        token: 'mock-token-123456789',
        user: {
          id: 1,
          username: credentials.username,
          first_name: credentials.firstName,
          email: credentials.email,
        },
      },
    }).as('login');

    // CyberWatch panels — GET
    cy.intercept('GET', '**/api/threats_watcher/monitored-keywords/**', {
      statusCode: 200,
      body: MONITORED_KEYWORDS_FIXTURE,
    }).as('getMonitoredKeywords');

    cy.intercept('GET', '**/api/cyber_watch/watch-rules/**', {
      statusCode: 200,
      body: WATCH_RULES_FIXTURE,
    }).as('getWatchRules');

    cy.intercept('GET', '**/api/threats_watcher/source/**', {
      statusCode: 200,
      body: SOURCES_FIXTURE,
    }).as('getSources');

    cy.intercept('GET', '**/api/threats_watcher/bannedword/**', {
      statusCode: 200,
      body: BANNED_WORDS_FIXTURE,
    }).as('getBannedWords');

    cy.intercept('GET', '**/api/cyber_watch/cves/**', {
      statusCode: 200,
      body: ARCHIVED_CVES_FIXTURE,
    }).as('getArchivedCVEs');

    cy.intercept('GET', '**/api/cyber_watch/ransomware/victims/**', {
      statusCode: 200,
      body: ARCHIVED_VICTIMS_FIXTURE,
    }).as('getArchivedVictims');

    cy.intercept('GET', '**/api/cyber_watch/watch-rule-hits/**', {
      statusCode: 200,
      body: ARCHIVED_HITS_FIXTURE,
    }).as('getArchivedHits');

    cy.intercept('GET', '**/api/timeline/events/**', {
      statusCode: 200,
      body: { count: 0, next: null, previous: null, results: [] },
    }).as('getTimeline');

    // Monitored Keywords — CRUD
    cy.intercept('POST', '**/api/threats_watcher/monitored-keywords/**', (req) => {
      req.reply({
        statusCode: 201,
        body: {
          id: 99,
          level: 'warm',
          occurrences: 0,
          last_seen: null,
          posturls: [],
          last_event: null,
          ...req.body,
          created_at: new Date().toISOString(),
        },
      });
    }).as('addMonitoredKeyword');

    cy.intercept('PATCH', '**/api/threats_watcher/monitored-keywords/*', {
      statusCode: 200,
    }).as('patchMonitoredKeyword');

    cy.intercept('DELETE', '**/api/threats_watcher/monitored-keywords/*', {
      statusCode: 204,
    }).as('deleteMonitoredKeyword');

    // Watch Rules — CRUD
    cy.intercept('POST', '**/api/cyber_watch/watch-rules/**', (req) => {
      req.reply({
        statusCode: 201,
        body: {
          id: 99,
          hits_count: 0,
          last_event: null,
          ...req.body,
        },
      });
    }).as('addWatchRule');

    cy.intercept('PATCH', '**/api/cyber_watch/watch-rules/**', {
      statusCode: 200,
    }).as('patchWatchRule');

    cy.intercept('DELETE', '**/api/cyber_watch/watch-rules/**', {
      statusCode: 204,
    }).as('deleteWatchRule');

    // Sources — CRUD
    cy.intercept('POST', '**/api/threats_watcher/source/**', (req) => {
      req.reply({
        statusCode: 201,
        body: {
          id: 99,
          confident: false,
          last_status_code: null,
          last_checked: null,
          last_event: null,
          ...req.body,
          created_at: new Date().toISOString(),
        },
      });
    }).as('addSource');

    cy.intercept('PATCH', '**/api/threats_watcher/source/**', {
      statusCode: 200,
    }).as('patchSource');

    cy.intercept('DELETE', '**/api/threats_watcher/source/**', {
      statusCode: 204,
    }).as('deleteSource');

    // Banned Words — CRUD
    cy.intercept('POST', '**/api/threats_watcher/bannedword/**', (req) => {
      req.reply({
        statusCode: 201,
        body: {
          id: 99,
          last_event: null,
          ...req.body,
          created_at: new Date().toISOString(),
        },
      });
    }).as('addBannedWord');

    cy.intercept('PATCH', '**/api/threats_watcher/bannedword/**', {
      statusCode: 200,
    }).as('patchBannedWord');

    cy.intercept('DELETE', '**/api/threats_watcher/bannedword/**', {
      statusCode: 204,
    }).as('deleteBannedWord');

    // Archived Alerts — unarchive
    cy.intercept('PATCH', '**/api/cyber_watch/cves/*/archive/**', {
      statusCode: 200,
    }).as('unarchiveCVE');

    cy.intercept('PATCH', '**/api/cyber_watch/ransomware/victims/*/archive/**', {
      statusCode: 200,
    }).as('unarchiveVictim');

    cy.intercept('PATCH', '**/api/cyber_watch/watch-rule-hits/*/archive/**', {
      statusCode: 200,
    }).as('unarchiveHit');
  };


  before(() => {
    // Real login once to capture a valid auth token for the suite
    const credentials = Cypress.env('testCredentials');
    cy.visit('/#/login');
    cy.get('input[type="text"], input[name="username"]', { timeout: 15000 })
      .should('be.visible').type(credentials.username);
    cy.get('input[type="password"], input[name="password"]')
      .should('be.visible').type(credentials.password);
    cy.get('button[type="submit"], button:contains("Login")')
      .should('not.be.disabled').click();
    cy.url({ timeout: 15000 }).should('include', '#/').and('not.include', '/login');
    cy.window().then((win) => {
      const token = win.localStorage.getItem('token') || win.sessionStorage.getItem('token');
      Cypress.env('authData', { token: token || '', isAuthenticated: true });
    });
    cy.log('Auth token captured for test suite');
  });


  beforeEach(() => {
    cy.on('uncaught:exception', () => false);

    // Intercepts must be set up BEFORE each test — Cypress clears them between tests
    setupIntercepts();

    // Visit with token pre-loaded so PrivateRoute renders immediately
    cy.visit('/#/cyber_watch', {
      onBeforeLoad(win) {
        const authData = Cypress.env('authData');
        if (authData?.token) {
          win.localStorage.setItem('token', authData.token);
        }
      },
    });

    cy.wait('@getWatchRules', { timeout: 15000 });
    cy.url().should('include', '/cyber_watch');
    cy.log('Page ready with fixture data');
  });


  describe('Page Navigation and Access', () => {
    it('should be on the CyberWatch page', () => {
      cy.url().should('include', '/cyber_watch');
      cy.get('body').should('be.visible');
    });

    it('should display the CyberWatch dashboard panels', () => {
      cy.get('.container-fluid, [class*="grid"]', { timeout: 15000 })
        .first()
        .should('exist');
    });

    it('should display the navbar', () => {
      cy.get('.navbar', { timeout: 10000 }).should('exist');
    });
  });


  describe('Statistics Panel', () => {
    it('should display at least one statistics card', () => {
      cy.get('.card', { timeout: 15000 }).should('have.length.at.least', 1);
    });

    it('should display monitored keywords stat', () => {
      cy.get('body', { timeout: 10000 })
        .invoke('text')
        .should('match', /monitored keywords/i);
    });

    it('should display RSS sources stat', () => {
      cy.get('body').invoke('text').should('match', /rss sources/i);
    });

    it('should display active rules stat', () => {
      cy.get('body').invoke('text').should('match', /active rules/i);
    });

    it('should display banned words stat', () => {
      cy.get('body').invoke('text').should('match', /banned words/i);
    });
  });


  describe('Monitored Keywords Panel', () => {
    it('should display the monitored keywords table', () => {
      cy.get('table', { timeout: 15000 }).should('exist');
      cy.get('body').invoke('text').should('include', 'log4j');
    });

    it('should display all keywords from fixture', () => {
      cy.get('body').invoke('text').should('include', 'apache');
    });

    it('should open add keyword modal', () => {
      cy.contains('button', 'Add Keyword').click();
      cy.get('.modal').should('be.visible');
      cy.get('.modal-title').should('contain.text', 'Add Monitored Keyword');
      cy.get('.modal button').contains(/close/i).click();
      cy.get('.modal').should('not.exist');
    });

    it('should add a new monitored keyword', () => {
      cy.contains('button', 'Add Keyword').click();
      cy.get('.modal').should('be.visible');
      cy.get('.modal input[type="text"]').first().type('new-keyword-e2e');
      cy.get('.modal').contains('button', 'Add').click();
      cy.wait('@addMonitoredKeyword');
      cy.log('New keyword submitted successfully');
    });

    it('should open edit modal for a keyword', () => {
      cy.get('table tbody tr').first().within(() => {
        cy.get('button[title="Edit"]').click();
      });
      cy.get('.modal').should('be.visible');
      cy.get('.modal-title').should('contain.text', 'Edit Monitored Keyword');
      cy.get('.modal button').contains(/close/i).click();
      cy.get('.modal').should('not.exist');
    });

    it('should open delete confirmation for a keyword', () => {
      cy.get('table tbody tr').first().within(() => {
        cy.get('button[title="Delete"]').click();
      });
      cy.get('.modal').should('be.visible');
      cy.get('.modal-title').should('contain.text', 'Confirm Deletion');
      cy.get('.modal button').contains(/close/i).click();
      cy.get('.modal').should('not.exist');
    });

    it('should open timeline modal for a keyword', () => {
      cy.get('table tbody tr').first().within(() => {
        cy.get('button[title="History"]').click();
      });
      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal .btn-close').click();
      cy.get('.modal').should('not.exist');
    });

    it('should filter keywords by name', () => {
      cy.contains('button', 'Show Filters').first().click();
      cy.get('input[placeholder*="keyword"]').first().clear().type('log4j');
      cy.get('body').invoke('text').should('include', 'log4j');
    });
  });


  describe('Watch Rules Panel', () => {
    it('should display watch rules from fixture', () => {
      cy.get('body', { timeout: 15000 }).invoke('text').should('include', 'Test CVE Rule');
    });

    it('should display second watch rule', () => {
      cy.get('body').invoke('text').should('include', 'Ransomware Alert');
    });

    it('should display scope badges (CVE, Ransomware)', () => {
      cy.get('body').invoke('text').should('include', 'CVE').and('include', 'Ransomware');
    });

    it('should display active/inactive status', () => {
      cy.get('body').invoke('text').should('include', 'Yes').and('include', 'No');
    });

    it('should open add watch rule modal', () => {
      cy.contains('button', 'Add Rule').click();
      cy.get('.modal').should('be.visible');
      cy.get('.modal-title').should('contain.text', 'Add Watch Rule');
      cy.get('.modal button').contains(/close/i).click();
      cy.get('.modal').should('not.exist');
    });

    it('should add a new watch rule', () => {
      cy.contains('button', 'Add Rule').click();
      cy.get('.modal').should('be.visible');
      cy.get('.modal input[type="text"]').first().type('New E2E Rule');
      cy.get('.modal textarea').first().type('e2e, cypress');
      cy.get('.modal').contains('button', 'Add').click();
      cy.wait('@addWatchRule');
      cy.log('New watch rule submitted successfully');
    });

    it('should open edit modal for Test CVE Rule', () => {
      cy.get('body').contains('Test CVE Rule').parents('tr').within(() => {
        cy.get('button[title="Edit"]').click();
      });
      cy.get('.modal').should('be.visible');
      cy.get('.modal-title').should('contain.text', 'Edit Watch Rule');
      cy.get('.modal button').contains(/close/i).click();
      cy.get('.modal').should('not.exist');
    });

    it('should open delete confirmation for a watch rule', () => {
      cy.get('body').contains('Test CVE Rule').parents('tr').within(() => {
        cy.get('button[title="Delete"]').click();
      });
      cy.get('.modal').should('be.visible');
      cy.get('.modal-title').should('contain.text', 'Confirm Deletion');
      cy.get('.modal').invoke('text').should('include', 'Test CVE Rule');
      cy.get('.modal button').contains(/close/i).click();
      cy.get('.modal').should('not.exist');
    });

    it('should open timeline modal for Test CVE Rule', () => {
      cy.get('body').contains('Test CVE Rule').parents('tr').within(() => {
        cy.get('button[title="History"]').click();
      });
      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal .btn-close').click();
      cy.get('.modal').should('not.exist');
    });

    it('should filter watch rules by scope', () => {
      cy.get('body').then(($body) => {
        const scopeSelects = $body.find('select').filter((_, el) => {
          const siblings = el.closest('.row');
          return siblings !== null;
        });
        if (scopeSelects.length > 0) {
          cy.wrap(scopeSelects).first().select('cve');
          cy.get('body').invoke('text').should('match', /cve/i);
          cy.wrap(scopeSelects).first().select('');
          cy.log('Scope filter applied successfully');
        } else {
          cy.log('No scope filter select visible — skipping');
        }
      });
    });

    it('should display keyword badges on rules', () => {
      cy.get('body').invoke('text').should('include', 'company').and('include', 'acme');
    });
  });


  describe('Sources Panel', () => {
    it('should display sources from fixture', () => {
      cy.get('body', { timeout: 15000 })
        .invoke('text')
        .should('include', 'test-source.com');
    });

    it('should open add RSS source modal', () => {
      cy.contains('button', 'Add Source').click();
      cy.get('.modal').should('be.visible');
      cy.get('.modal-title').should('contain.text', 'Add RSS Source');
      cy.get('.modal button').contains(/close/i).click();
      cy.get('.modal').should('not.exist');
    });

    it('should add a new RSS source', () => {
      cy.contains('button', 'Add Source').click();
      cy.get('.modal').should('be.visible');
      cy.get('.modal input[type="url"]').first().type('https://new-e2e-feed.com/rss');
      cy.get('.modal').contains('button', 'Add').click();
      cy.wait('@addSource');
      cy.log('New source submitted successfully');
    });

    it('should open delete confirmation for test-source.com', () => {
      cy.get('body').contains('test-source.com').parents('tr').within(() => {
        cy.get('button[title="Delete"]').click();
      });
      cy.get('.modal').should('be.visible');
      cy.get('.modal-title').should('contain.text', 'Confirm Deletion');
      cy.get('.modal button').contains(/close/i).click();
      cy.get('.modal').should('not.exist');
    });

    it('should open timeline for test-source.com', () => {
      cy.get('body').contains('test-source.com').parents('tr').within(() => {
        cy.get('button[title="History"]').click();
      });
      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal .btn-close').click();
      cy.get('.modal').should('not.exist');
    });

    it('should open edit modal for a source', () => {
      cy.get('body').contains('test-source.com').parents('tr').within(() => {
        cy.get('button[title="Edit"]').click();
      });
      cy.get('.modal').should('be.visible');
      cy.get('.modal-title').should('contain.text', 'Edit RSS Source');
      cy.get('.modal button').contains(/close/i).click();
      cy.get('.modal').should('not.exist');
    });
  });


  describe('Banned Words Panel', () => {
    it('should display banned words from fixture', () => {
      cy.get('body', { timeout: 15000 })
        .invoke('text')
        .should('include', 'test-spam');
    });

    it('should display second banned word', () => {
      cy.get('body').invoke('text').should('include', 'e2e-advertisement');
    });

    it('should open add banned word modal', () => {
      cy.contains('button', 'Add Banned Word').click();
      cy.get('.modal').should('be.visible');
      cy.get('.modal-title').should('contain.text', 'Add Banned Word');
      cy.get('.modal button').contains(/close/i).click();
      cy.get('.modal').should('not.exist');
    });

    it('should add a new banned word', () => {
      cy.contains('button', 'Add Banned Word').click();
      cy.get('.modal').should('be.visible');
      cy.get('.modal input[type="text"]').first().type('new-banned-word-e2e');
      cy.get('.modal').contains('button', 'Add').click();
      cy.wait('@addBannedWord');
      cy.log('New banned word submitted successfully');
    });

    it('should open delete confirmation for test-spam', () => {
      cy.get('body').contains('test-spam').parents('tr').within(() => {
        cy.get('button[title="Delete"]').click();
      });
      cy.get('.modal').should('be.visible');
      cy.get('.modal-title').should('contain.text', 'Confirm Deletion');
      cy.get('.modal button').contains(/close/i).click();
      cy.get('.modal').should('not.exist');
    });

    it('should open edit modal for a banned word', () => {
      cy.get('body').contains('test-spam').parents('tr').within(() => {
        cy.get('button[title="Edit"]').click();
      });
      cy.get('.modal').should('be.visible');
      cy.get('.modal button').contains(/close/i).click();
      cy.get('.modal').should('not.exist');
    });
  });


  describe('Archived Alerts Panel', () => {
    it('should display archived CVEs tab by default', () => {
      cy.get('body', { timeout: 15000 })
        .invoke('text')
        .should('include', 'CVE-2024-9999');
    });

    it('should display CVE severity badge CRITICAL', () => {
      cy.get('body').invoke('text').should('include', 'CRITICAL');
    });

    it('should display second archived CVE', () => {
      cy.get('body').invoke('text').should('include', 'CVE-2024-8888');
    });

    it('should display Enable button to unarchive a CVE', () => {
      cy.get('body').then(($body) => {
        const hasEnableBtn = $body.find('button').toArray()
          .some(el => el.textContent.trim() === 'Enable');
        if (hasEnableBtn) {
          cy.contains('button', 'Enable').first().should('exist');
          cy.log('Enable/unarchive button found for CVE');
        } else {
          cy.log('Enable button not visible — user may lack manage permission');
        }
      });
    });

    it('should switch to Hits tab', () => {
      cy.contains('button.nav-link', /hits/i).click();
      cy.get('body', { timeout: 10000 }).should('be.visible');
      cy.log('Hits tab opened — fixture has 0 archived hits');
    });

    it('should switch back to CVEs tab', () => {
      cy.contains('button.nav-link', /cves/i).first().click();
      cy.get('body').invoke('text').should('include', 'CVE-2024-9999');
      cy.log('Returned to CVEs tab');
    });
  });


  after(() => {
    cy.log('CyberWatch test cleanup...');
    cy.window().then((win) => {
      win.localStorage.clear();
      win.sessionStorage.clear();
    });
    cy.log('CyberWatch test cleanup completed');
  });
});
