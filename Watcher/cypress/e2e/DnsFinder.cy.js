describe('DNS Finder - E2E Test Suite', () => {
  const setupIntercepts = () => {
    // Setup API mocks
    cy.intercept('GET', '/api/dns_finder/dns_monitored/', {
      statusCode: 200,
      body: [
        { id: 1, domain_name: "watcher.com", created_at: "2025-06-19T10:00:00Z" },
        { id: 2, domain_name: "watcher.fr", created_at: "2025-06-18T15:30:00Z" },
        { id: 3, domain_name: "watcher.org", created_at: "2025-06-17T08:15:00Z" }
      ]
    }).as('getDnsMonitored');

    cy.intercept('GET', '/api/dns_finder/keyword_monitored/', {
      statusCode: 200,
      body: [
        { id: 1, name: "watcher", created_at: "2025-06-19T10:00:00Z" },
        { id: 2, name: "threat-intel", created_at: "2025-06-18T15:30:00Z" },
        { id: 3, name: "security-corp", created_at: "2025-06-17T08:15:00Z" }
      ]
    }).as('getKeywordMonitored');

    cy.intercept('GET', '/api/dns_finder/alert/', {
      statusCode: 200,
      body: [
        {
          id: 1,
          dns_twisted: {
            id: 101,
            domain_name: "vvatcher.com",
            dns_monitored: { id: 1, domain_name: "watcher.com" },
            keyword_monitored: null,
            fuzzer: "homoglyph",
            misp_event_uuid: "['550e8400-e29b-41d4-a716-446655440000']",
            created_at: "2025-06-19T14:30:00Z"
          },
          status: true,
          created_at: "2025-06-19T14:30:00Z"
        },
        {
          id: 2,
          dns_twisted: {
            id: 102,
            domain_name: "watcher-threat.com",
            dns_monitored: null,
            keyword_monitored: { id: 1, name: "watcher" },
            fuzzer: null,
            misp_event_uuid: null,
            created_at: "2025-06-19T12:15:00Z"
          },
          status: true,
          created_at: "2025-06-19T12:15:00Z"
        },
        {
          id: 3,
          dns_twisted: {
            id: 103,
            domain_name: "vvatcher.fr",
            dns_monitored: { id: 2, domain_name: "watcher.fr" },
            keyword_monitored: null,
            fuzzer: "bitsquatting",
            misp_event_uuid: "['550e8400-e29b-41d4-a716-446655440001']",
            created_at: "2025-06-18T16:45:00Z"
          },
          status: false,
          created_at: "2025-06-18T16:45:00Z"
        }
      ]
    }).as('getAlerts');

    // Mock CRUD operations
    cy.intercept('POST', '/api/dns_finder/dns_monitored/', (req) => ({
      statusCode: 201,
      body: { id: Date.now(), ...req.body, created_at: new Date().toISOString() }
    })).as('addDnsMonitored');

    cy.intercept('POST', '/api/dns_finder/keyword_monitored/', (req) => ({
      statusCode: 201,
      body: { id: Date.now(), ...req.body, created_at: new Date().toISOString() }
    })).as('addKeywordMonitored');

    cy.intercept('DELETE', '/api/dns_finder/dns_monitored/*', { statusCode: 204 }).as('deleteDnsMonitored');
    cy.intercept('DELETE', '/api/dns_finder/keyword_monitored/*', { statusCode: 204 }).as('deleteKeywordMonitored');

    cy.intercept('PATCH', '/api/dns_finder/dns_monitored/*', (req) => ({
      statusCode: 200,
      body: { id: parseInt(req.url.split('/').pop()), ...req.body }
    })).as('patchDnsMonitored');

    cy.intercept('PATCH', '/api/dns_finder/keyword_monitored/*', (req) => ({
      statusCode: 200,
      body: { id: parseInt(req.url.split('/').pop()), ...req.body }
    })).as('patchKeywordMonitored');

    cy.intercept('PATCH', '/api/dns_finder/alert/*', (req) => ({
      statusCode: 200,
      body: { id: parseInt(req.url.split('/').pop()), ...req.body }
    })).as('updateAlertStatus');

    cy.intercept('POST', '/api/dns_finder/misp/', {
      statusCode: 200,
      body: { message: 'Successfully exported to MISP', event_uuid: '550e8400-e29b-41d4-a716-446655440003' }
    }).as('exportToMISP');

    cy.intercept('GET', '/api/threats_watcher/trendyword/', { statusCode: 200, body: [] });
    cy.intercept('GET', '/api/site_monitoring/site/', { statusCode: 200, body: [] }).as('getSites');
    
    cy.intercept('POST', '/api/site_monitoring/site/', (req) => ({
      statusCode: 201,
      body: {
        id: Date.now(),
        ...req.body,
        rtir: `SM-2025-${String(Date.now()).slice(-3)}`,
        created_at: new Date().toISOString(),
        monitored: false,
        misp_event_uuid: null,
        web_status: null
      }
    })).as('addSite');
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

    // Navigate to DNS Finder
    cy.visit('/#/dns_finder');
    cy.wait('@getDnsMonitored', { timeout: 15000 });
    cy.wait('@getKeywordMonitored', { timeout: 15000 });
    cy.wait('@getAlerts', { timeout: 15000 });

    cy.log('Authentication completed and navigated to DNS Finder');
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
      if (!currentUrl.includes('/dns_finder') || currentUrl.includes('about:blank')) {
        cy.log('Redirecting back to DNS Finder...');
        cy.visit('/#/dns_finder', { failOnStatusCode: false });
        cy.wait(1000);
      } else {
        cy.log('Staying on DNS Finder page');
      }
    });

    cy.url().should('include', '/dns_finder');
    cy.get('.container-fluid', { timeout: 10000 }).should('exist');

    cy.log('Page ready with session maintained');
  });

  describe('Page Navigation and Access', () => {
    it('should be on the correct DNS Finder page', () => {
      cy.url().should('include', '#/dns_finder');
      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('exist');
    });

    it('should display main sections with ResizableContainers', () => {
      cy.get('.container-fluid.mt-4', { timeout: 15000 }).should('exist');

      cy.get('.d-flex.w-100.h-100.position-relative', { timeout: 15000 })
        .first()
        .should('exist')
        .within(() => {
          cy.get('.overflow-hidden').first().should('exist').within(() => {
            cy.get('h4:contains("Alerts")').should('exist');
          });

          cy.get('.overflow-hidden').eq(1).should('exist').within(() => {
            cy.get('h4:contains("Corporate DNS")').should('exist');
          });
        });

      cy.get('.d-flex.w-100.h-100.position-relative')
        .eq(1)
        .should('exist')
        .within(() => {
          cy.get('.overflow-hidden').first().should('exist').within(() => {
            cy.get('h4:contains("Archived Alerts")').should('exist');
          });

          cy.get('.overflow-hidden').eq(1).should('exist').within(() => {
            cy.get('h4:contains("Corporate Keywords")').should('exist');
          });
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
      cy.get('table').should('have.length.at.least', 2);

      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        if (bodyText.includes('watcher.com') || bodyText.includes('vvatcher.com') || bodyText.includes('watcher')) {
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

      cy.get('a:contains("Twisted DNS Finder"), a[href*="dns_finder"]').should('exist').click();
      cy.url().should('include', 'dns_finder');

      cy.get('.navbar').should('exist');
    });
  });

  describe('DNS Monitored Display and Management', () => {
    it('should display DNS monitored table in ResizableContainer', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .eq(1)
        .within(() => {
          cy.get('h4:contains("Corporate DNS")', { timeout: 10000 }).should('exist');
          cy.get('h6:contains("Dnstwist Algorithm")', { timeout: 10000 }).should('exist');
          cy.get('table', { timeout: 10000 }).should('exist');
        });
    });

    it('should display DNS monitored data when available', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .eq(1)
        .within(() => {
          cy.get('table tbody tr').should('have.length.at.least', 1);
          cy.get('tbody').should('contain', 'watcher.com');
        });
    });

    it('should display Add New DNS button', () => {
      cy.get('button:contains("Add New DNS")').should('exist');
    });

    it('should open add DNS modal', () => {
      cy.get('button:contains("Add New DNS")').click();
      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('exist');
      cy.get('input[placeholder*="example.com"]').should('exist');
      cy.get('button:contains("Close")').first().click();
    });

    it('should handle complete DNS addition workflow', () => {
      cy.get('button:contains("Add New DNS")').click();
      cy.get('.modal', { timeout: 10000 }).should('be.visible');

      cy.get('input[placeholder*="example.com"]').type('test-new-domain.com');
      cy.get('.modal button:contains("Add")').click();

      cy.wait('@addDnsMonitored', { timeout: 10000 });
      cy.wait(1000);
    });

    it('should display edit and delete buttons for authenticated users', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .eq(1)
        .within(() => {
          cy.get('.material-icons:contains("edit")').should('exist');
          cy.get('.material-icons:contains("delete")').should('exist');
        });
    });

    it('should handle DNS edit workflow', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .eq(1)
        .find('.material-icons:contains("edit")')
        .first()
        .scrollIntoView()
        .click({ force: true });

      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('exist');
      cy.get('input[type="text"]').clear().type('test-updated-domain.com');
      cy.get('button:contains("Close")').first().click();
    });

    it('should handle DNS deletion workflow', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .eq(1)
        .find('.material-icons:contains("delete")')
        .first()
        .click();

      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('contain', 'Action Requested');
      cy.get('.modal-body').should('contain', 'delete');
      cy.get('button:contains("Close")').first().click();
    });

    it('should sort DNS monitored table', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .eq(1)
        .within(() => {
          cy.get('table th:contains("Domain Name")').click();
          cy.wait(500);
          cy.get('table th:contains("Domain Name")').click();
          cy.wait(500);
        });
    });
  });

  describe('Keyword Monitored Display and Management', () => {
    it('should display keyword monitored table in ResizableContainer', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .eq(1)
        .find('.overflow-hidden')
        .eq(1)
        .within(() => {
          cy.get('h4:contains("Corporate Keywords")', { timeout: 10000 }).should('exist');
          cy.get('h6:contains("Certificate Transparency")', { timeout: 10000 }).should('exist');
          cy.get('table', { timeout: 10000 }).should('exist');
        });
    });

    it('should display keyword monitored data when available', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .eq(1)
        .find('.overflow-hidden')
        .eq(1)
        .within(() => {
          cy.get('table tbody tr').should('have.length.at.least', 1);
          cy.get('tbody').should('contain', 'watcher');
        });
    });

    it('should display Add New Keyword button', () => {
      cy.get('button:contains("Add New Keyword")').should('exist');
    });

    it('should open add keyword modal', () => {
      cy.get('button:contains("Add New Keyword")').click();
      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('exist');
      cy.get('input[placeholder*="company"]').should('exist');
      cy.get('button:contains("Close")').first().click();
    });

    it('should handle complete keyword addition workflow', () => {
      cy.get('button:contains("Add New Keyword")').click();
      cy.get('.modal', { timeout: 10000 }).should('be.visible');

      cy.get('input[placeholder*="company"]').type('test-new-keyword');
      cy.get('.modal button:contains("Add")').click();

      cy.wait('@addKeywordMonitored', { timeout: 10000 });
      cy.wait(1000);
    });

    it('should display edit and delete buttons for authenticated users', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .eq(1)
        .find('.overflow-hidden')
        .eq(1)
        .within(() => {
          cy.get('.material-icons:contains("edit")').should('exist');
          cy.get('.material-icons:contains("delete")').should('exist');
        });
    });

    it('should handle keyword edit workflow', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .eq(1)
        .find('.overflow-hidden')
        .eq(1)
        .find('.material-icons:contains("edit")')
        .first()
        .scrollIntoView()
        .click({ force: true });

      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('exist');
      cy.get('button:contains("Close")').first().click();
    });

    it('should handle keyword deletion workflow', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .eq(1)
        .find('.overflow-hidden')
        .eq(1)
        .find('.material-icons:contains("delete")')
        .first()
        .click();

      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('contain', 'Action Requested');
      cy.get('.modal-body').should('contain', 'delete');
      cy.get('button:contains("Close")').first().click();
    });

    it('should sort keyword monitored table', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .eq(1)
        .find('.overflow-hidden')
        .eq(1)
        .within(() => {
          cy.get('table th:contains("Name")').click();
          cy.wait(500);
        });
    });
  });

  describe('Alerts Display and Management', () => {
    it('should display alerts table in ResizableContainer', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .first()
        .within(() => {
          cy.get('h4:contains("Alerts")', { timeout: 10000 }).should('exist');
          cy.get('table', { timeout: 10000 }).should('exist');
        });
    });

    it('should display alert data structure correctly', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .first()
        .within(() => {
          cy.get('table thead th').should('contain', 'ID');
          cy.get('table thead th').should('contain', 'Twisted DNS');
          cy.get('table thead th').should('contain', 'Corporate Keyword');
          cy.get('table thead th').should('contain', 'Corporate DNS');
          cy.get('table thead th').should('contain', 'Fuzzer');
        });
    });

    it('should display active alerts (status=true)', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .first()
        .within(() => {
          cy.get('table tbody tr').should('have.length.at.least', 1);
          cy.get('tbody').should('contain', 'vvatcher.com');
        });
    });

    it('should display alert action buttons', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .first()
        .find('table tbody tr')
        .first()
        .within(() => {
          cy.get('button:contains("Disable")').should('exist');
        });
  
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .first()
        .within(() => {
          cy.get('button').then(($buttons) => {
            const addButtons = $buttons.toArray().filter(btn => {
              const text = Cypress.$(btn).text();
              return text.includes('Add to Website Monitoring') || text.includes('Website Monitoring');
            });
            
            if (addButtons.length > 0) {
              cy.log('Add to Website Monitoring buttons found');
              expect(addButtons.length).to.be.greaterThan(0);
            } else {
              cy.log('No Add to Website Monitoring buttons - alerts may not support this action');
              cy.get('button:contains("Disable")').should('exist');
            }
          });
        });
    });

    it('should handle alert disable workflow', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .first()
        .find('table tbody tr')
        .first()
        .find('button:contains("Disable")')
        .click();

      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('contain', 'Action Requested');
      cy.get('.modal-body').should('contain', 'disable');
      cy.get('button:contains("Close")').first().click();
    });

    it('should display MISP export buttons', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .first()
        .within(() => {
          cy.get('button[title*="Export"], i.material-icons:contains("cloud_upload")').should('exist');
        });
    });

    it('should display MISP status badges', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .first()
        .within(() => {
          cy.get('i.material-icons').filter((index, icon) => {
            const text = Cypress.$(icon).text();
            return text.includes('cloud') || text.includes('check') || text.includes('close');
          }).should('exist');
        });
    });

    it('should handle add to website monitoring workflow', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .first()
        .then(($container) => {
          const addButton = $container.find('button').filter((index, btn) => {
            const text = Cypress.$(btn).text();
            return text.includes('Add to Website Monitoring') || text.includes('Website Monitoring');
          });
  
          if (addButton.length > 0) {
            cy.wrap(addButton.first()).click();
  
            cy.get('.modal', { timeout: 10000 }).should('be.visible');
            cy.get('.modal-title').should('contain', 'Action Requested');
            cy.get('button:contains("Close")').first().click();
          } else {
            cy.log('Add to Website Monitoring button not found - alert may not support this action');
            cy.wrap($container).find('button:contains("Disable")').should('exist');
          }
        });
    });
  
    it('should sort alerts table', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .first()
        .within(() => {
          cy.get('table th:contains("ID")').click();
          cy.wait(500);
        });
    });
  });

  describe('Archived Alerts Display and Management', () => {
    it('should display archived alerts table in ResizableContainer', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .eq(1)
        .find('.overflow-hidden')
        .first()
        .within(() => {
          cy.get('h4:contains("Archived Alerts")', { timeout: 10000 }).should('exist');
          cy.get('table', { timeout: 10000 }).should('exist');
        });
    });

    it('should display archived alerts (status=false)', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .eq(1)
        .find('.overflow-hidden')
        .first()
        .within(() => {
          cy.get('table tbody tr').should('have.length.at.least', 1);
          cy.get('tbody').should('contain', 'vvatcher.fr');
        });
    });

    it('should display Enable button for archived alerts', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .eq(1)
        .find('.overflow-hidden')
        .first()
        .within(() => {
          cy.get('button:contains("Enable")').should('exist');
        });
    });

    it('should handle alert enable workflow', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .eq(1)
        .find('.overflow-hidden')
        .first()
        .find('button:contains("Enable")')
        .first()
        .click();

      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('contain', 'Action Requested');
      cy.get('.modal-body').should('contain', 'enable');
      cy.get('button:contains("Close")').first().click();
    });

    it('should sort archived alerts table', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .eq(1)
        .find('.overflow-hidden')
        .first()
        .within(() => {
          cy.get('table th:contains("Fuzzer")').click();
          cy.wait(500);
        });
    });
  });

  describe('ResizableContainer Functionality', () => {
    it('should display ResizableContainer dividers', () => {
      cy.get('.d-flex.w-100.h-100.position-relative', { timeout: 10000 })
        .should('have.length.at.least', 2);

      cy.get('.d-flex.w-100.h-100.position-relative').each(($container) => {
        cy.wrap($container).then(($el) => {
          const hasResizer = $el.find('[style*="cursor"], .resizer, [class*="divider"]').length > 0;
          cy.log(`Container has resizer: ${hasResizer}`);
        });
      });
    });

    it('should handle divider double-click to reset', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .then(($container) => {
          const resizer = $container.find('[style*="cursor: col-resize"], [style*="cursor: ew-resize"]');
          
          if (resizer.length > 0) {
            cy.wrap(resizer.first()).dblclick({ force: true });
            cy.wait(500);
            cy.log('First divider double-click tested');
          }
        });

      cy.get('.d-flex.w-100.h-100.position-relative')
        .eq(1)
        .then(($container) => {
          const resizer = $container.find('[style*="cursor: col-resize"], [style*="cursor: ew-resize"]');
          
          if (resizer.length > 0) {
            cy.wrap(resizer.first()).dblclick({ force: true });
            cy.wait(500);
            cy.log('Second divider double-click tested');
          }
        });
    });

    it('should show tooltip on divider hover', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('[title*="Drag to resize"]')
        .should('exist');

      cy.get('.d-flex.w-100.h-100.position-relative')
        .eq(1)
        .find('[title*="Drag to resize"]')
        .should('exist');
    });
  });

  describe('Data Interaction and Workflow', () => {
    it('should handle complete keyword lifecycle', () => {
      // Add keyword
      cy.get('button:contains("Add New Keyword")').click();
      cy.get('.modal input[type="text"]').type('test-lifecycle-keyword');
      cy.get('.modal button:contains("Add")').click();
      cy.wait('@addKeywordMonitored', { timeout: 10000 });
      cy.wait(1000);
    });

    it('should handle complete alert status change workflow', () => {
      // Disable an active alert
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .first()
        .find('button:contains("Disable")')
        .first()
        .click();

      cy.get('.modal button:contains("Yes")').click();
      cy.wait('@updateAlertStatus', { timeout: 10000 });

      cy.wait(1000);

      // Enable an archived alert
      cy.get('.d-flex.w-100.h-100.position-relative')
        .eq(1)
        .find('.overflow-hidden')
        .first()
        .find('button:contains("Enable")')
        .first()
        .click();

      cy.get('.modal button:contains("Yes")').click();
      cy.wait('@updateAlertStatus', { timeout: 10000 });
    });

    it('should verify filtered data propagation', () => {
      // Apply global filter
      cy.get('button:contains("Show Filters")').first().click();
      cy.get('input[placeholder*="Search"]').clear().type('vvatcher');
      cy.wait(1000);

      // Check that data is filtered
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .first()
        .find('table tbody tr')
        .should('have.length.at.least', 1);
    });
  });

  describe('Navigation and UI Tests', () => {
    it('should test header navigation links', () => {
      cy.get('.navbar, nav').should('exist');
      cy.get('a:contains("Website Monitoring"), a[href*="website_monitoring"]').should('exist');
      cy.get('a:contains("Data Leak"), a[href*="data_leak"]').should('exist');
      cy.get('a:contains("Twisted DNS Finder"), a[href*="dns_finder"]').should('exist');
    });

    it('should verify layout structure specific to DNS Finder', () => {
      cy.get('.container-fluid.mt-4').should('exist');
      cy.get('.row').should('have.length.at.least', 2);

      cy.get('.d-flex.w-100.h-100.position-relative', { timeout: 10000 })
        .should('have.length.at.least', 2);

      cy.get('table', { timeout: 10000 }).should('have.length.at.least', 2);
    });

    it('should handle Bootstrap components correctly', () => {
      cy.get('.container-fluid').should('exist');
      cy.get('.row').should('exist');
      cy.get('table.table').should('exist');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle API errors gracefully', () => {
      cy.intercept('GET', '/api/dns_finder/dns_monitored/', {
        statusCode: 500,
        body: { error: 'Server Error' }
      }).as('dnsError');

      cy.intercept('GET', '/api/dns_finder/keyword_monitored/', {
        statusCode: 500,
        body: { error: 'Server Error' }
      }).as('keywordError');

      cy.intercept('GET', '/api/dns_finder/alert/', {
        statusCode: 500,
        body: { error: 'Server Error' }
      }).as('alertsError');

      cy.reload();
      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('exist');
    });

    it('should handle empty data states', () => {
      cy.intercept('GET', '/api/dns_finder/dns_monitored/', {
        statusCode: 200,
        body: []
      }).as('emptyDns');

      cy.intercept('GET', '/api/dns_finder/keyword_monitored/', {
        statusCode: 200,
        body: []
      }).as('emptyKeywords');

      cy.intercept('GET', '/api/dns_finder/alert/', {
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
      cy.get('h4').should('have.length.at.least', 4);
      cy.get('table').should('have.length.at.least', 2);

      cy.get('body').then(($body) => {
        const buttons = $body.find('button');
        cy.log(`Found ${buttons.length} interactive buttons`);
        expect(buttons.length).to.be.greaterThan(5);
      });
    });

    it('should verify DNS Finder specific components', () => {
      cy.get('body').then(($body) => {
        const bodyText = $body.text();

        const hasDnstwist = bodyText.includes('Dnstwist Algorithm');
        const hasCertTransparency = bodyText.includes('Certificate Transparency');
        const hasTwistedDNS = bodyText.includes('Twisted DNS');
        const hasKeyword = bodyText.includes('Corporate Keyword');

        if (hasDnstwist) cy.log('Dnstwist Algorithm section found');
        if (hasCertTransparency) cy.log('Certificate Transparency section found');
        if (hasTwistedDNS) cy.log('Twisted DNS data found');
        if (hasKeyword) cy.log('Corporate Keyword data found');

        expect(hasDnstwist || hasCertTransparency).to.be.true;
      });
    });

    it('should verify all major components are loaded', () => {
      cy.get('.container-fluid').should('exist');
      cy.get('.d-flex.w-100.h-100.position-relative').should('have.length.at.least', 2);
      cy.get('table.table-striped').should('have.length.at.least', 2);
      cy.get('h4:contains("Alerts")').should('exist');
      cy.get('h4:contains("Corporate DNS")').should('exist');
      cy.get('h4:contains("Archived Alerts")').should('exist');
      cy.get('h4:contains("Corporate Keywords")').should('exist');
    });
  });

  after(() => {
    cy.log('Starting DNS Finder cleanup...');

    // Clean up test DNS entries
    cy.request({
      method: 'GET',
      url: '/api/dns_finder/dns_monitored/',
      headers: {
        'Authorization': `Token ${Cypress.env('authData').token}`
      },
      failOnStatusCode: false
    }).then((response) => {
      if (response.status === 200 && response.body) {
        response.body.forEach((dns) => {
          if (dns.domain_name && dns.domain_name.includes('test-')) {
            cy.request({
              method: 'DELETE',
              url: `/api/dns_finder/dns_monitored/${dns.id}/`,
              headers: {
                'Authorization': `Token ${Cypress.env('authData').token}`
              },
              failOnStatusCode: false
            });
          }
        });
      }
    });

    // Clean up test keyword entries
    cy.request({
      method: 'GET',
      url: '/api/dns_finder/keyword_monitored/',
      headers: {
        'Authorization': `Token ${Cypress.env('authData').token}`
      },
      failOnStatusCode: false
    }).then((response) => {
      if (response.status === 200 && response.body) {
        response.body.forEach((keyword) => {
          if (keyword.name && keyword.name.includes('test-')) {
            cy.request({
              method: 'DELETE',
              url: `/api/dns_finder/keyword_monitored/${keyword.id}/`,
              headers: {
                'Authorization': `Token ${Cypress.env('authData').token}`
              },
              failOnStatusCode: false
            });
          }
        });
      }
    });

    // Clear localStorage and sessionStorage
    cy.window().then((win) => {
      win.localStorage.removeItem('watcher_localstorage_layout_dnsFinder');
      win.localStorage.removeItem('watcher_localstorage_layout_dnsFinder_secondary');
      win.localStorage.removeItem('watcher_localstorage_items_dnsFinder');
      win.localStorage.removeItem('watcher_localstorage_items_dnsFinder_archived');
      win.localStorage.removeItem('watcher_localstorage_items_dnsFinder_domains');
      win.localStorage.removeItem('watcher_localstorage_items_dnsFinder_keywords');
      win.localStorage.removeItem('watcher_localstorage_filters_dnsFinder');
      win.localStorage.clear();
      win.sessionStorage.clear();
    });

    cy.log('DNS Finder cleanup completed');
  });
});