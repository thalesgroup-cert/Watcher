// Accounts module: profile page (profile with its access, appearance, my activity), avatar and password dialogs and logout.
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
    cy.visit(path, { onBeforeLoad: (win) => win.document.cookie = 'session_active=1' });

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
      cy.contains('h1', 'My profile', { timeout: 20000 }).should('be.visible');
    });

    it('shows who you are in a card at the top, and not again in the header', () => {
      cy.get('[data-testid="identity-card"]').within(() => {
        cy.contains('h2', 'Test User').should('be.visible');
        cy.contains('@testuser - testuser@watcher.local').should('be.visible');
        cy.contains('div', /^TU$/).should('exist');
        cy.contains('button', 'Change avatar').should('be.visible');
        cy.contains('button', 'Change password').should('be.visible');
      });
      cy.get('h1').should('not.contain', 'Test User');
    });

    it('has the Profile, Appearance and My activity tabs, Profile first', () => {
      cy.get('[role="tab"]').should('have.length', 3).then(($tabs) => {
        expect([...$tabs].map((tab) => tab.textContent)).to.deep.equal(['Profile', 'Appearance', 'My activity']);
      });
      cy.contains('[role="tab"]', 'Profile').should('have.attr', 'aria-selected', 'true');
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
      cy.document().then((doc) => {
        doc.cookie = 'session_active=1';
      });
      cy.reload();
      cy.url({ timeout: 10000 }).should('include', '#/login');
      cy.document().its('cookie').should('not.contain', 'session_active');
    });
  });

  describe('Access, on the profile', () => {
    beforeEach(() => {
      visitProfile('/#/profile');
      cy.contains('.MuiChip-root', 'Superuser', { timeout: 20000 }).should('be.visible');
    });

    it('is a card under the identity, not a tab of its own', () => {
      cy.contains('[role="tab"]', 'Access').should('not.exist');
      cy.contains('h2', 'Access').should('be.visible');
    });

    it('is still reached by its former address, which opens the profile', () => {
      visitProfile('/#/profile?tab=access');
      cy.reload();
      cy.contains('[role="tab"]', 'Profile', { timeout: 20000 }).should('have.attr', 'aria-selected', 'true');
      cy.contains('.MuiChip-root', 'Superuser').should('be.visible');
    });

    it('shows roles, groups and grouped permissions', () => {
      cy.contains('.MuiChip-root', 'Superuser').should('be.visible');
      cy.contains('.MuiChip-root', 'Analysts').should('be.visible');
      cy.contains('button', 'Show the 3 permissions').click();
      cy.get('[data-testid="permissions"]').within(() => {
        cy.contains('Threats Watcher').should('exist');
        cy.contains('Cyber Watch').should('exist');
      });
    });

    it('links superusers to the connectors', () => {
      cy.contains('a', 'Connectors').should('have.attr', 'href').and('include', '/connectors');
    });
  });

  describe('Profile', () => {
    beforeEach(() => {
      visitProfile();
      cy.contains('Change password', { timeout: 20000 }).should('be.visible');
    });

    it('keeps the editor out of the page: it opens in a window from the identity card', () => {
      cy.get('[role="radiogroup"][aria-label="Avatar style"]').should('not.exist');
      cy.get('[data-testid="change-avatar"]').click();
      cy.location('hash').should('include', 'dialog=avatar');
      cy.get('[role="dialog"]').should('contain', 'Change avatar').find('[role="radiogroup"][aria-label="Avatar style"]').should('be.visible');
      cy.get('[role="dialog"]').contains('button', 'Close').click();
      cy.get('[role="dialog"]').should('not.exist');
      cy.location('hash').should('not.include', 'dialog=');
    });

    it('picks a style and saves one of its avatars, and the window closes', () => {
      cy.get('[data-testid="change-avatar"]').click();
      cy.get('[role="radiogroup"][aria-label="Avatar style"] [role="radio"]').eq(1).click();
      cy.contains('button', 'Save avatar').should('be.disabled');
      cy.get('[role="radiogroup"][aria-label$=" avatars"] [role="radio"]').first().click().should('have.attr', 'aria-checked', 'true');
      cy.contains('button', 'Save avatar').should('be.enabled').click();
      cy.wait('@patchProfile').its('request.body.avatar').should('include.keys', ['style', 'seed', 'options']);
      cy.contains('Avatar saved').should('be.visible');
      cy.get('[role="dialog"]').should('not.exist');
    });

    it('goes back to the initials', () => {
      cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { ...PROFILE, avatar: { style: 'bottts', seed: 'watcher', options: {} } } });
      cy.reload(); // the same address: visiting it again would not reload the page
      cy.get('[data-testid="change-avatar"]', { timeout: 20000 }).click();
      cy.contains('button', 'Use my initials', { timeout: 20000 }).click();
      cy.wait('@patchProfile').its('request.body').should('deep.equal', { avatar: null });
      cy.get('[role="dialog"]').should('not.exist');
    });
  });

  describe('Appearance', () => {
    beforeEach(() => {
      visitProfile('/#/profile?tab=appearance');
      cy.get('[role="radiogroup"][aria-label="Theme"]', { timeout: 20000 }).should('be.visible');
    });

    it('lists the thirteen themes and marks the active one', () => {
      cy.get('[role="radiogroup"][aria-label="Theme"] [role="radio"]').should('have.length', 13);
      cy.get('[role="radiogroup"][aria-label="Theme"] [role="radio"][aria-checked="true"]').should('have.length', 1);
    });

    it('keeps the light and the dark themes in their own section', () => {
      cy.get('[data-testid="themes-light"]').should('contain', 'Light - 4').find('[role="radio"]').should('have.length', 4);
      cy.get('[data-testid="themes-dark"]').should('contain', 'Dark - 9').find('[role="radio"]').should('have.length', 9);
      cy.get('[data-testid="themes-light"] [data-testid="theme-paper"]').should('exist');
      cy.get('[data-testid="themes-dark"] [data-testid="theme-midnight"]').should('exist');
    });

    it('filters the themes by mode and by kind', () => {
      cy.get('[data-testid="theme-filter-all"]').should('contain', '13');
      cy.get('[data-testid="theme-filter-light"]').click();
      cy.get('[role="radiogroup"][aria-label="Theme"] [role="radio"]').should('have.length', 4);
      cy.get('[data-testid="themes-dark"]').should('not.exist');
      cy.get('[data-testid="theme-filter-glass"]').click();
      cy.get('[role="radiogroup"][aria-label="Theme"] [role="radio"]').should('have.length', 2);
      cy.get('[data-testid="theme-clay"]').should('exist');
      cy.get('[data-testid="theme-clay_light"]').should('exist');
      cy.get('[data-testid="theme-filter-accessible"]').click();
      cy.get('[role="radiogroup"][aria-label="Theme"] [role="radio"]').should('have.length', 1);
      cy.get('[data-testid="theme-high_contrast"]').should('exist');
      cy.get('[data-testid="theme-filter-ambience"]').click();
      cy.get('[role="radiogroup"][aria-label="Theme"] [role="radio"]').should('have.length', 3);
      cy.get('[data-testid="theme-filter-all"]').click();
      cy.get('[role="radiogroup"][aria-label="Theme"] [role="radio"]').should('have.length', 13);
    });

    it('names what sets a theme apart', () => {
      cy.get('[data-testid="theme-clay"]').should('contain', 'Backdrop effects');
      cy.get('[data-testid="theme-high_contrast"]').should('contain', 'High contrast');
      cy.get('[data-testid="theme-darkly"]').should('contain', 'Classic');
    });

    it('sets the row density, the text size and the chart colours, and keeps them on the account', () => {
      cy.get('[role="radiogroup"][aria-label="Row density"] [role="radio"]').contains('Compact').click();
      cy.wait('@patchProfile').its('request.body.preferences.display').should('deep.include', { density: 'compact' });
      cy.get('[role="radiogroup"][aria-label="Chart colours"] [role="radio"]').contains('Colour-blind safe').click();
      cy.wait('@patchProfile').its('request.body.preferences.display').should('deep.include', { density: 'compact', charts: 'colourblind' });
      cy.get('[role="radiogroup"][aria-label="Row density"] [role="radio"][aria-checked="true"]').should('contain', 'Compact');
    });

    it('scales the text', () => {
      cy.get('.MuiTypography-body2').first().invoke('css', 'font-size').then((before) => {
        cy.get('[role="radiogroup"][aria-label="Text size"] [role="radio"]').contains('Large').click();
        cy.wait('@patchProfile').its('request.body.preferences.display').should('deep.include', { textSize: 'large' });
        cy.get('.MuiTypography-body2').first().invoke('css', 'font-size').should((after) => {
          expect(parseFloat(after)).to.be.greaterThan(parseFloat(before));
        });
      });
    });

    it('reduces the animations on request', () => {
      cy.contains('label', 'Reduce animations').click();
      cy.wait('@patchProfile').its('request.body.preferences.display').should('deep.include', { motion: 'reduced' });
      cy.contains('label', 'Reduce animations').find('input').should('be.checked');
    });

    it('applies the display settings saved on the account', () => {
      cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { ...PROFILE, preferences: { display: { density: 'compact', textSize: 'small', motion: 'reduced', charts: 'colourblind' } } } });
      cy.reload();
      cy.get('[role="radiogroup"][aria-label="Row density"] [role="radio"][aria-checked="true"]', { timeout: 20000 }).should('contain', 'Compact');
      cy.get('[role="radiogroup"][aria-label="Text size"] [role="radio"][aria-checked="true"]').should('contain', 'Small');
      cy.get('[role="radiogroup"][aria-label="Chart colours"] [role="radio"][aria-checked="true"]').should('contain', 'Colour-blind safe');
      cy.contains('label', 'Reduce animations').find('input').should('be.checked');
    });

    it('goes back to the defaults in one save', () => {
      cy.get('[role="radio"][aria-label="Midnight"]').click();
      cy.wait('@patchProfile');
      cy.get('[role="radiogroup"][aria-label="Row density"] [role="radio"]').contains('Compact').click();
      cy.wait('@patchProfile');
      cy.get('[data-testid="reset-appearance"]').click();
      cy.wait('@patchProfile').its('request.body').should((body) => {
        expect(body.theme).to.equal('darkly');
        expect(body.preferences.display).to.deep.equal({ density: 'comfortable', textSize: 'normal', motion: 'system', charts: 'default' });
        expect(body.preferences).to.have.property('effects');
      });
      cy.get('html').should('have.attr', 'data-theme', 'darkly');
      cy.get('[role="radiogroup"][aria-label="Row density"] [role="radio"][aria-checked="true"]').should('contain', 'Comfortable');
    });

    it('turns the typewriter effect of the AI summaries off, kept in the profile', () => {
      cy.intercept('GET', '/api/threats_watcher/summary/config/', { statusCode: 200, body: { regenerate_cooldown_minutes: 60 } });
      cy.contains('label', 'Typewriter effect').find('input').should('be.checked').click();
      cy.wait('@patchProfile').its('request.body').should('deep.equal', { typewriter_enabled: false });
    });

    it('has the very small text size, in Display, as the only way to shrink the interface', () => {
      cy.get('[role="radiogroup"][aria-label="Text size"] [role="radio"]').contains('Very small').click();
      cy.wait('@patchProfile');
      cy.get('[aria-label="Interface size"]').should('not.exist');
    });

    it('lets a superuser set the waiting time between two regenerations of an AI summary', () => {
      cy.intercept('GET', '/api/threats_watcher/summary/config/', { statusCode: 200, body: { regenerate_cooldown_minutes: 60 } });
      cy.intercept('POST', '/api/threats_watcher/summary/config/', { statusCode: 200, body: { success: true, regenerate_cooldown_minutes: 15 } }).as('cooldown');
      cy.reload();
      // 60 minutes is the sixth step of the slider; a range input cannot be typed into, so it is set as the browser would
      cy.get('input[aria-label="Regeneration cooldown"]', { timeout: 20000 }).should('have.attr', 'aria-valuenow', '5').then(($input) => {
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        set.call($input[0], '3');
        $input[0].dispatchEvent(new Event('input', { bubbles: true }));
        $input[0].dispatchEvent(new Event('change', { bubbles: true }));
      });
      cy.wait('@cooldown').its('request.body').should('deep.equal', { regenerate_cooldown_minutes: 15 });
    });

    it('has no backdrop and no effects to set with a theme that has none', () => {
      cy.get('[data-testid="ambient-backdrop"]').should('not.exist');
      cy.get('[aria-label="Background effects"]').should('not.exist');
    });

    it('gives the Clay themes a backdrop, glass panels and effects to set', () => {
      cy.get('[role="radio"][aria-label="Clay"]').click();
      cy.get('html').should('have.attr', 'data-theme', 'clay').and('have.attr', 'data-color-mode', 'dark');
      cy.get('[data-testid="ambient-backdrop"]').should('exist').and('have.css', 'pointer-events', 'none').and('have.css', 'position', 'fixed');
      cy.get('.MuiCard-root').first().should('have.css', 'backdrop-filter').and('include', 'blur');
      cy.get('[role="radio"][aria-label="Clay Light"]').click();
      cy.get('html').should('have.attr', 'data-theme', 'clay_light').and('have.attr', 'data-color-mode', 'light');
      cy.get('[data-testid="ambient-backdrop"]').should('exist');
    });

    describe('the eye of the logo', () => {
      const BACKDROP = '[data-testid="ambient-backdrop"]';

      beforeEach(() => {
        cy.get('[role="radio"][aria-label="Clay"]').click();
        cy.get(BACKDROP).should('have.attr', 'data-effects', 'full');
      });

      it('is big at the bottom right, and its iris looks at the pointer', () => {
        cy.get(`${BACKDROP} .watermark svg .iris`).should('exist');
        cy.get(`${BACKDROP} .watermark`).then(($mark) => {
          const box = $mark[0].getBoundingClientRect();
          expect(box.right).to.be.greaterThan(Cypress.config('viewportWidth') * 0.9);
          expect(box.bottom).to.be.greaterThan(Cypress.config('viewportHeight') * 0.9);
        });
        cy.get('body').trigger('pointermove', { clientX: 5, clientY: 5, force: true });
        cy.get(BACKDROP).should(($layer) => expect(Number($layer[0].style.getPropertyValue('--gx'))).to.be.lessThan(-0.9));
        cy.get('body').trigger('pointermove', { clientX: Cypress.config('viewportWidth') - 5, clientY: Cypress.config('viewportHeight') - 5, force: true });
        cy.get(BACKDROP).should(($layer) => expect(Number($layer[0].style.getPropertyValue('--gx'))).to.be.greaterThan(0.9));
      });

      it('springs out of a click, anywhere, with rings, rays and the eye, then goes', () => {
        cy.get('body').trigger('pointerdown', { clientX: 300, clientY: 250, button: 0, force: true });
        cy.get(`${BACKDROP} .ripple`).should('have.length', 1).within(() => {
          cy.get('.ring').should('have.length', 2);
          cy.get('.rays svg line').should('have.length', 12);
          cy.get('.eye svg .iris').should('exist');
        });
        cy.get(`${BACKDROP} .ripple`).should('have.css', 'left', '300px').and('have.css', 'top', '250px');
        cy.get(`${BACKDROP} .ripple`, { timeout: 5000 }).should('not.exist');
      });

      it('keeps three ripples at most', () => {
        [100, 200, 300, 400, 500].forEach((x) => cy.get('body').trigger('pointerdown', { clientX: x, clientY: 200, button: 0, force: true }));
        cy.get(`${BACKDROP} .ripple`).should('have.length.at.most', 3);
      });

      it('stays still in the calm level: the eye is there, nothing follows the pointer and a click does nothing', () => {
        cy.get('[data-testid="effects-calm"]').click();
        cy.get(BACKDROP).should('have.attr', 'data-effects', 'calm');
        cy.get(`${BACKDROP} .watermark svg`).should('exist');
        cy.get(`${BACKDROP} .spot`).should('not.exist');
        cy.get('body').trigger('pointerdown', { clientX: 300, clientY: 250, button: 0, force: true });
        cy.get(`${BACKDROP} .ripple`).should('not.exist');
      });
    });

    it('sets the effects level, keeps it on the account and drops the backdrop when it is off', () => {
      cy.get('[role="radio"][aria-label="Clay"]').click();
      cy.wait('@patchProfile').its('request.body').should('deep.equal', { theme: 'clay' });
      cy.get('[aria-label="Background effects"]').should('be.visible');
      cy.get('[data-testid="effects-calm"]').click();
      cy.wait('@patchProfile').its('request.body').should('deep.equal', { preferences: { effects: 'calm' } });
      cy.get('[data-testid="ambient-backdrop"]').should('have.attr', 'data-effects', 'calm');
      cy.get('[data-testid="effects-off"]').click();
      cy.wait('@patchProfile').its('request.body').should('deep.equal', { preferences: { effects: 'off' } });
      cy.get('[data-testid="ambient-backdrop"]').should('not.exist');
      // Without the effects the panels are solid: nothing to blur
      cy.get('.MuiCard-root').first().should('have.css', 'backdrop-filter', 'none');
    });

    it('applies the level saved on the account', () => {
      cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { ...PROFILE, theme: 'clay', preferences: { effects: 'off' } } });
      cy.reload();
      cy.get('html').should('have.attr', 'data-theme', 'clay');
      cy.get('[data-testid="effects-off"]', { timeout: 20000 }).should('have.attr', 'aria-pressed', 'true');
      cy.get('[data-testid="ambient-backdrop"]').should('not.exist');
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
  });

  describe('Theme of the account', () => {
    const visitWith = (profile, stored = null) => {
      cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { ...PROFILE, ...profile } });
      cy.visit('/#/profile', {
        onBeforeLoad: (win) => {
          win.document.cookie = 'session_active=1';
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
          win.document.cookie = 'session_active=1';
          win.localStorage.setItem('watcher.theme.mode', 'dark');
        },
      });
      cy.get('html').should('have.attr', 'data-theme', 'darkly');
    });
  });

  describe('My activity', () => {
    const SUMMARY = { week: 12, today: 5, created_today: 2, updated_today: 3, deleted_today: 0 };

    it('loads only the current user events of the last 7 days, without the actor switch', () => {
      visitProfile('/#/profile?tab=activity');
      cy.wait('@feed').its('request.url').should('include', 'actor=me').and('include', 'period=7d');
      cy.get('[aria-label="Who"]').should('not.exist');
      cy.get('[aria-label="Period"] [aria-pressed="true"]').should('contain', '7 days');
      cy.contains('Changes you make will show up here.').should('be.visible');
    });

    it('shows what you did today by kind, and over the week', () => {
      cy.intercept('GET', '/api/timeline/events/summary/*', { statusCode: 200, body: SUMMARY }).as('mySummary');
      visitProfile('/#/profile?tab=activity');
      cy.wait('@mySummary').its('request.url').should('include', 'actor=me');
      cy.get('[data-testid="my-activity-figures"]').within(() => {
        cy.contains('Created today').parent().should('contain', '2');
        cy.contains('Modified today').parent().should('contain', '3');
        cy.contains('Deleted today').parent().should('contain', '0');
        cy.contains('Last 7 days').parent().should('contain', '12');
      });
    });

    it('lets you change the period, and Clear goes back to the last 7 days', () => {
      visitProfile('/#/profile?tab=activity');
      cy.wait('@feed');
      cy.get('[data-testid="period-today"]').click();
      cy.wait('@feed').its('request.url').should('include', 'period=today');
      cy.get('[data-testid="period-30d"]').click();
      cy.wait('@feed').its('request.url').should('include', 'period=30d');
      cy.get('[data-testid="period-all"]').click();
      cy.wait('@feed').its('request.url').should('not.include', 'period=');
      // The list of the last 7 days was loaded a moment ago: it comes back from the cache, with no new request
      cy.contains('button', 'Clear').click();
      cy.get('[aria-label="Period"] [aria-pressed="true"]').should('contain', '7 days');
      cy.contains('button', 'Clear').should('not.exist');
    });
  });

  // Layouts left with the panel grid: every module is a fixed page now, and the old link opens the profile.
  it('opens the profile from the old layouts link', () => {
    visitProfile('/#/profile?tab=layouts');
    cy.contains('[role="tab"]', 'Profile', { timeout: 20000 }).should('have.attr', 'aria-selected', 'true');
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
      cy.document().its('cookie').should('not.contain', 'session_active');
      cy.url().should('include', '#/login');
      cy.contains('h1', 'Sign in').should('be.visible');
    });

    it('keeps no token in the page: the session is a cookie and a request that changes something carries the CSRF token', () => {
      cy.intercept('POST', '/api/auth/logout/', { statusCode: 204 }).as('logout');
      visitProfile();
      cy.window().its('localStorage').invoke('getItem', 'token').should('be.null');
      cy.get('aside[aria-label="Sidebar"] a[aria-label="My profile"]', { timeout: 20000 }).trigger('mouseover');
      // The server sets the CSRF cookie with the page
      cy.getCookie('csrftoken').should('exist').then((cookie) => {
        cy.get('aside[aria-label="Sidebar"] button[aria-label="Sign out"]').click();
        cy.wait('@logout').its('request.headers').should('include', { 'x-csrftoken': cookie.value }).and('not.have.property', 'authorization');
      });
    });

    it('leaves the browser on the default theme, and the account keeps its own', () => {
      cy.intercept('POST', '/api/auth/logout/', { statusCode: 204 }).as('logout');
      cy.intercept('PATCH', '/api/auth/profile', (req) => req.reply({ statusCode: 200, body: PROFILE })).as('saved');
      cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { ...PROFILE, theme: 'cyber' } });
      visitProfile();
      cy.get('html', { timeout: 20000 }).should('have.attr', 'data-theme', 'cyber');
      cy.get('aside[aria-label="Sidebar"] a[aria-label="My profile"]').trigger('mouseover');
      cy.get('aside[aria-label="Sidebar"] button[aria-label="Sign out"]').click();
      cy.wait('@logout');
      cy.contains('h1', 'Sign in').should('be.visible');
      cy.get('html').should('have.attr', 'data-theme', 'darkly');
      cy.window().its('localStorage').invoke('getItem', 'watcher.theme').should('eq', 'darkly');
      // Nothing was saved to the account by the reset
      cy.get('@saved.all').should('have.length', 0);
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
