describe('Profile Page - E2E Test Suite', () => {
  const MODULES = [
    'Threats Watcher',
    'Legitimate Domains',
    'Cyber Watch',
    'Data Leak',
    'Website Monitoring',
    'DNS Threats Monitored',
  ];

  const setupIntercepts = () => {
    cy.intercept('GET', '/api/auth/user/', {
      statusCode: 200,
      body: {
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
      },
    }).as('getUser');

    cy.intercept('PATCH', '/api/auth/profile', { statusCode: 200, body: {} }).as('patchProfile');
    cy.intercept('GET', '/api/auth/preferences/', { statusCode: 200, body: {} }).as('getPrefs');
    cy.intercept('PATCH', '/api/auth/preferences/', { statusCode: 200, body: {} }).as('patchPrefs');
  };

  before(() => {
    const credentials = Cypress.env('testCredentials');

    setupIntercepts();

    cy.intercept('POST', '/api/auth/login/', {
      statusCode: 200,
      body: {
        token: 'mock-token-profile-test',
        user: {
          id: 1,
          username: credentials.username,
          first_name: credentials.firstName,
          email: credentials.email,
          is_superuser: true,
        },
      },
    }).as('login');

    cy.authenticateWithTestUser();

    cy.visit('/#/profile');
    cy.get('.container', { timeout: 20000 }).should('exist');
    cy.log('Navigated to Profile page');
  });

  beforeEach(() => {
    cy.on('uncaught:exception', () => false);

    setupIntercepts();

    cy.window().then((win) => {
      const authData = Cypress.env('authData');
      if (authData && authData.token) {
        win.localStorage.setItem('token', authData.token);
        if (authData.user) win.localStorage.setItem('user', authData.user);
      }
    });

    cy.url().then((url) => {
      if (!url.includes('/profile')) {
        cy.visit('/#/profile', { failOnStatusCode: false });
        cy.wait(500);
      }
    });

    cy.url().should('include', '/profile');
    cy.get('.container', { timeout: 10000 }).should('exist');
  });

  describe('Page Navigation and Access', () => {
    it('should be on the correct Profile page', () => {
      cy.url().should('include', '#/profile');
      cy.get('body').should('be.visible');
    });

    it('should display sidebar navigation', () => {
      cy.get('.nav.flex-column').should('exist');
      cy.get('.nav-link').should('contain', 'Settings');
      cy.get('.nav-link').should('contain', 'Themes');
      cy.get('.nav-link').should('contain', 'Layouts');
    });

    it('should display logout button in sidebar', () => {
      cy.get('button.text-danger').should('contain', 'Logout');
      cy.get('button.text-danger .material-icons').should('contain', 'logout');
    });

    it('should navigate to profile via navbar link', () => {
      cy.visit('/#/');
      cy.get('.navbar, nav').should('exist');

      cy.get('body').then(($body) => {
        const profileLink = $body.find('a[href*="profile"], a:contains("My Profile")');
        if (profileLink.length > 0) {
          cy.wrap(profileLink.first()).click({ force: true });
          cy.url().should('include', '/profile');
        } else {
          cy.log('Profile link in navbar - clicking dropdown first');
          cy.get('.navbar .dropdown-toggle, .navbar [data-bs-toggle="dropdown"]').last().click({ force: true });
          cy.get('a[href*="profile"], a:contains("My Profile")').first().click({ force: true });
          cy.url().should('include', '/profile');
        }
      });
    });
  });

  describe('Settings Section', () => {
    beforeEach(() => {
      cy.get('.nav-link').contains('Settings').click();
      cy.wait(300);
    });

    it('should display Account Settings card', () => {
      cy.get('.card-header').should('contain', 'Account Settings');
      cy.get('.material-icons').should('contain', 'settings');
    });

    it('should display user avatar initials', () => {
      cy.get('.container').within(() => {
        // Avatar is a rounded div with initials
        cy.get('div').filter((i, el) => {
          const s = el.style;
          return s.borderRadius && s.borderRadius.includes('50%') && Cypress.$(el).text().length <= 3;
        }).should('exist');
      });
    });

    it('should display user information fields', () => {
      cy.get('.card-body.p-4').first().within(() => {
        cy.get('label').should('contain', 'Username');
        cy.get('label').should('contain', 'Email');
        cy.get('label').should('contain', 'First Name');
        cy.get('label').should('contain', 'Last Name');
        cy.get('label').should('contain', 'Roles');
      });
    });

    it('should display Superuser badge for superuser account', () => {
      cy.get('.card-body.p-4').first().within(() => {
        cy.get('.badge').should('exist');
        cy.get('.badge.bg-danger').should('contain', 'Superuser');
      });
    });

    it('should display groups and permissions section', () => {
      cy.get('.card-body.p-4').first().within(() => {
        cy.get('label').then(($labels) => {
          const hasPerms = $labels.toArray().some(el =>
            Cypress.$(el).text().includes('Groups Permissions') ||
            Cypress.$(el).text().includes('Roles')
          );
          cy.log(`Permissions/Roles section found: ${hasPerms}`);
          expect(hasPerms).to.be.true;
        });
      });
    });

    it('should display Change Password link', () => {
      cy.get('.card-footer').within(() => {
        cy.get('a[href*="password_change"]').should('exist').should('contain', 'Change Password');
        cy.get('.material-icons').should('contain', 'lock');
      });
    });

    it('should navigate to password change page from link', () => {
      cy.get('a[href*="password_change"]').first().click();
      cy.url().should('include', 'password_change');
      cy.go('back');
      cy.url().should('include', '/profile');
    });
  });

  describe('Settings Section - Interface, AI options & Admin cooldown', () => {
    const PROFILE = {
      avatar_color: null,
      ui_zoom_level: 1.0,
      typewriter_enabled: true,
    };

    const zoomSlider = () =>
      cy.contains('label', 'Interface Size (Zoom)').parent().find('input[type="range"]');
    const cooldownSlider = () =>
      cy.contains('label', 'AI Summary Regeneration Cooldown').parent().find('input[type="range"]');

    const moveSlider = (slider, index) =>
      slider.then(($input) => {
        const input = $input[0];
        const setValue = Object.getOwnPropertyDescriptor(
          input.ownerDocument.defaultView.HTMLInputElement.prototype, 'value'
        ).set;
        setValue.call(input, index);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }).trigger('mouseup');

    beforeEach(() => {
      // Defined after setupIntercepts(): the most recent matching intercept wins
      cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: PROFILE }).as('getProfile');
      cy.intercept('PATCH', '/api/auth/profile', (req) => {
        req.reply({ statusCode: 200, body: { ...PROFILE, ...req.body } });
      }).as('patchProfile');
      cy.intercept('GET', '/api/threats_watcher/summary/config/', {
        statusCode: 200,
        body: { regenerate_cooldown_minutes: 30 },
      }).as('getCooldownConfig');
      cy.intercept('POST', '/api/threats_watcher/summary/config/', (req) => {
        req.reply({ statusCode: 200, body: req.body });
      }).as('postCooldownConfig');

      // Reload so that profile and config are fetched through the mocks above
      cy.reload();
      cy.wait('@getProfile');
      cy.get('.nav-link').contains('Settings').click();
    });

    // Zoom
    it('should display the zoom slider with 4 steps and 100% by default', () => {
      zoomSlider().should('have.value', '3').and('have.attr', 'max', '3');
      ['75%', '80%', '90%', '100%'].forEach((label) => {
        cy.contains('label', 'Interface Size (Zoom)').parent().contains(label).should('exist');
      });
      cy.contains('label', 'Interface Size (Zoom)').parent()
        .contains('.fw-semibold', '100%').should('have.class', 'text-primary');
    });

    it('should send ui_zoom_level as a number when the slider is released', () => {
      moveSlider(zoomSlider(), 1);
      cy.wait('@patchProfile').its('request.body.ui_zoom_level').should('eq', 0.8);
      zoomSlider().should('have.value', '1');
    });

    it('should apply the selected zoom to the page body', () => {
      cy.document().its('body.style.zoom').should('eq', '1');
      moveSlider(zoomSlider(), 1);
      cy.wait('@patchProfile');
      cy.document().its('body.style.zoom').should('eq', '0.8');
    });

    it('should apply the saved zoom level on page load', () => {
      cy.intercept('GET', '/api/auth/profile', {
        statusCode: 200,
        body: { ...PROFILE, ui_zoom_level: 0.9 },
      }).as('getZoomedProfile');
      cy.reload();
      cy.wait('@getZoomedProfile');
      cy.document().its('body.style.zoom').should('eq', '0.9');
    });

    // Typewriter
    it('should display the typewriter switch enabled by default', () => {
      cy.get('#typewriterSwitch').should('be.checked');
      cy.contains('label', 'Enable Typewriter Effect').should('exist');
    });

    it('should send typewriter_enabled=false when the switch is turned off', () => {
      cy.get('#typewriterSwitch').click({ force: true });
      cy.wait('@patchProfile').its('request.body.typewriter_enabled').should('eq', false);
      cy.get('#typewriterSwitch').should('not.be.checked');
    });

    it('should display the switch unchecked when typewriter is disabled in profile', () => {
      cy.intercept('GET', '/api/auth/profile', {
        statusCode: 200,
        body: { ...PROFILE, typewriter_enabled: false },
      }).as('getProfileNoTypewriter');
      cy.reload();
      cy.wait('@getProfileNoTypewriter');
      cy.get('.nav-link').contains('Settings').click();
      cy.get('#typewriterSwitch').should('not.be.checked');
    });

    //Admin cooldown (superuser)
    it('should load the current cooldown from the config endpoint', () => {
      cy.wait('@getCooldownConfig');
      cooldownSlider().should('have.value', '4').and('have.attr', 'max', '10');
      cy.contains('label', 'AI Summary Regeneration Cooldown').parent()
        .contains('.fw-semibold', '30m').should('have.class', 'text-primary');
      cy.contains('label', 'AI Summary Regeneration Cooldown').parent().contains('1m').should('exist');
      cy.contains('label', 'AI Summary Regeneration Cooldown').parent().contains('24h').should('exist');
    });

    it('should POST the new cooldown when the admin releases the slider', () => {
      cy.wait('@getCooldownConfig');
      moveSlider(cooldownSlider(), 5);
      cy.wait('@postCooldownConfig')
        .its('request.body')
        .should('deep.equal', { regenerate_cooldown_minutes: 60 });
      cooldownSlider().should('have.value', '5').and('not.be.disabled');
    });

    // Non-superuser
        it('should hide cooldown settings and not call the config endpoint for a non-superuser', () => {
      let configCalls = 0;
      const nonAdmin = {
        id: 2, username: 'analyst', first_name: 'Ana', last_name: 'Lyst',
        email: 'analyst@watcher.local', is_superuser: false, is_staff: false,
        groups: ['Analysts'], permissions: [],
      };

      // Covers both cases: user reloaded from the API, or restored from localStorage
      cy.intercept('GET', '**/api/auth/user**', { statusCode: 200, body: nonAdmin });
      cy.window().then((win) => {
        const stored = win.localStorage.getItem('user');
        if (stored) {
          win.localStorage.setItem('user', JSON.stringify({ ...JSON.parse(stored), ...nonAdmin }));
        }
      });
      cy.intercept('GET', '/api/threats_watcher/summary/config/', (req) => {
        configCalls += 1;
        req.reply({ statusCode: 403, body: {} });
      });

      cy.reload();
      cy.get('.nav-link').contains('Settings').click();

      // Options available to everyone stay visible
      cy.contains('label', 'Interface Size (Zoom)').should('exist');
      cy.get('#typewriterSwitch').should('exist');

      // Admin-only items are hidden
      cy.contains('.badge', 'Superuser').should('not.exist');
      cy.contains('AI Summary Regeneration Cooldown').should('not.exist');
      cy.contains('.nav-link', 'Connectors').should('not.exist');
      cy.wrap(null).then(() => expect(configCalls).to.eq(0));
    });
  });


  describe('Themes Section', () => {
    beforeEach(() => {
      cy.get('.nav-link').contains('Themes').click();
      cy.wait(300);
    });

    it('should display Choose Your Theme card', () => {
      cy.get('.card-header').should('contain', 'Choose Your Theme');
      cy.get('.material-icons').should('contain', 'palette');
    });

    it('should display theme preview cards', () => {
      // Each theme card has a name and description
      cy.get('.card-body .card').should('have.length.at.least', 2);
      cy.get('.card-body .card .card-body').first().within(() => {
        cy.get('.fw-semibold').should('exist');
        cy.get('.text-muted.small').should('exist');
      });
    });

    it('should switch to a different light theme', () => {
      cy.get('.card-body .card')
        .not('.border-primary')
        .first()
        .click({ force: true });
      cy.wait(500);
      // After clicking, one theme should be active
      cy.get('.card-body .card.border-primary').should('have.length.at.least', 1);
    });

    it('should show dark badge on dark themes', () => {
      cy.get('.card-body .badge').filter((i, el) => Cypress.$(el).text().includes('dark')).should('have.length.at.least', 1);
    });

    it('should display active theme badge in sidebar', () => {
      cy.get('.nav-link').contains('Themes').within(() => {
        cy.get('.badge.bg-primary').should('exist');
      });
    });
  });

  describe('Layouts Section', () => {
    beforeEach(() => {
      cy.get('.nav-link').contains('Layouts').click();
      cy.wait(300);
    });

    it('should display Dashboard Layouts card', () => {
      cy.get('.card-header').should('contain', 'Dashboard Layouts');
      cy.get('.material-icons').should('contain', 'dashboard_customize');
    });

    it('should describe layout persistence', () => {
      cy.get('.card-header').should('contain', 'saved to your account');
    });

    it('should display all module layout cards', () => {
      MODULES.forEach((moduleName) => {
        cy.get('.card-body .card').filter((i, el) => {
          return Cypress.$(el).text().includes(moduleName);
        }).should('have.length.at.least', 1);
      });
    });

    it('should display MiniGrid preview in each module card', () => {
      // MiniGrid is a relative-positioned div with overflow:hidden
      cy.get('.card-body .row.g-3 .card').first().within(() => {
        cy.get('div[style*="position: relative"]').should('exist');
      });
    });

    it('should display preset badge on each layout card', () => {
      cy.get('.card-body .row.g-3 .card').first().within(() => {
        cy.get('.badge').should('exist');
      });
    });

    it('should display edit icon on layout cards', () => {
      cy.get('.card-body .row.g-3 .card').first().within(() => {
        cy.get('.material-icons').should('contain', 'edit');
      });
    });

    it('should open layout editor modal on card click', () => {
      cy.get('.card-body .row.g-3 .card').first().click();
      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('contain', 'Layout Presets');
      cy.get('.modal button:contains("Close")').first().click();
    });

    it('should display both Presets and Custom Editor tabs in modal', () => {
      cy.get('.card-body .row.g-3 .card').first().click();
      cy.get('.modal', { timeout: 10000 }).should('be.visible');

      cy.get('.modal').within(() => {
        cy.get('button').should('contain', 'Presets');
        cy.get('button').should('contain', 'Custom Editor');
      });

      cy.get('.modal button:contains("Close")').first().click();
    });

    it('should display preset cards in the Presets tab', () => {
      cy.get('.card-body .row.g-3 .card').first().click();
      cy.get('.modal', { timeout: 10000 }).should('be.visible');

      cy.get('.modal').within(() => {
        cy.get('button').contains('Presets').click();
        cy.wait(300);
        // Bootstrap columns render as div[class*="col"] not .col
        cy.get('.modal-body [class*="col"]').should('have.length.at.least', 1);
      });

      cy.get('.modal button:contains("Close")').first().click();
    });

    it('should switch to Custom Editor tab and show drag layout', () => {
      cy.get('.card-body .row.g-3 .card').first().click();
      cy.get('.modal', { timeout: 10000 }).should('be.visible');

      cy.get('.modal').within(() => {
        cy.get('button').contains('Custom Editor').click();
        cy.wait(500);
        cy.get('.react-grid-layout, [class*="grid-layout"]').should('exist');
      });

      cy.get('.modal button:contains("Close")').first().click();
    });

    it('should display Reset to Default button in layout modal', () => {
      cy.get('.card-body .row.g-3 .card').first().click();
      cy.get('.modal', { timeout: 10000 }).should('be.visible');

      cy.get('.modal .modal-footer').within(() => {
        cy.get('button').should('contain', 'Reset to Default');
      });

      cy.get('.modal button:contains("Close")').first().click();
    });

    it('should toggle help section visibility', () => {
      cy.get('.card-body button:contains("Need help with layouts?")').click();
      cy.wait(300);
      cy.get('.border-start.border-primary').should('be.visible');

      cy.get('.card-body button:contains("Need help with layouts?")').click();
      cy.wait(300);
      cy.get('.border-start.border-primary').should('not.exist');
    });

    it('should show correct panel count in each module card', () => {
      cy.get('.card-body .row.g-3 .card').first().within(() => {
        cy.get('.text-muted.small').should('contain', 'panels visible');
      });
    });

    it('should show preset count label', () => {
      cy.get('.card-body .row.g-3 .card').first().within(() => {
        cy.get('.text-muted').filter((i, el) => Cypress.$(el).text().includes('presets available')).should('exist');
      });
    });

    it('should apply a preset and close modal', () => {
      cy.get('.card-body .row.g-3 .card').eq(1).click();
      cy.get('.modal', { timeout: 10000 }).should('be.visible');

      cy.get('.modal').within(() => {
        cy.get('button').contains('Presets').click();
        cy.wait(300);

        // PresetCards render as styled divs inside Bootstrap cols
        cy.get('.modal-body [class*="col"]').first().click();
      });

      // Modal should close after applying preset
      cy.get('.modal').should('not.exist');
    });
  });

  describe('Navigation and UI Tests', () => {
    it('should highlight active nav section', () => {
      cy.get('.nav-link').contains('Settings').click();
      cy.get('.nav-link.active').should('contain', 'Settings');

      cy.get('.nav-link').contains('Themes').click();
      cy.get('.nav-link.active').should('contain', 'Themes');

      cy.get('.nav-link').contains('Layouts').click();
      cy.get('.nav-link.active').should('contain', 'Layouts');
    });

    it('should display 3 sidebar navigation items', () => {
      cy.get('.nav.flex-column .nav-item').should('have.length.at.least', 3);
    });

    it('should handle Bootstrap components correctly', () => {
      cy.get('.container').should('exist');
      cy.get('.row').should('exist');
      cy.get('.card').should('have.length.at.least', 2);
    });
  });

  describe('Performance and Integration Tests', () => {
    it('should load profile page within reasonable time', () => {
      const start = Date.now();
      cy.reload();
      cy.get('.container', { timeout: 20000 }).should('exist').then(() => {
        const loadTime = Date.now() - start;
        expect(loadTime).to.be.lessThan(25000);
      });
    });

    it('should verify all 3 sections are accessible', () => {
      ['Settings', 'Themes', 'Layouts'].forEach((section) => {
        cy.get('.nav-link').contains(section).click();
        cy.wait(200);
        cy.get('.card-header h5').should('exist');
      });
    });

    it('should maintain session across profile tab changes', () => {
      cy.get('.nav-link').contains('Settings').click();
      cy.get('.nav-link').contains('Themes').click();
      cy.get('.nav-link').contains('Layouts').click();
      cy.get('.nav-link').contains('Settings').click();

      cy.get('.card-header').should('contain', 'Account Settings');
    });
  });

  after(() => {
    cy.log('Profile test cleanup...');

    const authData = Cypress.env('authData');
    if (authData && authData.token) {
      cy.request({
        method: 'PATCH',
        url: '/api/auth/preferences/',
        headers: { Authorization: `Token ${authData.token}` },
        body: {},
        failOnStatusCode: false,
      });
    }

    cy.window().then((win) => {
      win.localStorage.clear();
      win.sessionStorage.clear();
    });

    cy.log('Profile test cleanup completed');
  });
});
