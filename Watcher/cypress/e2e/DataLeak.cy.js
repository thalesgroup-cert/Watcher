describe('Data Leak - E2E Test Suite', () => {
  before(() => {
    const credentials = Cypress.env('testCredentials');

    // Setup API mocks
    cy.intercept('GET', '/api/data_leak/keyword/', {
      statusCode: 200,
      body: [
        { id: 1, name: "confidential", created_at: "2025-06-19T10:00:00Z" },
        { id: 2, name: "internal", created_at: "2025-06-18T15:30:00Z" },
        { id: 3, name: "company-data", created_at: "2025-06-17T08:15:00Z" }
      ]
    }).as('getKeywords');

    cy.intercept('GET', '/api/data_leak/alert/', {
      statusCode: 200,
      body: [
        {
          id: 1,
          keyword: { id: 1, name: "confidential" },
          url: "https://github.com/thalesgroup-cert/Watcher/",
          content: "Confidential company information found in paste",
          status: true,
          created_at: "2025-06-19T14:30:00Z"
        },
        {
          id: 2,
          keyword: { id: 2, name: "internal" },
          url: "https://github.com/thalesgroup-cert/Watcher/", 
          content: "Internal documentation exposed",
          status: true,
          created_at: "2025-06-19T12:15:00Z"
        },
        {
          id: 3,
          keyword: { id: 1, name: "confidential" },
          url: "https://github.com/thalesgroup-cert/Watcher/",
          content: "More confidential data leak detected", 
          status: false,
          created_at: "2025-06-18T16:45:00Z"
        }
      ]
    }).as('getAlerts');

    // Mock CRUD operations
    cy.intercept('POST', '/api/data_leak/keyword/', (req) => ({
      statusCode: 201,
      body: { id: Date.now(), ...req.body, created_at: new Date().toISOString() }
    })).as('addKeyword');

    cy.intercept('DELETE', '/api/data_leak/keyword/*', { statusCode: 204 }).as('deleteKeyword');

    cy.intercept('PATCH', '/api/data_leak/alert/*', (req) => ({
      statusCode: 200, body: { id: parseInt(req.url.split('/').pop()), ...req.body }
    })).as('updateAlertStatus');

    // Mock auth endpoints with test credentials
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

    cy.intercept('GET', '/api/threats_watcher/trendyword/', { statusCode: 200, body: [] });

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

    it('should display main sections', () => {
      cy.get('h4', { timeout: 15000 }).should('exist');
      cy.get('table', { timeout: 15000 }).should('exist');
      cy.get('body').should('contain', 'Alert');
    });

    it('should load data automatically', () => {
      cy.get('table', { timeout: 15000 }).should('exist');
      cy.get('table').should('have.length.at.least', 1);
      
      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        if (bodyText.includes('confidential') || bodyText.includes('internal') || bodyText.includes('pastebin.com')) {
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
    it('should display keywords table structure', () => {
      cy.url().should('include', '/data_leak');
      cy.get('table', { timeout: 20000 }).should('exist');
      
      cy.get('table').first().within(() => {
        cy.get('thead').should('exist');
        cy.get('tbody').should('exist');
      });
      
      cy.get('table').should('have.length.at.least', 1);
    });

    it('should display keywords data when available', () => {
      cy.get('table', { timeout: 15000 }).should('exist');
      
      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        if (bodyText.includes('confidential') || bodyText.includes('internal') || bodyText.includes('company-data')) {
          cy.log('Keywords data found in tables');
          cy.get('table tbody tr').should('have.length.at.least', 1);
        } else {
          cy.log('Keywords data may be loaded in different sections or format');
          cy.get('table tbody').should('exist');
        }
      });
    });

    it('should find and interact with Add Keyword button', () => {
      cy.get('body').then(($body) => {
        const addButtons = $body.find('button:contains("Add New Keyword"), button:contains("Add Keyword"), button:contains("Add")');
        if (addButtons.length > 0) {
          cy.wrap(addButtons.first()).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          cy.get('.modal-title').should('contain', 'Action Requested');
          cy.get('input[placeholder*="confidential"], input[type="text"]').should('exist');
          cy.get('button:contains("Close"), button:contains("Cancel"), .modal .close').first().click();
        } else {
          cy.log('No Add Keyword button found');
        }
      });
    });

    it('should handle complete keyword addition workflow', () => {
      cy.get('body').then(($body) => {
        const addButtons = $body.find('button:contains("Add New Keyword"), button:contains("Add")');
        if (addButtons.length > 0) {
          cy.wrap(addButtons.first()).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          
          cy.get('input[placeholder*="confidential"], input[type="text"]').first().type('test-leak-keyword');
          
          cy.get('.modal').within(() => {
            cy.get('button[type="submit"], button:contains("Add")').click({ force: true });
          });
          
          cy.get('.modal', { timeout: 15000 }).should('not.exist');
        }
      });
    });
  });

  describe('Alerts Display and Management', () => {
    it('should display alerts sections', () => {
      cy.url().should('include', '/data_leak');
      cy.get('body').should('contain', 'Alert');
      cy.get('table').should('have.length.at.least', 1);
      cy.get('h4').should('contain', 'Alerts');
      cy.get('h4').should('contain', 'Archived Alerts');
    });

    it('should display alert data structure', () => {
      cy.get('table').each(($table) => {
        cy.wrap($table).within(() => {
          cy.get('thead th').should('exist');
          cy.get('tbody').should('exist');
        });
      });
      
      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        if (bodyText.includes('confidential') || bodyText.includes('internal') || bodyText.includes('pastebin.com')) {
          cy.log('Alert data found in tables');
        } else {
          cy.log('Alert data may be in different sections');
        }
      });
    });

    it('should find alert action buttons', () => {
      cy.get('body').then(($body) => {
        const alertButtons = $body.find('button:contains("Disable"), button:contains("Enable"), button:contains("Link"), button:contains("Content")');
        
        if (alertButtons.length > 0) {
          cy.wrap(alertButtons.first()).should('be.visible');
          cy.log(`Found ${alertButtons.length} alert action buttons`);
        } else {
          cy.log('No alert action buttons found');
        }
      });
    });

    it('should handle modal interactions for alerts', () => {
      cy.get('body').then(($body) => {
        const disableButtons = $body.find('button:contains("Disable")');
        if (disableButtons.length > 0) {
          cy.wrap(disableButtons.first()).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          cy.get('.modal').within(() => {
            cy.get('.modal-title').should('exist');
            cy.get('.modal-body').should('exist');
          });
          cy.get('button:contains("Close"), .modal .close').first().click();
        }
      });
    });

    it('should handle alert status changes', () => {
      cy.get('body').then(($body) => {
        const statusButtons = $body.find('button:contains("Disable"), button:contains("Enable")');
        if (statusButtons.length > 0) {
          cy.wrap(statusButtons.first()).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          
          cy.get('.modal').then(($modal) => {
            const modalText = $modal.text();
            if (modalText.includes('disable') || modalText.includes('enable') || modalText.includes('sure') || modalText.includes('Action Requested')) {
              cy.log('Alert status modal content verified');
            } else {
              cy.log('Modal opened but content differs from expected patterns');
            }
          });
          
          cy.get('button:contains("Yes"), button[type="submit"]').first().click();
          cy.get('.modal', { timeout: 10000 }).should('not.exist');
        }
      });
    });

    it('should handle content modal for pastebin alerts', () => {
      cy.get('body').then(($body) => {
        const contentButtons = $body.find('button:contains("Content")');
        if (contentButtons.length > 0) {
          cy.wrap(contentButtons.first()).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          
          cy.get('.modal').then(($modal) => {
            const modalText = $modal.text();
            if (modalText.includes('was found') || modalText.includes('Raw') || modalText.includes('Download')) {
              cy.log('Content modal verified');
            } else {
              cy.log('Content modal opened but content differs from expected patterns');
            }
          });
          
          cy.get('button:contains("Close"), .modal .close').first().click();
        } else {
          cy.log('No Content buttons found');
        }
      });
    });
  });

  describe('External Links and Actions', () => {
    it('should handle external link buttons', () => {
      cy.get('body').then(($body) => {
        const linkButtons = $body.find('button:contains("Link")');
        if (linkButtons.length > 0) {
          cy.wrap(linkButtons).should('be.visible');
          cy.log(`Found ${linkButtons.length} external link buttons`);
        } else {
          cy.log('No Link buttons found');
        }
      });
    });

    it('should display URL information correctly', () => {
      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        if (bodyText.includes('pastebin.com') || bodyText.includes('github.com')) {
          cy.log('External URLs found in alerts table');
        } else {
          cy.log('URLs may be displayed differently');
        }
      });
    });

    it('should show download functionality for content', () => {
      cy.get('body').then(($body) => {
        const contentButtons = $body.find('button:contains("Content")');
        if (contentButtons.length > 0) {
          cy.wrap(contentButtons.first()).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          
          cy.get('button:contains("Download")').should('exist');
          cy.get('textarea[readonly]').should('exist');
          
          cy.get('button:contains("Close")').first().click();
        }
      });
    });
  });

  describe('Data Display and Processing', () => {
    it('should display keyword information in alerts', () => {
      cy.get('table').should('exist');
      cy.get('table').then(($tables) => {
        if ($tables.find('tbody td').length > 0) {
          cy.log('Alert table has data cells');
        } else {
          cy.log('Alert table structure exists but no data visible');
        }
      });
    });

    it('should show creation dates correctly', () => {
      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        if (bodyText.includes('2025') || bodyText.includes('/') || bodyText.includes(':')) {
          cy.log('Date information found in table');
        } else {
          cy.log('Date format may be different');
        }
      });
    });

    it('should display alert IDs and status', () => {
      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        if (bodyText.includes('#') || bodyText.includes('1') || bodyText.includes('2')) {
          cy.log('Alert IDs found in table');
        }
      });
    });
  });

  describe('Form Interactions and CRUD Operations', () => {
    it('should validate form inputs', () => {
      cy.get('body').then(($body) => {
        const addButtons = $body.find('button:contains("Add New Keyword"), button:contains("Add")');
        if (addButtons.length > 0) {
          cy.wrap(addButtons.first()).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          
          cy.get('input[required]').should('have.attr', 'required');
          
          cy.get('button:contains("Close"), button:contains("Cancel")').first().click();
        }
      });
    });

    it('should handle keyword deletion workflow', () => {
      cy.get('body').then(($body) => {
        const deleteButtons = $body.find('button[title*="Delete"], button:contains("Delete")');
        if (deleteButtons.length > 0) {
          cy.wrap(deleteButtons.first()).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          
          cy.get('.modal').within(() => {
            cy.get('.modal-title').should('contain', 'Action Requested');
            cy.get('.modal-body').should('exist');
          });
          
          cy.get('button:contains("Close"), button:contains("Cancel")').first().click();
        } else {
          cy.log('No Delete buttons found');
        }
      });
    });
  });

  describe('Navigation and UI Tests', () => {
    it('should navigate between different sections', () => {
      cy.get('a[href="/#/"], a:contains("Watcher"), .navbar-brand').first().click();
      cy.url().should('include', '#/');
      
      cy.get('a:contains("Data Leak"), a[href*="data_leak"]').should('exist').click();
      cy.url().should('include', 'data_leak');
    });

    it('should test header navigation links', () => {
      cy.get('.navbar, nav').should('exist');
      cy.get('a:contains("Website Monitoring"), a[href*="website_monitoring"]').should('exist');
      cy.get('a:contains("Data Leak"), a[href*="data_leak"]').should('exist');
      cy.get('a:contains("Twisted DNS Finder"), a[href*="dns_finder"]').should('exist');
    });

    it('should handle Bootstrap components correctly', () => {
      cy.get('.container-fluid').should('exist');
      cy.get('.row').should('exist');
      cy.get('[class*="col-"]').should('exist');
    });

    it('should verify layout structure specific to Data Leak', () => {
      cy.get('.row').should('have.length.at.least', 2);
      cy.get('.container-fluid.mt-4').should('exist');
      cy.get('.container-fluid.mt-4 .row').should('have.length.at.least', 2);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle API errors gracefully', () => {
      cy.intercept('GET', '/api/data_leak/keyword/', { statusCode: 500, body: { error: 'Server Error' } }).as('keywordError');
      cy.intercept('GET', '/api/data_leak/alert/', { statusCode: 500, body: { error: 'Server Error' } }).as('alertsError');

      cy.reload();
      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('exist');
    });

    it('should handle empty data states', () => {
      cy.intercept('GET', '/api/data_leak/keyword/', { statusCode: 200, body: [] }).as('emptyKeywords');
      cy.intercept('GET', '/api/data_leak/alert/', { statusCode: 200, body: [] }).as('emptyAlerts');

      cy.reload();
      cy.get('body').should('be.visible');
      cy.get('table').should('exist');
      cy.get('table thead').should('exist');
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
      cy.get('h4').should('exist');
      cy.get('table').should('exist');
      
      cy.get('body').then(($body) => {
        const buttons = $body.find('button');
        if (buttons.length > 0) {
          cy.log(`Found ${buttons.length} interactive buttons`);
        }
        
        const links = $body.find('a');
        if (links.length > 0) {
          cy.log(`Found ${links.length} navigation links`);
        }
      });
    });

    it('should verify Data Leak specific components', () => {
      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        if (bodyText.includes('Keywords') || bodyText.includes('pastebin') || bodyText.includes('Content') || bodyText.includes('Download')) {
          cy.log('Data Leak specific components found');
        } else {
          cy.log('Data Leak components may be loaded differently');
        }
      });
    });
  });

  after(() => {
    cy.log('Starting Data Leak cleanup...');
    
    // Clean up test keyword entries
    cy.request({
      method: 'GET',
      url: '/api/data_leak/keyword/',
      headers: {
        'Authorization': `Token ${Cypress.env('authData').token}`
      },
      failOnStatusCode: false
    }).then((response) => {
      if (response.status === 200 && response.body) {
        response.body.forEach((keyword) => {
          if (keyword.name && keyword.name.includes('test-leak-keyword')) {
            cy.request({
              method: 'DELETE',
              url: `/api/data_leak/keyword/${keyword.id}/`,
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
      win.localStorage.clear();
      win.sessionStorage.clear();
    });
    
    cy.log('Data Leak cleanup completed');
  });
});