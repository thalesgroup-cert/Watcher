// Timeline module: cross-module Activity page and the history drawer. All API calls are mocked.
describe('Activity', () => {
  const USER = { id: 1, username: 'analyst', first_name: 'Ana', last_name: 'Lyst', email: '', is_superuser: false, is_staff: false, groups: [], permissions: [] };

  const now = Date.now();
  const at = (minutesAgo) => new Date(now - minutesAgo * 60_000).toISOString();
  const event = (id, overrides) => ({
    id,
    content_type: 'common.legitimatedomain',
    object_id: id,
    action: 'created',
    action_label: 'Created',
    user: 1,
    username: 'analyst',
    first_name: 'Ana',
    last_name: 'Lyst',
    avatar_color: null,
    timestamp: at(id),
    diff: {},
    object_repr: `domain-${id}.com`,
    ...overrides,
  });

  const FEED = [
    event(1, { action: 'updated', action_label: 'Updated', object_repr: 'thales.com', diff: { contact: { old: null, new: 'soc@thales.com' } } }),
    // A bulk import: folded into one line.
    event(10), event(11), event(12), event(13),
    event(30, { content_type: 'site_monitoring.site', action: 'deleted', action_label: 'Deleted', object_repr: 'phish.example' }),
  ];

  beforeEach(() => {
    cy.on('uncaught:exception', () => false);
    cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: USER });
    cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: 'bootstrap', preferences: {}, avatar_color: null } });
    cy.intercept('GET', '/api/timeline/events/summary/', {
      statusCode: 200,
      body: { people_today: 6, automated_today: 1200, people_week: 42, contributors_week: 3, by_module_week: { common: 40 } },
    });
    cy.intercept('GET', '/api/timeline/events/feed/*', { statusCode: 200, body: { next: null, previous: null, results: FEED } }).as('feed');
    // Only the history of one object: `?*` would also catch /events/summary/ and answer it with this list.
    cy.intercept('GET', '/api/timeline/events/?content_type=*', {
      statusCode: 200,
      body: [FEED[0], event(2, { object_repr: 'thales.com', object_id: 1, timestamp: at(500) })],
    }).as('history');

    cy.visit('/#/activity', { onBeforeLoad: (win) => win.localStorage.setItem('token', 'mock-token-activity') });
    cy.get('[data-testid="event-feed"]', { timeout: 20000 }).should('be.visible');
  });

  it('is reachable from the sidebar', () => {
    cy.visit('/#/');
    cy.get('aside[aria-label="Sidebar"] a[aria-label="Activity"]').click();
    cy.location('hash').should('eq', '#/activity');
  });

  it('shows the summary counters', () => {
    cy.contains('Changes today').parent().should('contain', '6');
    cy.contains('Contributors - 7 days').parent().should('contain', '3');
  });

  it('asks for human activity by default', () => {
    cy.wait('@feed').its('request.url').should('include', 'actor=people');
  });

  it('describes events and folds bulk actions', () => {
    cy.contains('Ana Lyst updated legitimate domain thales.com').should('be.visible');
    cy.contains('Ana Lyst added 4 legitimate domains').should('be.visible');
    cy.contains('button', 'Show legitimate domains').click();
    cy.contains('.MuiChip-root', 'domain-12.com').should('be.visible');
    cy.contains('Ana Lyst removed monitored website phish.example').should('be.visible');
  });

  it('expands the changes of an update', () => {
    cy.contains('button', 'Contact').click();
    cy.get('[data-testid="event-diff"]').should('contain', 'soc@thales.com');
  });

  it('puts the filters in the request and the URL', () => {
    cy.contains('button', 'Automated').click();
    cy.wait('@feed');
    cy.wait('@feed').its('request.url').should('include', 'actor=automated');
    cy.location('hash').should('include', 'actor=automated');

    cy.contains('[role="group"][aria-label="Actions"] .MuiChip-root', 'Deleted').click();
    cy.wait('@feed').its('request.url').should('include', 'action=deleted');

    cy.get('input[aria-label="Search activity"]').type('thales');
    cy.wait('@feed').its('request.url').should('include', 'search=thales');
    cy.location('hash').should('include', 'q=thales');

    cy.contains('button', 'Clear').click();
    cy.location('hash').should('eq', '#/activity');
  });

  it('opens the history of an object in the drawer', () => {
    cy.contains('button', 'thales.com').click();
    cy.wait('@history').its('request.url').should('include', 'content_type=common.legitimatedomain').and('include', 'object_id=1');
    cy.get('.MuiDrawer-paper').within(() => {
      cy.contains('#history-drawer-title', 'thales.com').should('be.visible');
      cy.contains('2 events').should('be.visible');
      cy.get('[data-testid="event-diff"]').should('contain', 'soc@thales.com');
      cy.get('button[aria-label="Close history"]').click();
    });
    cy.get('.MuiDrawer-paper:visible').should('not.exist');
  });
});
