// What a page shows when its data does not come: the API answers 500 or 403, or has nothing to list. Every list page
// must say it (the message of the server, in an alert) and keep its header and its tabs, instead of a blank page or a
// misleading "nothing to review". The pages themselves are covered by their own spec; all API calls are mocked here.
describe('Errors and empty lists', () => {
  const USER = { id: 1, username: 'analyst', first_name: 'Ana', last_name: 'Lyst', email: '', is_superuser: true, is_staff: false, groups: [], permissions: [] };
  const EMPTY = { count: 0, next: null, previous: null, results: [] };
  const DENIED = 'You do not have permission to perform this action.';

  // The list a page shows first, the title of its header and what it says when it has nothing to list
  const PAGES = [
    { name: 'Data leaks', path: '/#/data_leak', title: 'Data leaks', list: '/api/data_leak/alert/?*', empty: 'Nothing to review' },
    { name: 'Cyber Watch', path: '/#/cyber_watch', title: 'Cyber Watch', list: '/api/cyber_watch/watch-rule-hits/?*', empty: 'Nothing to review' },
    { name: 'DNS Finder', path: '/#/dns_finder', title: 'DNS threats', list: '/api/dns_finder/threats_monitored/?*', empty: 'No open threat' },
    { name: 'Website monitoring', path: '/#/website_monitoring', title: 'Website monitoring', list: '/api/site_monitoring/site/?*', empty: 'No website monitored yet' },
    { name: 'Legitimate domains', path: '/#/legitimate_domains', title: 'Legitimate domains', list: '/api/common/legitimate_domains/?*', empty: 'No legitimate domains yet' },
    { name: 'Threats Watcher', path: '/#/threats_watcher', title: 'Threats Watcher', list: '/api/threats_watcher/trendyword/?*', empty: 'Nothing trending yet' },
  ];

  // Everything the page asks answers with an empty list, except what the test decides: the last intercept wins. The
  // statistics are not a list: they are refused, and the cards of the page show a dash.
  const quiet = () => {
    cy.on('uncaught:exception', () => false);
    cy.intercept('GET', '/api/**', { statusCode: 200, body: EMPTY });
    cy.intercept('GET', /\/api\/.*statistics\/?(\?.*)?$/, { statusCode: 500, body: { detail: 'No statistics in this test' } });
  };

  const open = (page, answer) => {
    quiet();
    cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: USER });
    cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: 'darkly', preferences: {}, avatar_color: null } });
    cy.intercept('GET', '/api/timeline/events/?*', { statusCode: 200, body: [] });
    cy.intercept('GET', page.list, answer).as('list');
    cy.visit(page.path, { onBeforeLoad: (win) => win.document.cookie = 'session_active=1' });
    cy.wait('@list');
  };

  PAGES.forEach((page) => {
    describe(page.name, () => {
      it('shows the message of the server when the list cannot be loaded', () => {
        open(page, { statusCode: 500, body: { detail: 'Database is unreachable' } });
        cy.get('[role="alert"]', { timeout: 10000 }).should('contain', 'Database is unreachable');
        cy.contains('h1, h2, h3, h4', page.title).should('be.visible');
        cy.get('[role="tab"]').should('have.length.greaterThan', 0);
        cy.contains(page.empty).should('not.exist');
      });

      it('says that the access is refused when the user has no right on it', () => {
        open(page, { statusCode: 403, body: { detail: DENIED } });
        cy.get('[role="alert"]', { timeout: 10000 }).should('contain', DENIED);
        cy.contains(page.empty).should('not.exist');
      });

      it('explains what will fill an empty list', () => {
        open(page, { statusCode: 200, body: EMPTY });
        cy.contains(page.empty, { timeout: 10000 }).should('be.visible');
        cy.get('[role="alert"]').should('not.exist');
        cy.get('tbody tr[data-testid$="-row"]').should('not.exist');
      });
    });
  });

  describe('an action that fails', () => {
    const ALERT = { id: 11, keyword: { id: 1, name: 'leak', is_regex: false }, url: 'https://github.com/acme/leak-dump', source: 'github.com', status: true, has_content: false, created_at: '2026-10-30T10:00:00' };

    beforeEach(() => {
      quiet();
      cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: USER });
      cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: 'darkly', preferences: {}, avatar_color: null } });
      cy.intercept('GET', '/api/timeline/events/?*', { statusCode: 200, body: [] });
      cy.intercept('GET', '/api/data_leak/alert/?*', { statusCode: 200, body: { ...EMPTY, count: 1, results: [ALERT] } }).as('alerts');
      cy.intercept('GET', '/api/data_leak/alert/11/', { statusCode: 200, body: { ...ALERT, content: '' } });
      cy.visit('/#/data_leak', { onBeforeLoad: (win) => win.document.cookie = 'session_active=1' });
      cy.get('[data-testid="alert-row"]', { timeout: 20000 }).should('have.length', 1);
    });

    it('tells the user when an alert cannot be archived, and leaves it to review', () => {
      cy.intercept('PATCH', '/api/data_leak/alert/11/', { statusCode: 500, body: { detail: 'Archive failed on the server' } }).as('archive');
      cy.get('[data-testid="alert-row"]').first().click();
      cy.get('.MuiDrawer-paper').contains('button', 'Archive').click();
      cy.wait('@archive');
      cy.contains('Archive failed on the server', { timeout: 10000 }).should('be.visible');
      cy.get('[data-testid="alert-row"]').should('have.length', 1);
      cy.location('hash').should('include', 'alert=11');
    });

    it('shows how long an error message stays: a bar empties along its foot, then the message goes', () => {
      cy.intercept('PATCH', '/api/data_leak/alert/11/', { statusCode: 500, body: { detail: 'Archive failed on the server' } }).as('archive');
      cy.get('[data-testid="alert-row"]').first().click();
      cy.get('.MuiDrawer-paper').contains('button', 'Archive').click();
      cy.wait('@archive');
      cy.get('[data-testid="toast-error"]', { timeout: 10000 }).should('have.attr', 'role', 'alert').within(() => {
        cy.contains('Archive failed on the server');
        cy.get('[data-testid="toast-timer"]').should('have.css', 'animation-duration', '3s');
        cy.get('button[aria-label="Close"], button[title="Close"]').should('exist');
      });
      cy.get('[data-testid="toast-error"]', { timeout: 10000 }).should('not.exist');
    });

    it('stops the bar while the pointer is over the message, and goes on from where it stopped: it never starts again, and ends with the message', () => {
      // How much of the bar is left: 1 when it is full, 0 when it is empty
      const left = ($bar) => {
        const matrix = getComputedStyle($bar[0]).transform;
        return matrix === 'none' ? 1 : parseFloat(matrix.slice(7, -1).split(',')[0]);
      };
      cy.intercept('PATCH', '/api/data_leak/alert/11/', { statusCode: 500, body: { detail: 'Archive failed on the server' } }).as('archive');
      cy.get('[data-testid="alert-row"]').first().click();
      cy.get('.MuiDrawer-paper').contains('button', 'Archive').click();
      cy.wait('@archive');
      cy.get('[data-testid="toast-error"]', { timeout: 10000 }).should('exist');
      // Let the bar empty for a while before the pointer comes
      cy.wait(1200);
      cy.get('.notistack-Snackbar').trigger('mouseover').trigger('mouseenter');
      cy.get('[data-testid="toast-timer"]').should('have.attr', 'data-paused', 'true').and('have.css', 'animation-play-state', 'paused');
      cy.get('[data-testid="toast-timer"]').then(($bar) => {
        const atPause = left($bar);
        expect(atPause, 'the bar had started to empty').to.be.lessThan(0.85);
        // Longer than the whole delay: the message is still there, and the bar has not moved
        cy.wait(3500);
        cy.get('[data-testid="toast-error"]').should('exist');
        cy.get('[data-testid="toast-timer"]').then(($same) => expect(Math.abs(left($same) - atPause), 'the bar stayed where it was').to.be.lessThan(0.02));
        cy.get('.notistack-Snackbar').trigger('mouseout').trigger('mouseleave');
        cy.get('[data-testid="toast-timer"]').should('have.attr', 'data-paused', 'false').and('have.css', 'animation-duration', '3s').and('have.css', 'animation-play-state', 'running');
        // It goes on from there: not back to a full bar
        cy.get('[data-testid="toast-timer"]').then(($resumed) => expect(left($resumed), 'the bar did not start again').to.be.at.most(atPause + 0.02));
      });
      // The message goes with the bar, and does not wait for a new delay
      cy.get('[data-testid="toast-error"]', { timeout: 4000 }).should('not.exist');
    });

    it('tells the user when the bulk archive is refused', () => {
      cy.intercept('POST', '/api/data_leak/alert/bulk_update/', { statusCode: 403, body: { detail: DENIED } }).as('bulk');
      cy.get('[data-testid="alert-row"]').first().find('input[type="checkbox"]').check();
      cy.contains('button', /^Archive$/).click();
      cy.get('body').then(($body) => {
        if ($body.find('[role="dialog"]').length) cy.get('[role="dialog"]').contains('button', /Archive|Confirm|Yes/).click();
      });
      cy.wait('@bulk');
      cy.contains(DENIED, { timeout: 10000 }).should('be.visible');
      cy.get('[data-testid="alert-row"]').should('have.length', 1);
    });
  });

  describe('the sign-in', () => {
    it('shows the reason when the server refuses the credentials', () => {
      quiet();
      cy.intercept('GET', '/api/auth/user', { statusCode: 401, body: { detail: 'Authentication credentials were not provided.' } });
      cy.intercept('POST', '/api/auth/login', { statusCode: 400, body: { non_field_errors: ['Incorrect Credentials'] } }).as('login');
      cy.visit('/#/login');
      cy.get('input[autocomplete="username"]', { timeout: 10000 }).type('analyst');
      cy.get('input[autocomplete="current-password"]').type('wrong-password');
      cy.get('button[type="submit"]').click();
      cy.wait('@login');
      cy.get('[data-testid="login-error"]', { timeout: 10000 }).should('contain', 'Incorrect Credentials');
      cy.url().should('include', '#/login');
    });
  });

  describe('an address the app does not know', () => {
    beforeEach(() => {
      quiet();
      cy.visit('/#/no/such/page', { onBeforeLoad: (win) => win.document.cookie = 'session_active=1' });
    });

    it('says so, shows the address that was asked and offers a way out', () => {
      cy.get('[data-testid="not-found"]', { timeout: 10000 }).within(() => {
        cy.contains('h1', 'Nothing to watch here');
        cy.contains('.MuiChip-root', '/no/such/page');
        cy.contains('a', 'Go to the overview').should('have.attr', 'href', '#/');
      });
    });

    it('goes back to the page that was open before', () => {
      cy.visit('/#/connectors', { onBeforeLoad: (win) => win.document.cookie = 'session_active=1' });
      cy.location('hash').should('include', '/connectors');
      cy.window().then((win) => { win.location.hash = '#/no/such/page'; });
      cy.get('[data-testid="not-found"]', { timeout: 10000 }).contains('button', 'Go back').click();
      cy.location('hash').should('include', '/connectors');
    });
  });
});
