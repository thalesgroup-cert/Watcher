// Accounts module: profile page (overview, my activity), password dialog and logout.
describe('Profile Page - E2E Test Suite', () => {
  const USER = {
    id: 1,
    username: 'testuser',
    first_name: 'Test',
    last_name: 'User',
    email: 'testuser@watcher.local',
    is_superuser: true,
    is_staff: false,
    groups: ['Analysts'],
    permissions: [
      'threats_watcher.add_source',
      'threats_watcher.change_source',
      'cyber_watch.add_watchrule',
    ],
  };

  const PROFILE = { theme: '', preferences: {}, avatar_color: '#2196f3' };

  const visitProfile = (path = '/#/profile') =>
    cy.visit(path, { onBeforeLoad: (win) => win.localStorage.setItem('token', 'mock-token-profile-test') });

  beforeEach(() => {
    cy.on('uncaught:exception', () => false);

    cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: USER }).as('getUser');
    cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: PROFILE }).as('getProfile');
    cy.intercept('PATCH', '/api/auth/profile', (req) => {
      req.reply({ statusCode: 200, body: { ...PROFILE, ...req.body } });
    }).as('patchProfile');
    cy.intercept('GET', '/api/timeline/events/feed/*', { statusCode: 200, body: { next: null, previous: null, results: [] } }).as('feed');
  });

  describe('Header and navigation', () => {
    beforeEach(() => {
      visitProfile();
      cy.contains('h1', 'Test User', { timeout: 20000 }).should('be.visible');
    });

    it('shows the identity in the page header', () => {
      cy.contains('@testuser').should('be.visible');
      cy.contains('testuser@watcher.local').should('be.visible');
      cy.contains('div', /^TU$/).should('exist');
    });

    it('has Overview and My activity tabs, Overview first', () => {
      cy.get('[role="tab"]').should('have.length', 2);
      cy.contains('[role="tab"]', 'Overview').should('have.attr', 'aria-selected', 'true');
    });

    it('keeps the selected tab in the URL', () => {
      cy.contains('[role="tab"]', 'My activity').click();
      cy.location('hash').should('include', 'tab=activity');
      cy.reload();
      cy.contains('[role="tab"]', 'My activity', { timeout: 20000 }).should('have.attr', 'aria-selected', 'true');
    });

    it('opens the profile from the sidebar', () => {
      cy.visit('/#/');
      cy.get('aside[aria-label="Sidebar"] a[aria-label="My profile"]').click();
      cy.location('hash').should('include', '/profile');
    });

    it('has no light/dark button in the sidebar', () => {
      cy.get('aside[aria-label="Sidebar"]').should('exist');
      cy.get('aside[aria-label="Sidebar"] [aria-label="Dark mode"], aside[aria-label="Sidebar"] [aria-label="Light mode"]').should('not.exist');
      cy.get('aside[aria-label="Sidebar"]').contains(/^(Dark|Light) mode$/).should('not.exist');
    });

    it('redirects to login without a valid session', () => {
      cy.intercept('GET', '/api/auth/user', { statusCode: 401, body: { detail: 'Invalid token.' } });
      // The beforeEach already opened /#/profile: a second visit changes nothing but the hash and would not reload the app.
      cy.window().then((win) => win.localStorage.setItem('token', 'expired'));
      cy.reload();
      cy.url({ timeout: 10000 }).should('include', '#/login');
      cy.window().its('localStorage.token').should('not.exist');
    });
  });

  describe('Overview', () => {
    beforeEach(() => {
      visitProfile();
      cy.contains('Appearance', { timeout: 20000 }).should('be.visible');
    });

    it('shows roles, groups and grouped permissions', () => {
      cy.contains('.MuiChip-root', 'Superuser').should('be.visible');
      cy.contains('.MuiChip-root', 'Analysts').should('be.visible');
      cy.contains('button', '3 permissions across 2 apps').click();
      cy.get('[data-testid="permissions"]').within(() => {
        cy.contains('threats_watcher').should('exist');
        cy.contains('.MuiChip-root', 'add_watchrule').should('exist');
      });
    });

    it('saves a new avatar color', () => {
      cy.get('button[aria-label="Avatar color #2196f3"]').should('have.attr', 'aria-pressed', 'true');
      cy.get('button[aria-label="Avatar color #4caf50"]').click();
      cy.wait('@patchProfile').its('request.body').should('deep.equal', { avatar_color: '#4caf50' });
      cy.get('button[aria-label="Avatar color #4caf50"]').should('have.attr', 'aria-pressed', 'true');
    });

    it('resets the avatar color to auto', () => {
      cy.contains('button', 'Auto').click();
      cy.wait('@patchProfile').its('request.body').should('deep.equal', { avatar_color: null });
    });

    it('lists the ten themes and marks the active one', () => {
      cy.get('[role="radiogroup"][aria-label="Theme"] [role="radio"]').should('have.length', 10);
      cy.get('[role="radio"][aria-checked="true"]').should('have.length', 1);
    });

    it('saves a new theme and applies it', () => {
      cy.get('[role="radio"][aria-label="Midnight"]').click();
      cy.wait('@patchProfile').its('request.body').should('deep.equal', { theme: 'midnight' });
      cy.get('html').should('have.attr', 'data-theme', 'midnight').and('have.attr', 'data-color-mode', 'dark');
      cy.get('[role="radio"][aria-label="Midnight"]').should('have.attr', 'aria-checked', 'true');
      cy.get('[role="radio"][aria-label="Paper"]').click();
      cy.get('html').should('have.attr', 'data-theme', 'paper').and('have.attr', 'data-color-mode', 'light');
    });

    it('moves between themes with the arrow keys', () => {
      cy.get('[role="radio"][aria-label="Light"]').click();
      cy.get('[role="radio"][aria-label="Light"]').focus().type('{rightarrow}');
      cy.focused().should('have.attr', 'aria-label', 'Paper');
      cy.focused().type(' ');
      cy.get('html').should('have.attr', 'data-theme', 'paper');
    });

    it('links superusers to the connectors', () => {
      cy.contains('a', 'Connectors').should('have.attr', 'href').and('include', '/connectors');
    });
  });

  describe('Theme of the account', () => {
    const visitWith = (profile, stored = null) => {
      cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { ...PROFILE, ...profile } });
      cy.visit('/#/profile', {
        onBeforeLoad: (win) => {
          win.localStorage.setItem('token', 'mock-token-profile-test');
          if (stored) win.localStorage.setItem('watcher.theme', stored);
        },
      });
      cy.contains('Appearance', { timeout: 20000 }).should('be.visible');
    };

    it('applies the theme saved in the account', () => {
      visitWith({ theme: 'cyber' });
      cy.get('html').should('have.attr', 'data-theme', 'cyber').and('have.attr', 'data-color-mode', 'dark');
    });

    it('lets the account theme win over the browser one', () => {
      visitWith({ theme: 'paper' }, 'metal');
      cy.get('html').should('have.attr', 'data-theme', 'paper').and('have.attr', 'data-color-mode', 'light');
    });

    it('keeps the browser theme when the account has not chosen one', () => {
      visitWith({ theme: '' }, 'slate');
      cy.get('html').should('have.attr', 'data-theme', 'slate');
    });

    it('ignores a former theme id', () => {
      visitWith({ theme: 'bootstrap' }, 'midnight');
      cy.get('html').should('have.attr', 'data-theme', 'midnight');
    });

    it('reads the former light/dark choice once', () => {
      cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: PROFILE });
      cy.visit('/#/profile', {
        onBeforeLoad: (win) => {
          win.localStorage.setItem('token', 'mock-token-profile-test');
          win.localStorage.setItem('watcher.theme.mode', 'dark');
        },
      });
      cy.get('html').should('have.attr', 'data-theme', 'graphite');
    });
  });

  describe('My activity', () => {
    it('loads only the current user events, without the actor switch', () => {
      visitProfile('/#/profile?tab=activity');
      cy.wait('@feed').its('request.url').should('include', 'actor=me');
      cy.get('[aria-label="Who"]').should('not.exist');
      cy.contains('Changes you make will show up here.').should('be.visible');
    });
  });

  // Layouts left with the panel grid: every module is a fixed page now, and the old link opens the overview.
  it('opens the overview from the old layouts link', () => {
    visitProfile('/#/profile?tab=layouts');
    cy.contains('[role="tab"]', 'Overview', { timeout: 20000 }).should('have.attr', 'aria-selected', 'true');
  });

  describe('Change password dialog', () => {
    beforeEach(() => {
      // The former page URL now opens the dialog on the profile.
      visitProfile('/#/password_change');
      cy.get('[role="dialog"]', { timeout: 20000 }).should('be.visible');
      cy.location('hash').should('include', 'dialog=password');
      cy.get('input[name="old_password"]').type('old-password');
      cy.get('input[name="password"]').type('new-password-1');
    });

    it('blocks mismatching passwords', () => {
      cy.get('input[name="confirmed_password"]').type('something-else');
      cy.contains('Passwords do not match').should('be.visible');
      cy.get('[role="dialog"]').contains('button', 'Change password').should('be.disabled');
    });

    it('keeps the dialog when the server refuses', () => {
      cy.intercept('POST', '/api/auth/passwordchange/', { statusCode: 400, body: { old_password: ['Wrong password.'] } });
      cy.get('input[name="confirmed_password"]').type('new-password-1');
      cy.get('[role="dialog"]').contains('button', 'Change password').click();
      cy.contains('Old Password: Wrong password.').should('be.visible');
      cy.get('[role="dialog"]').should('be.visible');
    });

    it('closes after a successful change', () => {
      cy.intercept('POST', '/api/auth/passwordchange/', { statusCode: 201, body: {} }).as('change');
      cy.get('input[name="confirmed_password"]').type('new-password-1');
      cy.get('[role="dialog"]').contains('button', 'Change password').click();
      cy.wait('@change').its('request.body').should('deep.equal', { old_password: 'old-password', password: 'new-password-1' });
      cy.contains('Password Change Successful').should('be.visible');
      cy.get('[role="dialog"]').should('not.exist');
      cy.location('hash').should('not.include', 'dialog=');
    });
  });

  describe('Logout', () => {
    it('clears the session from the sidebar', () => {
      cy.intercept('POST', '/api/auth/logout/', { statusCode: 204 }).as('logout');
      visitProfile();
      cy.get('aside[aria-label="Sidebar"] a[aria-label="My profile"]', { timeout: 20000 }).trigger('mouseover');
      cy.get('aside[aria-label="Sidebar"] button[aria-label="Sign out"]').click();
      cy.wait('@logout');
      cy.window().its('localStorage.token').should('not.exist');
      cy.url().should('include', '#/login');
      cy.contains('h1', 'Sign in').should('be.visible');
    });
  });

  describe('Sign-in page', () => {
    it('has no light/dark button', () => {
      cy.intercept('GET', '/api/auth/user', { statusCode: 401, body: { detail: 'Authentication credentials were not provided.' } });
      cy.visit('/#/login');
      cy.contains('h1', 'Sign in').should('be.visible');
      cy.get('[aria-label="Dark mode"], [aria-label="Light mode"]').should('not.exist');
    });
  });
});
