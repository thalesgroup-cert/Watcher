// Data Leak module: alert triage (KPI quick filters, filters / sort in the URL, drawer with previous / next, archive,
// bulk actions), search patterns (drawer, add with regex check, templates and sample, edit, delete) and the Insights
// tab. All API calls are mocked.
describe('Data Leak', () => {
  const USER = { id: 1, username: 'analyst', first_name: 'Ana', last_name: 'Lyst', email: '', is_superuser: true, is_staff: false, groups: [], permissions: [] };
  const ALERTS = '/api/data_leak/alert/';
  const PATTERNS = '/api/data_leak/keyword/';

  const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString().slice(0, 19);
  const LEAK = { id: 1, name: 'leak', is_regex: false };
  const MAIL = { id: 2, name: '[a-z]+@acme\\.com', is_regex: true };

  const ALERT_ROWS = [
    { id: 11, keyword: LEAK, url: 'https://github.com/acme/leak-dump', source: 'github.com', status: true, has_content: false, created_at: ago(5) },
    { id: 12, keyword: MAIL, url: 'https://pastebin.com/AbCd1234', source: 'pastebin.com', status: true, has_content: true, created_at: ago(90) },
  ];
  const DETAIL = {
    11: { ...ALERT_ROWS[0], content: '' },
    12: { ...ALERT_ROWS[1], content: 'users: jane@acme.com, bob@acme.com, eve@other.org' },
  };
  const PATTERN_ROWS = [
    { ...LEAK, created_at: ago(5000), last_event: null, alerts_count: 3, active_alerts_count: 1, last_alert_at: ago(5) },
    { ...MAIL, created_at: ago(9000), last_event: null, alerts_count: 1, active_alerts_count: 1, last_alert_at: ago(90) },
  ];
  const STATS = {
    totalAlerts: 4, activeAlerts: 2, archivedAlerts: 2, newToday: 2, newThisWeek: 3, totalKeywords: 2,
    perDay: Array.from({ length: 30 }, (_, i) => ({ date: new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10), count: i % 4 })),
    topKeywords: [{ id: 1, name: 'leak', count: 3 }, { id: 2, name: '[a-z]+@acme\\.com', count: 1 }],
    topSources: [{ source: 'github.com', count: 3 }, { source: 'pastebin.com', count: 1 }],
  };
  const SUMMARY = (status, ids) => ({
    succeeded: ids.length, skipped: 0, errors: 0, ok_status: status,
    results: ids.map((id) => ({ value: `alert ${id}`, status, reason: '', id })),
  });

  beforeEach(() => {
    cy.on('uncaught:exception', () => false);
    cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: USER });
    cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: 'bootstrap', preferences: {}, avatar_color: null } });
    cy.intercept('GET', `${ALERTS}?*`, { statusCode: 200, body: { count: 2, next: null, previous: null, results: ALERT_ROWS } }).as('alerts');
    cy.intercept('GET', `${ALERTS}11/`, { statusCode: 200, body: DETAIL[11] }).as('alert11');
    cy.intercept('GET', `${ALERTS}12/`, { statusCode: 200, body: DETAIL[12] }).as('alert12');
    cy.intercept('GET', `${PATTERNS}?*`, { statusCode: 200, body: { count: 2, next: null, previous: null, results: PATTERN_ROWS } }).as('patterns');
    cy.intercept('GET', `${PATTERNS}1/`, { statusCode: 200, body: PATTERN_ROWS[0] });
    cy.intercept('GET', `${PATTERNS}statistics/`, { statusCode: 200, body: STATS });
    cy.intercept('GET', '/api/timeline/events/?*', {
      statusCode: 200,
      body: [{
        id: 5, content_type: 'data_leak.alert', object_id: 12, action: 'updated', action_label: 'Updated', user: 1,
        username: 'analyst', first_name: 'Ana', last_name: 'Lyst', avatar_color: null, timestamp: ago(30),
        diff: { status: { old: false, new: true } }, object_repr: 'https://pastebin.com/AbCd1234',
      }],
    }).as('history');
    cy.visit('/#/data_leak', { onBeforeLoad: (win) => win.localStorage.setItem('token', 'mock-token-leak') });
    cy.get('[data-testid="alert-row"]', { timeout: 20000 }).should('have.length', 2);
  });

  describe('alerts', () => {
    it('opens on the alerts to review', () => {
      cy.wait('@alerts').its('request.url').should('include', 'status=active');
      cy.contains('button', 'To review').should('have.attr', 'aria-pressed', 'true').and('contain', '2');
      cy.get('[data-testid="alert-row"]').first().should('contain', 'leak-dump').and('contain', 'github.com');
      cy.get('[data-testid="alert-row"]').eq(1).find('[aria-label="Raw content captured"]').should('exist');
    });

    it('filters from the KPI cards, the toolbar and the column headers, all kept in the URL', () => {
      cy.wait('@alerts'); // the request of the first display, so that the next waits are the ones of the filters
      cy.contains('button', 'New today').click();
      cy.wait('@alerts').its('request.url').should('include', 'period=today').and('not.include', 'status=');
      cy.location('hash').should('include', 'status=all').and('include', 'period=today');

      cy.contains('[role="group"][aria-label="Status"] button', 'Archived').click();
      cy.wait('@alerts').its('request.url').should('include', 'status=archived');

      cy.get('input[aria-label="Search alerts"]').type('dump');
      cy.wait('@alerts').its('request.url').should('include', 'search=dump');
      cy.location('hash').should('include', 'q=dump');

      cy.get('[role="combobox"]').eq(0).click();
      cy.contains('[role="option"]', 'leak').click();
      cy.wait('@alerts').its('request.url').should('include', 'keyword=1');

      cy.get('[role="combobox"]').eq(1).click();
      cy.contains('[role="option"]', 'pastebin.com').click();
      cy.wait('@alerts').its('request.url').should('include', 'source=pastebin.com');

      cy.contains('th [role="button"]', 'Pattern').click();
      cy.wait('@alerts').its('request.url').should('include', 'ordering=keyword__name');

      cy.contains('button', 'Clear').click();
      cy.location('hash').should('eq', '#/data_leak?sort=keyword__name');
    });

    it('opens an alert with its content, steps to the next one and archives it', () => {
      cy.intercept('PATCH', `${ALERTS}12/`, { statusCode: 200, body: { ...DETAIL[12], status: false } }).as('archive');
      cy.get('[data-testid="alert-row"]').first().click();
      cy.location('hash').should('include', 'alert=11');
      cy.get('.MuiDrawer-paper').within(() => {
        cy.contains('#alert-drawer-title', 'leak-dump');
        cy.get('button[aria-label="Previous alert"]').should('be.disabled');
        cy.get('button[aria-label="Next alert"]').click();
      });
      cy.location('hash').should('include', 'alert=12');
      cy.get('.MuiDrawer-paper').within(() => {
        cy.contains('#alert-drawer-title', 'AbCd1234');
        cy.contains('2 matches highlighted');
        cy.get('pre[aria-label="Raw content"] mark').should('have.length', 2).first().should('have.text', 'jane@acme.com');
        cy.get('a').contains('Open source').should('have.attr', 'href', 'https://pastebin.com/AbCd1234').and('have.attr', 'target', '_blank');
        cy.get('[data-testid="event-diff"]').should('contain', 'To review');
        cy.contains('button', 'Archive').click();
      });
      cy.wait('@archive').its('request.body').should('deep.equal', { status: false });
      // The last alert of the page leaves the "to review" view: the drawer moves back to the previous one.
      cy.location('hash').should('include', 'alert=11');
    });

    it('archives the selection in bulk', () => {
      cy.intercept('POST', `${ALERTS}bulk_update/`, { statusCode: 200, body: SUMMARY('updated', [11, 12]) }).as('bulk');
      cy.get('input[aria-label="Select the alerts of this page"]').check();
      cy.get('[role="region"][aria-label="Selection"]').should('contain', '2 selected').contains('button', 'Archive').click();
      cy.wait('@bulk').its('request.body').should('deep.equal', { ids: [11, 12], changes: { status: false } });
      cy.contains('[role="dialog"]', '2 updated').contains('button', 'Close').click();
      cy.get('[role="region"][aria-label="Selection"]').should('not.exist');
    });
  });

  describe('search patterns', () => {
    beforeEach(() => {
      cy.contains('[role="tab"]', 'Search patterns').click();
      cy.get('[data-testid="pattern-row"]').should('have.length', 2);
    });

    it('lists the patterns with their counts and links one to its alerts', () => {
      cy.location('hash').should('include', 'tab=patterns');
      cy.get('[data-testid="pattern-row"]').eq(1).should('contain', 'Regular expression');
      // The requests of the first display: the pattern filter of the alerts tab, then the list of this tab.
      cy.wait('@patterns');
      cy.wait('@patterns');
      cy.contains('th [role="button"]', 'To review').click();
      cy.wait('@patterns').its('request.url').should('include', 'ordering=active_alerts_count');
      cy.get('[data-testid="pattern-row"]').first().click();
      cy.get('.MuiDrawer-paper').contains('button', 'Show its alerts').click();
      cy.location('hash').should('include', 'keyword=1').and('include', 'status=all').and('not.include', 'tab=');
    });

    it('checks a regular expression, offers templates and highlights a sample', () => {
      cy.intercept('POST', PATTERNS, (req) => req.reply({ statusCode: 201, body: { ...PATTERN_ROWS[0], id: 3, ...req.body } })).as('create');
      cy.contains('button', 'Add patterns').click();
      cy.location('hash').should('include', 'dialog=add');
      cy.get('[role="dialog"]').within(() => {
        cy.contains('label', 'Regular expression').click();
        cy.get('input[name="name"]').type('leak(');
        cy.contains('Invalid regular expression');
        cy.contains('button', 'Add pattern').should('be.disabled');
        cy.contains('button', 'Templates').click();
        cy.get('button[aria-label="Use Email Pattern"]').click();
        cy.get('input[name="name"]').should('have.value', '[a-zA-Z0-9._%+-]+@company\\.com');
        cy.get('textarea[name="sample"]').type('mail jane@company.com');
        cy.contains('1 match');
        cy.get('mark').should('have.text', 'jane@company.com');
        cy.contains('button', 'Add pattern').click();
      });
      cy.wait('@create').its('request.body').should('deep.equal', { name: '[a-zA-Z0-9._%+-]+@company\\.com', is_regex: true });
      cy.get('[role="dialog"]').should('not.exist');
    });

    it('edits and deletes from the drawer', () => {
      cy.intercept('PATCH', `${PATTERNS}1/`, (req) => req.reply({ statusCode: 200, body: { ...PATTERN_ROWS[0], ...req.body } })).as('patch');
      cy.intercept('DELETE', `${PATTERNS}1/`, { statusCode: 204 }).as('delete');
      cy.get('[data-testid="pattern-row"]').first().click();
      cy.location('hash').should('include', 'pattern=1');
      cy.get('.MuiDrawer-paper').contains('button', 'Edit').click();
      cy.get('[role="dialog"] input[name="name"]').clear().type('leaked');
      cy.get('[role="dialog"]').contains('button', 'Save').click();
      cy.wait('@patch').its('request.body').should('deep.equal', { name: 'leaked', is_regex: false });
      cy.get('.MuiDrawer-paper').contains('button', 'Delete').click();
      // The drawer is a dialog too: only the confirmation is meant.
      cy.get('[role="dialog"]:not(.MuiDrawer-paper)').should('contain', 'its 3 alerts are deleted with it').contains('button', 'Delete').click();
      cy.wait('@delete');
      cy.get('.MuiDrawer-paper:visible').should('not.exist');
    });
  });

  it('shows the insights and filters the alerts from them', () => {
    cy.contains('[role="tab"]', 'Insights').click();
    cy.get('[data-testid="per-day-chart"] svg').should('exist');
    cy.get('[aria-label="Top patterns"]').should('contain', 'leak');
    cy.get('button[aria-label="Show the 1 alert from pastebin.com"]').click();
    cy.location('hash').should('include', 'source=pastebin.com').and('include', 'status=all').and('not.include', 'tab=');
  });
});
