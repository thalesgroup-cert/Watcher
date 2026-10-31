// Global search: the entry of the sidebar (an icon when it is folded, a preview of the field when it is open) and the window
// it opens in the middle of the screen. All API calls are mocked.
describe('Global search', () => {
  const USER = { id: 1, username: 'analyst', first_name: 'Ana', last_name: 'Lyst', email: '', is_superuser: false, is_staff: false, groups: [], permissions: [] };
  const RESPONSE = {
    query: 'acme',
    groups: [
      { module: 'cyber_watch', label: 'Cyber Watch', more: false, error: false, results: [
        { id: 12, type: 'cve', title: 'CVE-2026-0001', subtitle: 'Acme gateway', to: '/cyber_watch?tab=cves&cve=12' },
      ] },
      { module: 'legitimate_domains', label: 'Legitimate Domains', more: true, error: false, results: [
        { id: 3, type: 'domain', title: 'acme.com', subtitle: '', to: '/legitimate_domains?domain=3' },
      ] },
      { module: 'dns_finder', label: 'DNS Threats', more: false, error: true, results: [] },
    ],
  };
  const BOX = 'input[aria-label="Search everywhere"]';
  const DIALOG = '[data-testid="search-dialog"]';
  const ENTRY = 'aside[aria-label="Sidebar"] button[aria-label="Search"]';

  const visit = (pinned = false) =>
    cy.visit('/#/legitimate_domains', {
      onBeforeLoad: (win) => {
        win.localStorage.setItem('token', 'mock-token-search');
        if (pinned) win.localStorage.setItem('watcher.sidebar.pinned', '1');
      },
    });

  beforeEach(() => {
    cy.on('uncaught:exception', () => false);
    // Cypress tries the most recent interceptor first: the catch-all comes first.
    cy.intercept('GET', '/api/**', { statusCode: 200, body: { results: [], next: null, previous: null } });
    cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: USER });
    cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: 'bootstrap', preferences: {}, avatar_color: null } });
    cy.intercept('GET', '/api/search/*', { statusCode: 200, body: RESPONSE }).as('search');
  });

  describe('the entry', () => {
    it('is an icon in the folded sidebar and opens the window in the middle of the screen', () => {
      visit();
      cy.get(ENTRY, { timeout: 20000 }).should('be.visible').click();
      cy.get(DIALOG).should('be.visible');
      cy.focused().should('have.attr', 'aria-label', 'Search everywhere');
      cy.get(DIALOG).then(($dialog) => {
        const box = $dialog[0].getBoundingClientRect();
        const middle = Cypress.config('viewportHeight') / 2;
        expect(box.top).to.be.greaterThan(40);
        expect(Math.abs(box.top + box.height / 2 - middle)).to.be.lessThan(120);
      });
    });

    it('is a preview of the search field in the open sidebar', () => {
      visit(true);
      cy.get(ENTRY, { timeout: 20000 }).should('contain', 'Search…').and('contain', 'K');
      cy.get(ENTRY).click();
      cy.get(DIALOG).should('be.visible');
    });

    it('opens with Ctrl+K from any page', () => {
      visit();
      cy.get(ENTRY, { timeout: 20000 });
      cy.get('body').type('{ctrl}k');
      cy.get(DIALOG).should('be.visible');
      cy.focused().should('have.attr', 'aria-label', 'Search everywhere');
    });
  });

  describe('the window', () => {
    beforeEach(() => {
      visit();
      cy.get(ENTRY, { timeout: 20000 }).click();
      cy.get(DIALOG).should('be.visible');
    });

    it('waits for two characters', () => {
      cy.get(BOX).type('a');
      cy.contains('Type at least 2 characters');
      cy.get('@search.all').should('have.length', 0);
    });

    it('groups the results by module and shows a failed module', () => {
      cy.get(BOX).type('acme');
      cy.wait('@search').its('request.url').should('include', 'q=acme');
      cy.get('[data-testid="search-group-cyber_watch"]').should('contain', 'CVE-2026-0001');
      cy.get('[data-testid="search-group-legitimate_domains"]').should('contain', 'More results');
      cy.get('[data-testid="search-group-dns_finder"]').should('contain', 'did not answer');
    });

    it('asks once for a burst of typing', () => {
      cy.get(BOX).type('acme');
      cy.wait('@search');
      cy.get('@search.all').should('have.length', 1);
    });

    it('opens the clicked object on its page and closes', () => {
      cy.get(BOX).type('acme');
      cy.contains('[role="option"]', 'CVE-2026-0001').click();
      cy.location('hash').should('eq', '#/cyber_watch?tab=cves&cve=12');
      cy.get(DIALOG).should('not.exist');
    });

    it('is driven by the keyboard', () => {
      cy.get(BOX).type('acme');
      cy.wait('@search');
      cy.contains('[role="option"]', 'acme.com').should('be.visible');
      cy.get(BOX).type('{downArrow}{enter}');
      cy.location('hash').should('eq', '#/legitimate_domains?domain=3');
    });

    it('says so when nothing matches', () => {
      cy.intercept('GET', '/api/search/*', { statusCode: 200, body: { query: 'zzzz', groups: [] } });
      cy.get(BOX).type('zzzz');
      cy.contains('No results for “zzzz”');
    });

    it('offers a retry when the search itself fails', () => {
      cy.intercept('GET', '/api/search/*', { statusCode: 500, body: {} });
      cy.get(BOX).type('acme');
      cy.contains('The search failed.', { timeout: 15000 });
      cy.contains('button', 'Retry').should('be.visible');
    });

    it('closes with Escape and with the cross, and starts empty the next time', () => {
      cy.get(BOX).type('acme');
      cy.get(BOX).type('{esc}');
      cy.get(DIALOG).should('not.exist');
      cy.get(ENTRY).click();
      cy.get(BOX).should('have.value', '');
      cy.get(`${DIALOG} button[aria-label="Close"]`).click();
      cy.get(DIALOG).should('not.exist');
    });
  });
});
