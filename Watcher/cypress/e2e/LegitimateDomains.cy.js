// Legitimate Domains module: list with KPI quick filters, filters / sort in the URL, detail drawer, add / edit /
// delete, "one per line" add, bulk actions, MISP export, Insights tab and the public view. All API calls are mocked.
describe('Legitimate Domains', () => {
  const USER = { id: 1, username: 'analyst', first_name: 'Ana', last_name: 'Lyst', email: '', is_superuser: true, is_staff: false, groups: [], permissions: [] };
  const API = '/api/common/legitimate_domains/';

  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  const DOMAINS = [
    {
      id: 1, domain_name: 'watcher-company.com', ticket_id: '240529-1a2b3', contact: 'IT team', created_at: `${day(-30)}T10:00:00`,
      domain_created_at: '2010-03-01T00:00:00', expiry: day(-3), ssl_expiry: day(12), repurchased: true,
      comments: 'Main corporate domain', misp_event_uuid: ['5f1c2d3e-0000-4000-8000-000000000001'],
      last_event: { username: 'analyst', first_name: 'Ana', last_name: 'Lyst', avatar_color: null, action: 'updated', timestamp: `${day(-1)}T09:00:00` },
    },
    {
      id: 2, domain_name: 'watcher-backup.fr', ticket_id: '', contact: '', created_at: `${day(-10)}T10:00:00`,
      domain_created_at: null, expiry: day(200), ssl_expiry: null, repurchased: false, comments: '', misp_event_uuid: [], last_event: null,
    },
  ];
  const PAGE = { count: 2, next: null, previous: null, results: DOMAINS };
  const STATS = {
    total: 2, repurchased: 1, expired: 1, expiringSoon: 0, noExpiry: 0, sslExpired: 0, sslExpiringSoon: 1, sslNoExpiry: 1,
    newToday: 0, newThisWeek: 0, topTlds: [{ tld: '.com', count: 1 }, { tld: '.fr', count: 1 }],
    upcoming: Array.from({ length: 12 }, (_, i) => ({ month: day(i * 30).slice(0, 7), domains: i === 6 ? 1 : 0, certificates: i === 0 ? 1 : 0 })),
  };
  const SUMMARY = (status, n) => ({
    succeeded: n, skipped: 0, errors: 0, ok_status: status,
    results: DOMAINS.slice(0, n).map((d) => ({ value: d.domain_name, status, reason: '', id: d.id })),
  });

  const mockApi = (user = USER) => {
    cy.on('uncaught:exception', () => false);
    if (user) cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: user });
    else cy.intercept('GET', '/api/auth/user', { statusCode: 401, body: { detail: 'Authentication credentials were not provided.' } });
    cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: 'bootstrap', preferences: {}, avatar_color: null } });
    cy.intercept('GET', `${API}?*`, { statusCode: 200, body: PAGE }).as('list');
    cy.intercept('GET', `${API}statistics/`, { statusCode: 200, body: STATS }).as('stats');
    cy.intercept('GET', `${API}1/`, { statusCode: 200, body: DOMAINS[0] }).as('detail');
    cy.intercept('GET', '/api/timeline/events/?*', {
      statusCode: 200,
      body: [{
        id: 9, content_type: 'common.legitimatedomain', object_id: 1, action: 'updated', action_label: 'Updated', user: 1,
        username: 'analyst', first_name: 'Ana', last_name: 'Lyst', avatar_color: null, timestamp: `${day(-1)}T09:00:00`,
        diff: { contact: { old: '', new: 'IT team' } }, object_repr: 'watcher-company.com',
      }],
    }).as('history');
  };

  const visit = (path = '') =>
    cy.visit(`/#/legitimate_domains${path}`, { onBeforeLoad: (win) => win.localStorage.setItem('token', 'mock-token-legit') });

  describe('signed in', () => {
    beforeEach(() => {
      mockApi();
      visit();
      cy.get('[data-testid="domain-row"]', { timeout: 20000 }).should('have.length', 2);
    });

    it('shows the KPI cards and filters the list from them', () => {
      cy.wait('@list'); // the request of the first display, so that the next waits are the ones of the filters
      cy.contains('button', 'Expired').should('contain', '1').click();
      cy.wait('@list').its('request.url').should('include', 'status=expired');
      cy.location('hash').should('include', 'status=expired');
      cy.contains('button', 'Expired').should('have.attr', 'aria-pressed', 'true');
      cy.contains('button', 'Certificates to renew').should('contain', '1').click();
      cy.location('hash').should('include', 'ssl=attention').and('not.include', 'status=');
    });

    it('describes each domain', () => {
      cy.get('[data-testid="domain-row"]').first().within(() => {
        cy.contains('watcher-company.com');
        cy.contains('IT team - #240529-1a2b3');
        cy.contains(/^Expired /);
        cy.get('[aria-label="Repurchased"]').should('exist');
        cy.get('[aria-label="Has comments"]').should('exist');
      });
      cy.get('[data-testid="domain-row"]').eq(1).should('contain', 'Not detected yet');
    });

    it('puts search, filters, sort and page size in the request and the URL', () => {
      cy.wait('@list'); // the request of the first display
      cy.get('input[aria-label="Search domains"]').type('watcher');
      cy.wait('@list').its('request.url').should('include', 'search=watcher');
      cy.location('hash').should('include', 'q=watcher');

      cy.get('[role="combobox"]').first().click();
      cy.contains('[role="option"]', 'Needs attention').click();
      cy.wait('@list').its('request.url').should('include', 'status=attention');

      cy.contains('th [role="button"]', /^Domain$/).click();
      cy.wait('@list').its('request.url').should('include', 'ordering=domain_name');
      cy.location('hash').should('include', 'sort=domain_name');

      cy.contains('button', 'Clear').click();
      cy.location('hash').should('not.include', 'q=').and('not.include', 'status=');
    });

    it('opens a domain in the drawer, with its details and history', () => {
      cy.get('[data-testid="domain-row"]').first().click();
      cy.location('hash').should('include', 'domain=1');
      cy.wait('@history').its('request.url').should('include', 'content_type=common.legitimatedomain').and('include', 'object_id=1');
      cy.get('.MuiDrawer-paper').within(() => {
        cy.contains('#domain-drawer-title', 'watcher-company.com');
        cy.contains('Main corporate domain');
        cy.contains('5f1c2d3e-0000-4000-8000-000000000001');
        cy.get('[data-testid="event-diff"]').should('contain', 'IT team');
        cy.get('button[aria-label="Close details"]').click();
      });
      cy.get('.MuiDrawer-paper:visible').should('not.exist');
      cy.location('hash').should('not.include', 'domain=');
    });

    it('opens the drawer from a link', () => {
      visit('?domain=1');
      cy.contains('#domain-drawer-title', 'watcher-company.com', { timeout: 20000 });
    });

    it('adds a domain', () => {
      cy.intercept('POST', API, (req) => req.reply({ statusCode: 201, body: { ...DOMAINS[1], id: 3, ...req.body } })).as('create');
      cy.contains('button', 'Add domains').click();
      cy.location('hash').should('include', 'dialog=add');
      cy.get('[role="dialog"]').within(() => {
        cy.get('input[name="domain_name"]').type('new-domain.com');
        cy.get('input[name="ticket_id"]').type('bad ticket');
        cy.contains('Letters, digits, dashes and dots only');
        cy.contains('button', 'Add domain').should('be.disabled');
        cy.get('input[name="ticket_id"]').clear().type('T-1');
        cy.get('[aria-label="Domain expiry shortcuts"]').contains('+1 year').click();
        cy.contains('button', 'Add domain').click();
      });
      cy.wait('@create').its('request.body').should((body) => {
        expect(body.domain_name).to.eq('new-domain.com');
        expect(body.ticket_id).to.eq('T-1');
        expect(body.expiry).to.match(/^\d{4}-\d{2}-\d{2}$/);
        expect(body.ssl_expiry).to.eq(null);
      });
      cy.get('[role="dialog"]').should('not.exist');
      cy.location('hash').should('not.include', 'dialog=');
    });

    it('adds several domains, one per line, with a preview', () => {
      cy.intercept('POST', `${API}bulk_create/`, (req) =>
        req.reply({ statusCode: 200, body: { ...SUMMARY('created', 2), dry_run: req.body.dry_run } }),
      ).as('bulkCreate');
      cy.contains('button', 'Add domains').click();
      cy.contains('label', 'Add several, one per line').click();
      cy.get('textarea[name="domain_name"]').type('a.com\nb.com\nA.com');
      cy.contains('2 domains detected');
      cy.contains('button', 'Preview').click();
      cy.wait('@bulkCreate').its('request.body').should('deep.include', { values: 'a.com\nb.com\nA.com', dry_run: true });
      cy.contains('[role="dialog"]', 'Preview only').contains('button', 'Close').click();
      cy.contains('button', 'Add 2 domains').click();
      cy.wait('@bulkCreate').its('request.body.dry_run').should('eq', false);
      cy.contains('[role="dialog"]', '2 created').contains('button', 'Close').click();
      cy.get('[role="dialog"]').should('not.exist');
    });

    it('edits, exports and deletes from the drawer', () => {
      cy.intercept('PATCH', `${API}1/`, (req) => req.reply({ statusCode: 200, body: { ...DOMAINS[0], ...req.body } })).as('patch');
      cy.intercept('POST', `${API}misp/`, { statusCode: 200, body: { message: 'Exported', misp_event_uuid: 'x' } }).as('misp');
      cy.intercept('DELETE', `${API}1/`, { statusCode: 204 }).as('delete');
      cy.get('[data-testid="domain-row"]').first().click();

      cy.get('.MuiDrawer-paper').contains('button', 'Edit').click();
      cy.get('[role="dialog"] input[name="contact"]').clear().type('SOC');
      cy.get('[role="dialog"]').contains('button', 'Save').click();
      cy.wait('@patch').its('request.body').should('include', { contact: 'SOC', domain_name: 'watcher-company.com' });

      cy.get('.MuiDrawer-paper').contains('button', 'Export to MISP').click();
      cy.get('[role="dialog"]').contains('button', 'Update MISP event').click();
      cy.wait('@misp').its('request.body').should('deep.equal', { id: 1, event_uuid: '5f1c2d3e-0000-4000-8000-000000000001' });

      cy.get('.MuiDrawer-paper').contains('button', 'Delete').click();
      // The drawer is a dialog too: only the confirmation is meant.
      cy.get('[role="dialog"]:not(.MuiDrawer-paper)').contains('button', 'Delete').click();
      cy.wait('@delete');
      cy.get('.MuiDrawer-paper:visible').should('not.exist');
    });

    it('runs bulk actions on the selection', () => {
      cy.intercept('POST', `${API}bulk_update/`, { statusCode: 200, body: SUMMARY('updated', 2) }).as('bulkUpdate');
      cy.intercept('POST', `${API}bulk_delete/`, { statusCode: 200, body: SUMMARY('deleted', 2) }).as('bulkDelete');
      cy.get('input[aria-label="Select the legitimate domains of this page"]').check();
      cy.get('[role="region"][aria-label="Selection"]').should('contain', '2 selected').contains('button', 'Mark repurchased').click();
      cy.wait('@bulkUpdate').its('request.body').should('deep.equal', { ids: [1, 2], changes: { repurchased: true } });
      cy.contains('[role="dialog"]', '2 updated').contains('button', 'Close').click();
      cy.get('[role="region"][aria-label="Selection"]').should('not.exist');

      cy.get('input[aria-label="Select watcher-backup.fr"]').check();
      cy.get('[role="region"][aria-label="Selection"]').contains('button', 'Delete').click();
      cy.get('[role="dialog"]').contains('button', 'Delete 1').click();
      cy.wait('@bulkDelete').its('request.body').should('deep.equal', { ids: [2] });
    });

    it('shows the insights and links them to the list', () => {
      cy.contains('[role="tab"]', 'Insights').click();
      cy.location('hash').should('include', 'tab=insights');
      cy.get('[data-testid="upcoming-chart"] svg').should('exist');
      cy.contains('li', '.com').should('contain', '1');
      cy.get('button[aria-label^="Certificate: 1 expiring soon"]').click();
      cy.location('hash').should('include', 'ssl=expiring_soon').and('not.include', 'tab=');
    });
  });

  describe('public view', () => {
    it('is read-only and hides the internal columns', () => {
      mockApi(null);
      cy.visit('/#/legitimate_domains');
      cy.get('[data-testid="domain-row"]', { timeout: 20000 }).should('have.length', 2);
      cy.contains('button', 'Add domains').should('not.exist');
      cy.get('input[type="checkbox"]').should('not.exist');
      cy.contains('th', 'Repurchased').should('not.exist');
      cy.get('[data-testid="domain-row"]').first().click();
      cy.get('.MuiDrawer-paper').within(() => {
        cy.contains('button', 'Edit').should('not.exist');
        cy.contains('History').should('not.exist');
      });
    });
  });
});
