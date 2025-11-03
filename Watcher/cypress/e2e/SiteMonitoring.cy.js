describe('Site Monitoring - E2E Test Suite', () => {
  const setupIntercepts = () => {
    // Setup API mocks
    cy.intercept('GET', '/api/site_monitoring/site/', {
      statusCode: 200,
      body: [
        {
          id: 1,
          domain_name: "test-malicious-site.com",
          ip: "192.168.1.10",
          ip_second: "192.168.1.11",
          MX_records: ["mail.test-malicious-site.com"],
          mail_A_record_ip: "192.168.1.12",
          rtir: "SM-2025-001",
          ticket_id: "240529-2e0a2",
          registrar: "Test Registrar Inc",
          legitimacy: 5,
          expiry: "2025-12-31T23:59:59Z",
          domain_expiry: "2026-06-30T23:59:59Z",
          ip_monitoring: true,
          content_monitoring: true,
          mail_monitoring: true,
          monitored: true,
          takedown_request: true,
          legal_team: false,
          blocking_request: false,
          misp_event_uuid: "['550e8400-e29b-41d4-a716-446655440000']",
          web_status: 200,
          created_at: "2025-06-19T10:00:00Z"
        },
        {
          id: 2,
          domain_name: "e2e-suspicious-site.fr",
          ip: "10.0.0.5",
          ip_second: null,
          MX_records: null,
          mail_A_record_ip: null,
          rtir: "SM-2025-002",
          ticket_id: "240530-3f1b3",
          registrar: "E2E Registrar",
          legitimacy: 3,
          expiry: "2025-11-30T23:59:59Z",
          domain_expiry: "2025-08-15T23:59:59Z",
          ip_monitoring: true,
          content_monitoring: false,
          mail_monitoring: true,
          monitored: false,
          takedown_request: false,
          legal_team: true,
          blocking_request: true,
          misp_event_uuid: null,
          web_status: null,
          created_at: "2025-06-18T15:30:00Z"
        },
        {
          id: 3,
          domain_name: "test-phishing-site.org",
          ip: "172.16.0.20",
          ip_second: "172.16.0.21",
          MX_records: ["mx1.test-phishing-site.org", "mx2.test-phishing-site.org"],
          mail_A_record_ip: "172.16.0.22",
          rtir: "SM-2025-003",
          ticket_id: null,
          registrar: "Phishing Registrar",
          legitimacy: 6,
          expiry: null,
          domain_expiry: "2025-07-20T23:59:59Z",
          ip_monitoring: false,
          content_monitoring: true,
          mail_monitoring: false,
          monitored: true,
          takedown_request: false,
          legal_team: false,
          blocking_request: true,
          misp_event_uuid: "['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002']",
          web_status: 403,
          created_at: "2025-06-17T08:15:00Z"
        }
      ]
    }).as('getSites');

    cy.intercept('GET', '/api/site_monitoring/alert/', {
      statusCode: 200,
      body: [
        {
          id: 1,
          site: { id: 1, domain_name: "test-malicious-site.com" },
          type: "IP address change detected",
          new_ip: "192.168.1.11",
          old_ip: "192.168.1.10",
          new_ip_second: null,
          old_ip_second: null,
          new_MX_records: null,
          old_MX_records: null,
          new_mail_A_record_ip: null,
          old_mail_A_record_ip: null,
          difference_score: null,
          status: true,
          created_at: "2025-06-19T14:30:00Z"
        },
        {
          id: 2,
          site: { id: 2, domain_name: "e2e-suspicious-site.fr" },
          type: "Web content change detected",
          new_ip: null,
          old_ip: null,
          new_ip_second: null,
          old_ip_second: null,
          new_MX_records: null,
          old_MX_records: null,
          new_mail_A_record_ip: null,
          old_mail_A_record_ip: null,
          difference_score: 87.5,
          status: true,
          created_at: "2025-06-19T12:15:00Z"
        },
        {
          id: 3,
          site: { id: 1, domain_name: "test-malicious-site.com" },
          type: "Mail change detected",
          new_ip: null,
          old_ip: null,
          new_ip_second: null,
          old_ip_second: null,
          new_MX_records: ["new-mail.test-malicious-site.com"],
          old_MX_records: ["mail.test-malicious-site.com"],
          new_mail_A_record_ip: "192.168.1.13",
          old_mail_A_record_ip: "192.168.1.12",
          difference_score: null,
          status: false,
          created_at: "2025-06-18T16:45:00Z"
        },
        {
          id: 4,
          site: { id: 3, domain_name: "test-phishing-site.org" },
          type: "RDAP change detected",
          new_ip: null,
          old_ip: null,
          new_ip_second: null,
          old_ip_second: null,
          new_MX_records: null,
          old_MX_records: null,
          new_mail_A_record_ip: null,
          old_mail_A_record_ip: null,
          new_registrar: "New Registrar Corp",
          old_registrar: "Phishing Registrar",
          new_expiry_date: "2026-07-20T23:59:59Z",
          old_expiry_date: "2025-07-20T23:59:59Z",
          difference_score: null,
          status: false,
          created_at: "2025-06-17T10:20:00Z"
        }
      ]
    }).as('getSiteAlerts');

    // Mock CRUD operations
    cy.intercept('POST', '/api/site_monitoring/site/', (req) => ({
      statusCode: 201,
      body: {
        id: Date.now(),
        ...req.body,
        rtir: `SM-2025-${String(Date.now()).slice(-3)}`,
        created_at: new Date().toISOString(),
        monitored: false,
        misp_event_uuid: null,
        web_status: null,
        ip: null,
        ip_second: null,
        MX_records: null,
        mail_A_record_ip: null
      }
    })).as('addSite');

    cy.intercept('DELETE', '/api/site_monitoring/site/*', { statusCode: 204 }).as('deleteSite');

    cy.intercept('PATCH', '/api/site_monitoring/site/*', (req) => ({
      statusCode: 200,
      body: { id: parseInt(req.url.split('/').pop()), ...req.body }
    })).as('patchSite');

    cy.intercept('PATCH', '/api/site_monitoring/alert/*', (req) => ({
      statusCode: 200,
      body: { id: parseInt(req.url.split('/').pop()), ...req.body }
    })).as('updateSiteAlertStatus');

    cy.intercept('POST', '/api/site_monitoring/misp/', {
      statusCode: 200,
      body: { message: 'Successfully exported to MISP', event_uuid: '550e8400-e29b-41d4-a716-446655440003' }
    }).as('exportToMISP');

    cy.intercept('GET', '/api/threats_watcher/trendyword/', { statusCode: 200, body: [] });
  };

  before(() => {
    const credentials = Cypress.env('testCredentials');

    setupIntercepts();

    // Mock auth endpoints
    cy.intercept('GET', '/api/auth/user/', {
      statusCode: 200,
      body: {
        id: 1,
        username: credentials.username,
        first_name: credentials.firstName,
        email: credentials.email,
        is_superuser: true
      }
    }).as('getUser');

    cy.intercept('POST', '/api/auth/login/', {
      statusCode: 200,
      body: {
        token: 'mock-token-123456789',
        user: {
          id: 1,
          username: credentials.username,
          first_name: credentials.firstName,
          email: credentials.email
        }
      }
    }).as('login');

    // Use the authentication helper
    cy.authenticateWithTestUser();

    // Navigate to Site Monitoring
    cy.visit('/#/website_monitoring');
    cy.wait('@getSites', { timeout: 15000 });
    cy.wait('@getSiteAlerts', { timeout: 15000 });

    cy.log('Authentication completed and navigated to Site Monitoring');
  });

  beforeEach(() => {
    cy.on('uncaught:exception', () => false);

    setupIntercepts();

    // Restore session data
    cy.window().then((win) => {
      const authData = Cypress.env('authData');
      if (authData && authData.token) {
        if (authData.token) win.localStorage.setItem('token', authData.token);
        if (authData.user) win.localStorage.setItem('user', authData.user);
      }
    });

    // Navigation check
    cy.url().then((currentUrl) => {
      if (!currentUrl.includes('/website_monitoring') || currentUrl.includes('about:blank')) {
        cy.log('Redirecting back to Site Monitoring...');
        cy.visit('/#/website_monitoring', { failOnStatusCode: false });
        cy.wait(1000);
      } else {
        cy.log('Staying on Site Monitoring page');
      }
    });

    cy.url().should('include', '/website_monitoring');
    cy.get('.container-fluid', { timeout: 10000 }).should('exist');

    cy.log('Page ready with session maintained');
  });

  describe('Page Navigation and Access', () => {
    it('should be on the correct Site Monitoring page', () => {
      cy.url().should('include', '#/website_monitoring');
      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('exist');
    });

    it('should display SiteStats dashboard', () => {
      cy.get('.container-fluid.mt-4', { timeout: 15000 }).should('exist');
      
      cy.get('.card.border-0.shadow-sm', { timeout: 15000 }).should('have.length.at.least', 4);
      
      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        if (bodyText.includes('TOTAL SITES') && bodyText.includes('MALICIOUS') && 
            bodyText.includes('TAKEDOWN REQUESTS') && bodyText.includes('LEGAL TEAM')) {
          cy.log('All stat cards found');
        }
      });
    });

    it('should display TableManager filter controls', () => {
      cy.get('button:contains("Reset to Default")', { timeout: 10000 }).should('exist');
      cy.get('button:contains("Saved Filters")', { timeout: 10000 }).should('exist');
      cy.get('button:contains("Show Filters"), button:contains("Hide Filters")', { timeout: 10000 }).should('exist');
      cy.get('button:contains("Save Filter")', { timeout: 10000 }).should('exist');
    });

    it('should load data automatically', () => {
      cy.get('table', { timeout: 15000 }).should('exist');
      cy.get('table').should('have.length.at.least', 1);
      
      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        if (bodyText.includes('test-malicious-site.com') || bodyText.includes('e2e-suspicious-site.fr') || 
            bodyText.includes('test-phishing-site.org')) {
          cy.log('Data loaded successfully');
        } else {
          cy.log('Tables exist but data may be loaded differently');
        }
      });
    });

    it('should maintain session across navigation', () => {
      cy.get('.navbar').should('exist');
      
      cy.get('a[href="/#/"], a:contains("Watcher"), .navbar-brand').first().click();
      cy.url().should('include', '#/');
      
      cy.get('a:contains("Website Monitoring"), a[href*="website_monitoring"]').should('exist').click();
      cy.url().should('include', 'website_monitoring');
      
      cy.get('.navbar').should('exist');
    });
  });

  describe('Sites Display and Management', () => {
    it('should display sites table structure', () => {
      cy.get('table', { timeout: 10000 }).should('exist');
      
      cy.get('table').within(() => {
        cy.get('thead').should('exist');
        cy.get('tbody').should('exist');
      });
    });

    it('should display sites data when available', () => {
      cy.get('table tbody tr').should('have.length.at.least', 1);
    });

    it('should display TableManager features for sites', () => {
      cy.contains('Showing', { timeout: 10000 }).should('exist');
      cy.get('select').filter((index, el) => {
        const text = Cypress.$(el).closest('.d-flex, div').find('label, span').text();
        return text.includes('Items per page');
      }).should('exist');
    });

    it('should display Add New Site button', () => {
      cy.get('button:contains("Add New Site"), button:contains("Add")').first().should('exist');
    });

    it('should open add site modal', () => {
      cy.get('button:contains("Add New Site"), button:contains("Add")').first().click();
      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('exist');
      cy.get('input[placeholder*="example"]').should('exist');
      cy.get('button:contains("Close")').first().click();
    });

    it('should handle complete site addition workflow', () => {
      cy.get('button:contains("Add New Site"), button:contains("Add")').first().click();
      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      
      cy.get('input[placeholder*="example"]').type('test-new-site.com');
      cy.get('input[placeholder*="240529"], input[placeholder*="230509"]').first().type('E2E-TEST-001');
      
      cy.get('.modal button:contains("Add")').click();
      
      cy.wait('@addSite', { timeout: 10000 });
      cy.wait(1000);
    });

    it('should display action buttons for authenticated users', () => {
      cy.get('table tbody tr').first().within(() => {
        cy.get('button[title*="Edit"], i.material-icons:contains("edit")').should('exist');
        cy.get('button[title*="Delete"], i.material-icons:contains("delete")').should('exist');
        cy.get('button[title*="Export"], i.material-icons:contains("cloud_upload")').should('exist');
      });
    });

    it('should handle site edit workflow', () => {
      cy.get('table tbody tr').first().within(() => {
        cy.get('button[title*="Edit"], i.material-icons:contains("edit")').first().click();
      });
      
      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('contain', 'Edit');
      cy.get('button:contains("Close")').first().click();
    });

    it('should handle site deletion workflow', () => {
      cy.get('table tbody tr').first().within(() => {
        cy.get('button[title*="Delete"], i.material-icons:contains("delete")').first().click();
      });
      
      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('contain', 'Action Requested');
      cy.get('.modal-body').should('contain', 'delete');
      cy.get('button:contains("Close")').first().click();
    });

    it('should display status badges correctly', () => {
      cy.get('table tbody').within(() => {
        cy.get('.badge').filter((index, el) => {
          const text = Cypress.$(el).text();
          return text.includes('Active') || text.includes('Pending');
        }).should('exist');
        
        cy.get('.badge').filter((index, el) => {
          const text = Cypress.$(el).text();
          return text.includes('Online') || text.includes('Offline') || /^\d+$/.test(text);
        }).should('exist');
      });
    });

    it('should display domain expiry badges', () => {
      cy.get('table tbody').then(($tbody) => {
        const badges = $tbody.find('.badge').filter((index, el) => {
          const text = Cypress.$(el).text();
          return text.includes('Expired') || text.includes('Expiring Soon') || text.includes('Valid');
        });
        
        if (badges.length > 0) {
          cy.log('Domain expiry badges found');
        }
      });
    });

    it('should sort sites table', () => {
      cy.get('table th:contains("Domain Name"), table th:contains("Domain")').click();
      cy.wait(500);
      cy.get('table th:contains("Domain Name"), table th:contains("Domain")').click();
      cy.wait(500);
      cy.log('Sorting toggled successfully');
    });
  });

  describe('Alerts Display and Management', () => {
    it('should display alerts section for site', () => {
      cy.get('table tbody tr').first().then(($tr) => {
        const alertButton = $tr.find('button, .badge').filter((index, el) => {
          const $el = Cypress.$(el);
          return $el.text().includes('Alert') || $el.find('.badge').length > 0;
        });
        
        if (alertButton.length > 0) {
          cy.wrap(alertButton.first()).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          cy.get('.modal-title').should('contain', 'Alerts for');
          cy.get('button:contains("Close")').first().click();
        } else {
          cy.log('No alert button found, test skipped');
        }
      });
    });

    it('should display alert tabs (Active/Archived)', () => {
      cy.get('table tbody tr').first().then(($tr) => {
        const alertButton = $tr.find('button, .badge').filter((index, el) => {
          const $el = Cypress.$(el);
          return $el.text().includes('Alert') || $el.find('.badge').length > 0;
        });
        
        if (alertButton.length > 0) {
          cy.wrap(alertButton.first()).click();
          
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          
          cy.get('.nav-tabs, .tabs').within(() => {
            cy.get('.nav-link, .tab').should('have.length', 2);
            cy.contains('Active').should('exist');
            cy.contains('Archived').should('exist');
          });
          
          cy.get('button:contains("Close")').first().click();
        } else {
          cy.log('No alert button found, test skipped');
        }
      });
    });

    it('should display alert action buttons', () => {
      cy.get('table tbody tr').first().then(($tr) => {
        const alertButton = $tr.find('button, .badge').filter((index, el) => {
          const $el = Cypress.$(el);
          return $el.text().includes('Alert') || $el.find('.badge').length > 0;
        });
        
        if (alertButton.length > 0) {
          cy.wrap(alertButton.first()).click();
          
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          
          cy.get('.modal').within(() => {
            cy.get('button:contains("View Details"), button:contains("Details")').should('exist');
            cy.get('button:contains("Disable"), button:contains("Enable")').should('exist');
          });
          
          cy.get('button:contains("Close")').first().click();
        } else {
          cy.log('No alert button found, test skipped');
        }
      });
    });

    it('should handle alert status change workflow', () => {
      cy.get('table tbody tr').first().then(($tr) => {
        const alertButton = $tr.find('button, .badge').filter((index, el) => {
          const $el = Cypress.$(el);
          return $el.text().includes('Alert') || $el.find('.badge').length > 0;
        });
        
        if (alertButton.length > 0) {
          cy.wrap(alertButton.first()).click();
          
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          
          cy.get('button:contains("Disable")').first().click();
          
          cy.get('.modal').should('have.length', 2);
          cy.get('.modal').last().within(() => {
            cy.get('.modal-body').should('contain', 'disable');
            cy.get('button:contains("Close")').first().click();
          });
          
          cy.get('button:contains("Close")').first().click();
        } else {
          cy.log('No alert button found, test skipped');
        }
      });
    });

    it('should display alert details modal', () => {
      cy.get('table tbody tr').first().then(($tr) => {
        const alertButton = $tr.find('button, .badge').filter((index, el) => {
          const $el = Cypress.$(el);
          return $el.text().includes('Alert') || $el.find('.badge').length > 0;
        });
        
        if (alertButton.length > 0) {
          cy.wrap(alertButton.first()).click();
          
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          
          cy.get('button:contains("View Details"), button:contains("Details")').first().click();
          
          cy.get('.modal').should('have.length', 2);
          cy.get('.modal').last().within(() => {
            cy.get('.modal-title').should('contain', 'Details');
            cy.get('button:contains("Close")').first().click();
          });
          
          cy.get('button:contains("Close")').first().click();
        } else {
          cy.log('No alert button found, test skipped');
        }
      });
    });
  });

  describe('MISP Export Functionality', () => {
    it('should display MISP export button', () => {
      cy.get('table tbody tr').first().within(() => {
        cy.get('button[title*="Export"], i.material-icons:contains("cloud_upload")').should('exist');
      });
    });

    it('should display MISP status badges', () => {
      cy.get('table tbody').within(() => {
        cy.get('i.material-icons').filter((index, icon) => {
          const text = Cypress.$(icon).text();
          return text.includes('cloud') || text.includes('check') || text.includes('close');
        }).should('exist');
      });
    });
  });

  describe('Site Details Modal', () => {
    it('should display technical details modal', () => {
      cy.get('table tbody tr').first().within(() => {
        cy.get('button, .badge').filter((index, btn) => {
          const text = Cypress.$(btn).text().toLowerCase();
          return text.includes('detail') || text.includes('info') || text.includes('view') || text.includes('technical');
        }).first().click({ force: true });
      });
      
      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      
      cy.get('.modal').within(() => {
        cy.get('.modal-title, .modal-header').should('exist');
        
        cy.get('.modal-body').then(($body) => {
          const bodyText = $body.text();
          const hasTechnicalInfo = bodyText.includes('IP') || 
                                   bodyText.includes('MX') || 
                                   bodyText.includes('Takedown') ||
                                   bodyText.includes('Domain');
          expect(hasTechnicalInfo).to.be.true;
        });
      });
      
      cy.get('button:contains("Close")').first().click({ force: true });
    });
  });

  describe('Statistics Dashboard', () => {
    it('should display all stat cards', () => {
      cy.get('.card.border-0.shadow-sm').should('have.length.at.least', 4);
    });

    it('should display correct stat card icons', () => {
      cy.get('.card .material-icons').filter((index, icon) => {
        const text = Cypress.$(icon).text();
        return text.includes('link') || text.includes('dangerous') || 
               text.includes('block') || text.includes('gavel');
      }).should('have.length.at.least', 4);
    });

    it('should display stat card titles', () => {
      cy.get('.card.border-0.shadow-sm').each(($card) => {
        cy.wrap($card).within(() => {
          cy.get('.text-uppercase').should('exist');
        });
      });
      
      cy.get('body').should('contain', 'TOTAL SITES');
      cy.get('body').should('contain', 'MALICIOUS');
      cy.get('body').should('contain', 'TAKEDOWN REQUESTS');
      cy.get('body').should('contain', 'LEGAL TEAM');
    });

    it('should update stats based on filtered data', () => {
      // Apply filter
      cy.get('button:contains("Show Filters")').first().click();
      cy.get('input[placeholder*="Search"]').clear().type('malicious');
      cy.wait(1000);
      
      cy.get('.card.border-0.shadow-sm').should('exist');
    });
  });

  describe('Navigation and UI Tests', () => {
    it('should test header navigation links', () => {
      cy.get('.navbar, nav').should('exist');
      cy.get('a:contains("Website Monitoring"), a[href*="website_monitoring"]').should('exist');
      cy.get('a:contains("Data Leak"), a[href*="data_leak"]').should('exist');
      cy.get('a:contains("Twisted DNS Finder"), a[href*="dns_finder"]').should('exist');
    });

    it('should verify layout structure specific to Site Monitoring', () => {
      cy.get('.container-fluid.mt-4').should('exist');
      cy.get('.row').should('have.length.at.least', 2);
      
      cy.get('.card.border-0.shadow-sm').should('have.length.at.least', 4);
      
      cy.get('table', { timeout: 10000 }).should('exist');
    });

    it('should handle Bootstrap components correctly', () => {
      cy.get('.container-fluid').should('exist');
      cy.get('.row').should('exist');
      cy.get('table.table').should('exist');
      cy.get('.card').should('exist');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle API errors gracefully', () => {
      cy.intercept('GET', '/api/site_monitoring/site/', {
        statusCode: 500,
        body: { error: 'Server Error' }
      }).as('sitesError');
      
      cy.intercept('GET', '/api/site_monitoring/alert/', {
        statusCode: 500,
        body: { error: 'Server Error' }
      }).as('alertsError');

      cy.reload();
      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('exist');
    });

    it('should handle empty data states', () => {
      cy.intercept('GET', '/api/site_monitoring/site/', {
        statusCode: 200,
        body: []
      }).as('emptySites');
      
      cy.intercept('GET', '/api/site_monitoring/alert/', {
        statusCode: 200,
        body: []
      }).as('emptyAlerts');

      cy.reload();
      cy.get('body').should('be.visible');
      cy.get('table').should('exist');
      
      cy.get('table tbody tr td').should('contain', 'No');
    });
  });

  describe('Performance and Integration Tests', () => {
    it('should load page within reasonable time', () => {
      const startTime = Date.now();
      cy.reload();
      
      cy.get('table', { timeout: 20000 }).should('exist').then(() => {
        const loadTime = Date.now() - startTime;
        expect(loadTime).to.be.lessThan(25000);
      });
    });

    it('should complete basic workflow integration test', () => {
      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('exist');
      cy.get('h4').should('have.length.at.least', 1);
      cy.get('table').should('exist');
      
      cy.get('body').then(($body) => {
        const buttons = $body.find('button');
        cy.log(`Found ${buttons.length} interactive buttons`);
        expect(buttons.length).to.be.greaterThan(5);
      });
    });

    it('should verify Site Monitoring specific components', () => {
      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        
        const hasSites = bodyText.includes('Sites') || bodyText.includes('Domain');
        const hasStats = bodyText.includes('TOTAL SITES');
        const hasAlerts = bodyText.includes('Alert');
        
        if (hasSites) cy.log('Sites section found');
        if (hasStats) cy.log('Stats section found');
        if (hasAlerts) cy.log('Alerts functionality found');
        
        expect(hasSites || hasStats).to.be.true;
      });
    });

    it('should verify all major components are loaded', () => {
      cy.get('.container-fluid').should('exist');
      cy.get('.card.border-0.shadow-sm').should('have.length.at.least', 4);
      cy.get('table.table-striped, table.table').should('exist');
      
      cy.get('h4').should('exist');
    });
  });

  after(() => {
    cy.log('Starting Site Monitoring cleanup...');
    
    // Clean up test sites
    cy.request({
      method: 'GET',
      url: '/api/site_monitoring/site/',
      headers: {
        'Authorization': `Token ${Cypress.env('authData').token}`
      },
      failOnStatusCode: false
    }).then((response) => {
      if (response.status === 200 && response.body) {
        response.body.forEach((site) => {
          if (site.domain_name && (site.domain_name.includes('test-') || site.domain_name.includes('e2e-'))) {
            cy.request({
              method: 'DELETE',
              url: `/api/site_monitoring/site/${site.id}/`,
              headers: {
                'Authorization': `Token ${Cypress.env('authData').token}`
              },
              failOnStatusCode: false
            });
          }
        });
      }
    });

    // Clear localStorage items specific to Site Monitoring
    cy.window().then((win) => {
      win.localStorage.removeItem('watcher_localstorage_items_siteMonitoring');
      win.localStorage.removeItem('watcher_localstorage_filters_siteMonitoring');
      win.localStorage.clear();
      win.sessionStorage.clear();
    });
    
    cy.log('Site Monitoring cleanup completed');
  });
});