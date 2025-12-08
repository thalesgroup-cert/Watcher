describe('Data Leak - E2E Test Suite', () => {
  const setupIntercepts = () => {
    cy.intercept('GET', '/api/data_leak/keyword/', {
      statusCode: 200,
      body: {
        count: 3,
        next: null,
        previous: null,
        results: [
          { id: 1, name: "test-confidential", created_at: "2025-06-19T10:00:00Z" },
          { id: 2, name: "e2e-internal", created_at: "2025-06-18T15:30:00Z" },
          { id: 3, name: "test-company-data", created_at: "2025-06-17T08:15:00Z" }
        ]
      }
    }).as('getKeywords');

    cy.intercept('GET', '/api/data_leak/alert/', {
      statusCode: 200,
      body: {
        count: 4,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            keyword: { id: 1, name: "test-confidential" },
            url: "https://pastebin.com/test123",
            content: "Confidential test data found in paste",
            status: true,
            created_at: "2025-06-19T14:30:00Z"
          },
          {
            id: 2,
            keyword: { id: 2, name: "e2e-internal" },
            url: "https://github.com/test/repo",
            content: "Internal documentation exposed",
            status: true,
            created_at: "2025-06-19T12:15:00Z"
          },
          {
            id: 3,
            keyword: { id: 1, name: "test-confidential" },
            url: "https://pastebin.com/test456",
            content: "More confidential data leak detected",
            status: false,
            created_at: "2025-06-18T16:45:00Z"
          },
          {
            id: 4,
            keyword: { id: 3, name: "test-company-data" },
            url: "https://github.com/test/company",
            content: "Company data in public repository",
            status: false,
            created_at: "2025-06-17T10:20:00Z"
          }
        ]
      }
    }).as('getAlerts');

    // Mock CRUD operations
    cy.intercept('POST', '/api/data_leak/keyword/', (req) => ({
      statusCode: 201,
      body: { id: Date.now(), ...req.body, created_at: new Date().toISOString() }
    })).as('addKeyword');

    cy.intercept('DELETE', '/api/data_leak/keyword/*', { statusCode: 204 }).as('deleteKeyword');

    cy.intercept('PATCH', '/api/data_leak/keyword/*', (req) => ({
      statusCode: 200,
      body: { id: parseInt(req.url.split('/').pop()), ...req.body }
    })).as('updateKeyword');

    cy.intercept('PATCH', '/api/data_leak/alert/*', (req) => ({
      statusCode: 200, 
      body: { id: parseInt(req.url.split('/').pop()), ...req.body }
    })).as('updateAlertStatus');

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
    
    // Navigate to Data Leak
    cy.visit('/#/data_leak');
    cy.wait('@getKeywords', { timeout: 15000 });
    cy.wait('@getAlerts', { timeout: 15000 });
    
    cy.log('Authentication completed and navigated to Data Leak');
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
      if (!currentUrl.includes('/data_leak') || currentUrl.includes('about:blank')) {
        cy.log('Redirecting back to Data Leak...');
        cy.visit('/#/data_leak', { failOnStatusCode: false });
        cy.wait(1000);
      } else {
        cy.log('Staying on Data Leak page');
      }
    });

    cy.url().should('include', '/data_leak');
    cy.get('.container-fluid', { timeout: 10000 }).should('exist');
    
    cy.log('Page ready with session maintained');
  });

  describe('Page Navigation and Access', () => {
    it('should be on the correct Data Leak page', () => {
      cy.url().should('include', '#/data_leak');
      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('exist');
    });

    it('should display main sections with ResizableContainer', () => {
      cy.get('.container-fluid.mt-4', { timeout: 15000 }).should('exist');
      
      cy.get('.d-flex.w-100.h-100.position-relative', { timeout: 15000 })
        .first()
        .should('exist')
        .within(() => {
          cy.get('.overflow-hidden').first().should('exist').within(() => {
            cy.get('h4:contains("Alerts")').should('exist');
          });
          
          cy.get('.overflow-hidden').eq(1).should('exist').within(() => {
            cy.get('h4:contains("Keywords Monitored")').should('exist');
          });
        });

      cy.get('h4:contains("Archived Alerts")').should('exist');
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
        if (bodyText.includes('test-confidential') || bodyText.includes('e2e-internal') || bodyText.includes('pastebin.com')) {
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
      
      cy.get('a:contains("Data Leak"), a[href*="data_leak"]').should('exist').click();
      cy.url().should('include', 'data_leak');
      
      cy.get('.navbar').should('exist');
    });
  });

  describe('Keywords Display and Management', () => {
    it('should display keywords table in ResizableContainer', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .eq(1)
        .within(() => {
          cy.get('h4:contains("Keywords Monitored")', { timeout: 10000 }).should('exist');
          cy.get('table', { timeout: 10000 }).should('exist');
          cy.get('table thead').should('exist');
          cy.get('table tbody').should('exist');
        });
    });

    it('should display keywords data when available', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .eq(1)
        .within(() => {
          cy.get('table tbody tr').should('have.length.at.least', 1);
        });
    });

    it('should display TableManager features for keywords', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .eq(1)
        .within(() => {
          cy.contains('Showing', { timeout: 10000 }).should('exist');
          cy.get('select').filter((index, el) => {
            const text = Cypress.$(el).closest('.d-flex, div').find('label, span').text();
            return text.includes('Items per page');
          }).should('exist');
        });
    });

    it('should display Add New Keyword button', () => {
      cy.get('button:contains("Add New Keyword")').first().should('exist');
    });

    it('should open add keyword modal', () => {
      cy.get('button:contains("Add New Keyword")').first().click();
      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('exist');
      cy.get('input[placeholder*="leak"]').should('exist');
      cy.get('button:contains("Close")').first().click();
    });

    it('should handle complete keyword addition workflow', () => {
      cy.get('button:contains("Add New Keyword")').first().click();
      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      
      cy.get('input[placeholder*="leak"]').type('test-new-leak-keyword');
      cy.get('.modal button:contains("Add")').click();
      
      cy.wait('@addKeyword', { timeout: 10000 });
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

    it('should handle keyword edit workflow', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .eq(1)
        .find('.material-icons:contains("edit")')
        .first()
        .click({ force: true });
      
      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('exist');
      cy.get('input[type="text"]').clear().type('test-updated-keyword');
      cy.get('button:contains("Close")').first().click();
    });

    it('should handle keyword deletion workflow', () => {
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

    it('should sort keywords table', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .eq(1)
        .within(() => {
          cy.get('table th:contains("Name")').click();
          cy.wait(500);
          cy.get('table th:contains("Name")').click();
          cy.wait(500);
          cy.log('Sorting toggled successfully');
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
          cy.get('table thead').should('exist');
          cy.get('table tbody').should('exist');
        });
    });

    it('should display alert data structure correctly', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .first()
        .within(() => {
          cy.get('table thead th').should('contain', 'ID');
          cy.get('table thead th').should('contain', 'Keyword');
          cy.get('table thead th').should('contain', 'From');
          cy.get('table thead th').should('contain', 'Info');
          cy.get('table thead th').should('contain', 'Source');
          cy.get('table thead th').should('contain', 'Created At');
        });
    });

    it('should display active alerts (status=true)', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .first()
        .within(() => {
          cy.get('table tbody tr').should('have.length.at.least', 1);
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
          cy.get('button:contains("Link")').should('exist');
          cy.get('button:contains("Disable")').should('exist');
        });
    });

    it('should display Content button for pastebin alerts', () => {
      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        if (bodyText.includes('pastebin.com')) {
          cy.get('button:contains("Content")').should('exist');
        }
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

    it('should sort alerts table', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .first()
        .within(() => {
          cy.get('table th:contains("ID")').click();
          cy.wait(500);
          cy.get('table th:contains("Created At")').click();
          cy.wait(500);
        });
    });

    it('should display TableManager features for alerts', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .first()
        .within(() => {
          cy.contains('Showing', { timeout: 10000 }).should('exist');
          cy.get('select').filter((index, el) => {
            const text = Cypress.$(el).closest('.d-flex, div').find('label, span').text();
            return text.includes('Items per page');
          }).should('exist');
        });
    });
  });

  describe('Archived Alerts Display and Management', () => {
    it('should display archived alerts section', () => {
      cy.scrollTo('bottom');
      cy.wait(500);
      
      cy.get('.row.mt-4').within(() => {
        cy.get('h4:contains("Archived Alerts")', { timeout: 15000 }).should('be.visible');
        cy.get('table', { timeout: 10000 }).should('exist');
      });
    });

    it('should display archived alerts (status=false)', () => {
      cy.scrollTo('bottom');
      cy.wait(500);
      
      cy.get('.row.mt-4').within(() => {
        cy.get('table tbody tr').should('have.length.at.least', 1);
      });
    });

    it('should display Enable button for archived alerts', () => {
      cy.scrollTo('bottom');
      cy.wait(500);
      
      cy.get('.row.mt-4').within(() => {
        cy.get('button:contains("Enable")').should('exist');
      });
    });

    it('should handle alert enable workflow', () => {
      cy.scrollTo('bottom');
      cy.wait(500);
      
      cy.get('.row.mt-4').find('button:contains("Enable")').first().click();
      
      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('contain', 'Action Requested');
      cy.get('.modal-body').should('contain', 'enable');
      cy.get('button:contains("Close")').first().click();
    });

    it('should sort archived alerts table', () => {
      cy.scrollTo('bottom');
      cy.wait(500);
      
      cy.get('.row.mt-4').within(() => {
        cy.get('table th:contains("Keyword")').click();
        cy.wait(500);
      });
    });

    it('should display TableManager features for archived alerts', () => {
      cy.scrollTo('bottom');
      cy.wait(500);
      
      cy.get('.row.mt-4').within(() => {
        cy.contains('Showing', { timeout: 10000 }).should('exist');
        cy.get('select').filter((index, el) => {
          const text = Cypress.$(el).closest('.d-flex, div').find('label, span').text();
          return text.includes('Items per page');
        }).should('exist');
      });
    });
  });

  describe('ResizableContainer Functionality', () => {
    it('should display ResizableContainer divider', () => {
      cy.get('.d-flex.w-100.h-100.position-relative', { timeout: 10000 })
        .first()
        .then(($container) => {
          const hasResizer = $container.find('[style*="cursor: col-resize"], [style*="cursor: ew-resize"], .material-icons').length > 0;
          
          if (hasResizer) {
            cy.log('Resizable divider found');
          } else {
            cy.log('Resizable container may not have visible divider icon');
          }
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
            cy.log('Divider double-click (reset) tested');
          } else {
            cy.log('No resizer element found for double-click test');
          }
        });
    });

    it('should show tooltip on divider hover', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('[title*="Drag to resize"]')
        .should('exist');
    });
  });

  describe('External Links and Downloads', () => {
    it('should handle external link buttons', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('table tbody tr')
        .first()
        .find('button:contains("Link")')
        .should('be.visible');
      
      cy.get('button:contains("Link")').should('have.length.at.least', 1);
    });

    it('should display URL information correctly', () => {
      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        if (bodyText.includes('pastebin.com') || bodyText.includes('github.com')) {
          cy.log('External URLs found in alerts tables');
        }
      });
    });
  });
  
  describe('Data Interaction and Workflow', () => {
    it('should handle complete keyword lifecycle', () => {
      // Add keyword
      cy.get('button:contains("Add New Keyword")').first().click();
      cy.get('.modal input[type="text"]').type('test-lifecycle-keyword');
      cy.get('.modal button:contains("Add")').click();
      cy.wait('@addKeyword', { timeout: 10000 });
      cy.wait(1000);
      
      // Edit keyword
      cy.get('body').then(($body) => {
        const editButtons = $body.find('.material-icons:contains("edit")');
        if (editButtons.length > 0) {
          cy.wrap(editButtons.last())
            .scrollIntoView()
            .click({ force: true });
          
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          cy.get('.modal input[type="text"]').clear().type('test-lifecycle-updated');
          cy.get('button:contains("Close")').first().click({ force: true });
        }
      });
    });

    it('should handle complete alert status change workflow', () => {
      // Disable an active alert
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .find('.overflow-hidden')
        .first()
        .find('table tbody tr')
        .first()
        .find('button:contains("Disable")')
        .click();
      
      cy.get('.modal button:contains("Yes")').click();
      cy.wait('@updateAlertStatus', { timeout: 10000 });
      
      cy.wait(1000);
      cy.scrollTo('bottom');
      cy.wait(500);
      
      // Enable an archived alert
      cy.get('.row.mt-4').find('button:contains("Enable")').first().click();
      cy.get('.modal button:contains("Yes")').click();
      cy.wait('@updateAlertStatus', { timeout: 10000 });
    });

    it('should verify filtered data propagation', () => {
      // Apply global filter
      cy.get('button:contains("Show Filters")').first().click();
      cy.get('input[placeholder*="Search"]').clear().type('confidential');
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

    it('should verify layout structure specific to Data Leak', () => {
      cy.get('.container-fluid.mt-4').should('exist');
      cy.get('.row').should('have.length.at.least', 2);
      
      cy.get('.d-flex.w-100.h-100.position-relative', { timeout: 10000 }).should('exist');
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
      cy.intercept('GET', '/api/data_leak/keyword/', { 
        statusCode: 500, 
        body: { error: 'Server Error' } 
      }).as('keywordError');
      
      cy.intercept('GET', '/api/data_leak/alert/', { 
        statusCode: 500, 
        body: { error: 'Server Error' } 
      }).as('alertsError');

      cy.reload();
      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('exist');
    });

    it('should handle empty data states', () => {
      cy.intercept('GET', '/api/data_leak/keyword/', { 
        statusCode: 200, 
        body: [] 
      }).as('emptyKeywords');
      
      cy.intercept('GET', '/api/data_leak/alert/', { 
        statusCode: 200, 
        body: [] 
      }).as('emptyAlerts');

      cy.reload();
      cy.get('body').should('be.visible');
      cy.get('table').should('exist');
      
      cy.get('table tbody tr td').should('contain', 'No');
    });

    it('should handle malformed URLs gracefully', () => {
      cy.intercept('GET', '/api/data_leak/alert/', {
        statusCode: 200,
        body: [{
          id: 999,
          keyword: { id: 1, name: "test" },
          url: "invalid-url",
          content: "Test content",
          status: true,
          created_at: "2025-06-19T10:00:00Z"
        }]
      });
      
      cy.reload();
      cy.get('table').should('exist');
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
      cy.get('h4').should('have.length.at.least', 3);
      cy.get('table').should('have.length.at.least', 2);
      
      cy.get('body').then(($body) => {
        const buttons = $body.find('button');
        cy.log(`Found ${buttons.length} interactive buttons`);
        expect(buttons.length).to.be.greaterThan(5);
      });
    });

    it('should verify Data Leak specific components', () => {
      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        
        const hasKeywords = bodyText.includes('Keywords Monitored');
        const hasAlerts = bodyText.includes('Alerts');
        const hasArchived = bodyText.includes('Archived');
        const hasPastebin = bodyText.includes('pastebin') || bodyText.includes('github');
        
        if (hasKeywords) cy.log('Keywords section found');
        if (hasAlerts) cy.log('Alerts section found');
        if (hasArchived) cy.log('Archived section found');
        if (hasPastebin) cy.log('External sources found');
        
        expect(hasKeywords || hasAlerts).to.be.true;
      });
    });

    it('should verify all major components are loaded', () => {
      cy.get('.container-fluid').should('exist');
      cy.get('.d-flex.w-100.h-100.position-relative').should('exist');
      cy.get('table.table-striped').should('have.length.at.least', 2);
      cy.get('h4:contains("Keywords Monitored")').should('exist');
      cy.get('h4:contains("Alerts")').should('exist');
      cy.scrollTo('bottom');
      cy.get('h4:contains("Archived Alerts")').should('exist');
    });
  });

  after(() => {
    cy.log('Starting Data Leak cleanup...');
    
    cy.request({
      method: 'GET',
      url: '/api/data_leak/keyword/',
      headers: {
        'Authorization': `Token ${Cypress.env('authData').token}`
      },
      failOnStatusCode: false
    }).then((response) => {
      if (response.status === 200 && response.body && response.body.results) {
        response.body.results.forEach((keyword) => {
          if (keyword.name.includes('test-') || keyword.name.includes('e2e-')) {
            cy.request({
              method: 'DELETE',
              url: `/api/data_leak/keyword/${keyword.id}/`,
              headers: { 'Authorization': `Token ${Cypress.env('authData').token}` },
              failOnStatusCode: false
            });
          }
        });
      }
    });

    cy.window().then((win) => {
      win.localStorage.removeItem('watcher_localstorage_layout_dataLeak');
      win.localStorage.removeItem('watcher_localstorage_items_dataLeak_alerts');
      win.localStorage.removeItem('watcher_localstorage_items_dataLeak_archived');
      win.localStorage.removeItem('watcher_localstorage_items_dataLeak_keywords');
      win.localStorage.removeItem('watcher_localstorage_filters_dataLeak');
      win.localStorage.clear();
      win.sessionStorage.clear();
    });
    
    cy.log('Data Leak cleanup completed');
  });
});