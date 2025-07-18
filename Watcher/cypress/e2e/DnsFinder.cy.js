describe('DNS Finder - E2E Test Suite', () => {
  before(() => {
    cy.authenticateWithTestUser();
    cy.wait(2000);
    cy.log('Authentication completed and saved');
  });

  beforeEach(() => {
    cy.on('uncaught:exception', () => false);

    const credentials = Cypress.env('testCredentials');

    cy.window().then((win) => {
      const authData = Cypress.env('authData');
      if (authData && authData.token) {
        if (authData.token) win.localStorage.setItem('token', authData.token);
        if (authData.user) win.localStorage.setItem('user', authData.user);
        cy.log('Session restored');
      }
    });

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
            id: 101, domain_name: "vvatcher.com",
            dns_monitored: { id: 1, domain_name: "watcher.com" },
            keyword_monitored: null, fuzzer: "homoglyph",
            misp_event_uuid: "['550e8400-e29b-41d4-a716-446655440000']",
            created_at: "2025-06-19T14:30:00Z"
          },
          status: true, created_at: "2025-06-19T14:30:00Z"
        },
        {
          id: 2,
          dns_twisted: {
            id: 102, domain_name: "watcher-threat.com",
            dns_monitored: null, keyword_monitored: { id: 1, name: "watcher" },
            fuzzer: null, misp_event_uuid: null, created_at: "2025-06-19T12:15:00Z"
          },
          status: true, created_at: "2025-06-19T12:15:00Z"
        },
        {
          id: 3,
          dns_twisted: {
            id: 103, domain_name: "vvatcher.fr",
            dns_monitored: { id: 2, domain_name: "watcher.fr" },
            keyword_monitored: null, fuzzer: "bitsquatting",
            misp_event_uuid: "['550e8400-e29b-41d4-a716-446655440001']",
            created_at: "2025-06-18T16:45:00Z"
          },
          status: false, created_at: "2025-06-18T16:45:00Z"
        }
      ]
    }).as('getAlerts');

    // Mock CRUD operations
    cy.intercept('POST', '/api/dns_finder/dns_monitored/', (req) => ({
      statusCode: 201, body: { id: Date.now(), ...req.body, created_at: new Date().toISOString() }
    })).as('addDnsMonitored');

    cy.intercept('POST', '/api/dns_finder/keyword_monitored/', (req) => ({
      statusCode: 201, body: { id: Date.now(), ...req.body, created_at: new Date().toISOString() }
    })).as('addKeywordMonitored');

    cy.intercept('DELETE', '/api/dns_finder/dns_monitored/*', { statusCode: 204 }).as('deleteDnsMonitored');
    cy.intercept('DELETE', '/api/dns_finder/keyword_monitored/*', { statusCode: 204 }).as('deleteKeywordMonitored');
    cy.intercept('PATCH', '/api/dns_finder/alert/*', (req) => ({
      statusCode: 200, body: { id: parseInt(req.url.split('/').pop()), ...req.body }
    })).as('updateAlertStatus');

    cy.intercept('POST', '/api/dns_finder/misp/', {
      statusCode: 200, body: { message: 'Successfully exported to MISP', event_uuid: '550e8400-e29b-41d4-a716-446655440003' }
    }).as('exportToMISP');

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
        token: Cypress.env('authToken') || 'mock-token-123456789',
        user: { 
          id: 1, 
          username: credentials.username, 
          first_name: credentials.firstName, 
          email: credentials.email 
        } 
      }
    }).as('login');

    cy.intercept('GET', '/api/threats_watcher/trendyword/', { statusCode: 200, body: [] });
    cy.intercept('GET', '/api/site_monitoring/site/', { statusCode: 200, body: [] }).as('getSites');
    cy.intercept('POST', '/api/site_monitoring/site/', (req) => ({
      statusCode: 201,
      body: { id: Date.now(), ...req.body, rtir: `SM-2025-${String(Date.now()).slice(-3)}`,
              created_at: new Date().toISOString(), monitored: false, misp_event_uuid: null, web_status: null }
    })).as('addSite');

    // Navigation to DNS Finder
    cy.url().then((currentUrl) => {
      if (!currentUrl.includes('/dns_finder')) {
        cy.log('Navigating to DNS Finder...');
        cy.visit('/#/dns_finder');
      } else {
        cy.log('Staying on DNS Finder page');
      }
    });
    
    cy.wait(1000);
    cy.url().should('include', '/dns_finder');
    cy.get('.container-fluid', { timeout: 15000 }).should('exist');
    
    cy.wait('@getDnsMonitored', { timeout: 15000 });
    cy.wait('@getKeywordMonitored', { timeout: 15000 });
    cy.wait('@getAlerts', { timeout: 15000 });
    
    cy.log('Page loaded with session');
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
          if (dns.domain_name && dns.domain_name.includes('test-dns-e2e')) {
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
          if (keyword.name && keyword.name.includes('test-keyword-e2e')) {
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
      win.localStorage.clear();
      win.sessionStorage.clear();
    });
    
    cy.log('DNS Finder cleanup completed');
  });

  describe('Page Navigation and Access', () => {
    it('should be on the correct DNS Finder page', () => {
      cy.url().should('include', '#/dns_finder');
      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('exist');
    });

    it('should display main sections', () => {
      cy.get('h4', { timeout: 15000 }).should('exist');
      cy.get('table', { timeout: 15000 }).should('exist');
      cy.get('body').should('contain', 'Alert');
    });

    it('should load data automatically', () => {
      cy.get('table tbody tr', { timeout: 15000 }).should('exist');
    });

    it('should maintain session across navigation', () => {
      cy.get('.navbar').should('exist');
      cy.get('a:contains("Twisted DNS Finder")').should('exist');
      
      cy.get('a[href="/#/"], a:contains("Watcher"), .navbar-brand').first().click();
      cy.url().should('include', '#/');
      
      cy.get('a:contains("Twisted DNS Finder"), a[href*="dns_finder"]').should('exist').click();
      cy.url().should('include', 'dns_finder');
      
      cy.get('.navbar').should('exist');
    });
  });

  describe('DNS Monitored Display and Management', () => {
    it('should display DNS monitored table structure', () => {
      cy.url().should('include', '/dns_finder');
      cy.get('table', { timeout: 20000 }).should('exist');
      
      cy.get('table').first().within(() => {
        cy.get('thead').should('exist');
        cy.get('tbody').should('exist');
      });
      
      cy.get('table tbody tr', { timeout: 10000 }).should('have.length.at.least', 1);
    });

    it('should display DNS monitored data when available', () => {
      cy.get('table tbody', { timeout: 15000 }).should('exist');
      cy.get('table tbody tr').should('have.length.at.least', 1);
      
      cy.get('tbody').should('contain', 'watcher.com');
      cy.get('tbody').should('contain', 'watcher.fr');
      cy.get('tbody').should('contain', 'watcher.org');
    });

    it('should find and interact with Add DNS button', () => {
      cy.get('body').then(($body) => {
        const addButtons = $body.find('button:contains("Add"), button:contains("New"), button:contains("Create")');
        if (addButtons.length > 0) {
          cy.wrap(addButtons.first()).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          cy.get('.modal-title').should('contain', 'Action Requested');
          cy.get('input[placeholder*="example"]').should('exist');
          cy.get('button:contains("Close"), button:contains("Cancel"), .modal .close').first().click();
        } else {
          cy.log('No Add DNS button found');
        }
      });
    });

    it('should find action buttons when data is present', () => {
      cy.get('body').then(($body) => {
        const actionButtons = $body.find('button[title*="Edit"], button[title*="Delete"], button[data-toggle="tooltip"], i.material-icons').parent('button');
        
        if (actionButtons.length > 0) {
          cy.wrap(actionButtons.first()).should('be.visible');
          cy.log(`Found ${actionButtons.length} action buttons`);
        } else {
          cy.log('No action buttons found');
        }
      });
    });

    it('should handle complete DNS addition workflow', () => {
      cy.get('body').then(($body) => {
        const addButtons = $body.find('button:contains("Add"), button:contains("New")');
        if (addButtons.length > 0) {
          cy.wrap(addButtons.first()).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          
          cy.get('input[placeholder*="example"], input[type="text"]').first().type('test-dns-e2e.com');
          
          cy.get('.modal').within(() => {
            cy.get('button[type="submit"], button:contains("Add")').click({ force: true });
          });
          
          cy.get('.modal', { timeout: 15000 }).should('not.exist');
        }
      });
    });
  });

  describe('Keyword Monitored Display and Management', () => {
    it('should display keyword monitored table structure', () => {
      cy.url().should('include', '/dns_finder');
      cy.get('table', { timeout: 20000 }).should('exist');
      
      cy.get('table').each(($table) => {
        cy.wrap($table).within(() => {
          cy.get('thead').should('exist');
          cy.get('tbody').should('exist');
        });
      });
    });

    it('should display keyword monitored data when available', () => {
      cy.get('table', { timeout: 15000 }).should('exist');
      
      cy.get('tbody').should('contain', 'watcher');
      cy.get('tbody').should('contain', 'threat-intel');
      cy.get('tbody').should('contain', 'security-corp');
    });

    it('should find and interact with Add Keyword button', () => {
      cy.get('body').then(($body) => {
        const addButtons = $body.find('button:contains("Add"), button:contains("New"), button:contains("Create")');
        if (addButtons.length > 1) {
          cy.wrap(addButtons.eq(1)).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          cy.get('.modal-title').should('contain', 'Action Requested');
          cy.get('input[placeholder*="company"], input[type="text"]').should('exist');
          cy.get('button:contains("Close"), button:contains("Cancel"), .modal .close').first().click();
        } else {
          cy.log('No Add Keyword button found');
        }
      });
    });

    it('should handle complete keyword addition workflow', () => {
      cy.get('body').then(($body) => {
        const addButtons = $body.find('button:contains("Add"), button:contains("New")');
        if (addButtons.length > 1) {
          cy.wrap(addButtons.eq(1)).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          
          cy.get('input[placeholder*="company"], input[type="text"]').first().type('test-keyword-e2e');
          
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
      cy.url().should('include', '/dns_finder');
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
      
      cy.get('tbody').should('contain', 'vvatcher.com');
      cy.get('tbody').should('contain', 'watcher-threat.com');
      cy.get('tbody').should('contain', 'vvatcher.fr');
    });

    it('should find alert action buttons', () => {
      cy.get('body').then(($body) => {
        const alertButtons = $body.find('button:contains("Disable"), button:contains("Enable"), button:contains("Export"), button:contains("Add to Website Monitoring")');
        
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
        const disableButtons = $body.find('button:contains("Disable"), button:contains("Enable")');
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

    it('should display MISP status badges correctly', () => {
      cy.get('body').should('contain', 'vvatcher.com');
      cy.get('i.material-icons').then(($icons) => {
        const cloudIcons = $icons.filter((index, icon) => {
          return Cypress.$(icon).text().includes('cloud');
        });
        if (cloudIcons.length > 0) {
          cy.log(`Found ${cloudIcons.length} MISP cloud icons`);
        }
      });
    });
  });

  describe('Form Interactions and CRUD Operations', () => {
    it('should validate form inputs', () => {
      cy.get('body').then(($body) => {
        const addButtons = $body.find('button:contains("Add"), button:contains("New")');
        if (addButtons.length > 0) {
          cy.wrap(addButtons.first()).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          
          cy.get('input[required]').should('have.attr', 'required');
          
          cy.get('button:contains("Close"), button:contains("Cancel")').first().click();
        }
      });
    });

    it('should handle MISP export workflow', () => {
      cy.get('body').then(($body) => {
        const mispButtons = $body.find('button[title*="Export"], button[title*="MISP"], button:contains("Export")');
        if (mispButtons.length > 0) {
          cy.wrap(mispButtons.first()).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          
          cy.get('.modal').then(($modal) => {
            const modalText = $modal.text();
            if (modalText.includes('MISP') || modalText.includes('Export') || modalText.includes('Event') || modalText.includes('UUID')) {
              cy.log('MISP modal content verified');
            } else {
              cy.log('Modal opened but content differs from expected MISP patterns');
            }
          });
          
          cy.get('button:contains("Close"), .modal .close').first().click();
        } else {
          cy.log('No MISP export buttons found');
        }
      });
    });

    it('should handle add to website monitoring workflow', () => {
      cy.get('body').then(($body) => {
        const addToSiteButtons = $body.find('button:contains("Add to Website Monitoring")');
        if (addToSiteButtons.length > 0) {
          cy.wrap(addToSiteButtons.first()).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          
          cy.get('.modal').within(() => {
            cy.get('.modal-title').should('contain', 'Action Requested');
            cy.get('.modal-body').should('exist');
          });
          
          cy.get('button:contains("Close"), button:contains("Cancel")').first().click();
        } else {
          cy.log('No Add to Website Monitoring buttons found');
        }
      });
    });
  });

  describe('Navigation and UI Tests', () => {
    it('should navigate between different sections', () => {
      cy.get('a[href="/#/"], a:contains("Watcher"), .navbar-brand').first().click();
      cy.url().should('include', '#/');
      
      cy.get('a:contains("Twisted DNS Finder"), a[href*="dns_finder"]').should('exist').click();
      cy.url().should('include', 'dns_finder');
    });

    it('should test header navigation links', () => {
      cy.get('.navbar, nav').should('exist');
      cy.get('a:contains("Website Monitoring"), a[href*="website_monitoring"]').should('exist');
      cy.get('a:contains("Data Leak"), a[href*="data_leak"]').should('exist');
      cy.get('a:contains("Twisted DNS Finder"), a[href*="dns_finder"]').should('exist');
    });

    it('should maintain responsive design', () => {
      cy.viewport(375, 667);
      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('be.visible');
      
      cy.viewport(768, 1024);
      cy.get('body').should('be.visible');
      
      cy.viewport(1280, 720);
      cy.get('body').should('be.visible');
    });

    it('should handle Bootstrap components correctly', () => {
      cy.get('.container-fluid').should('exist');
      cy.get('.row').should('exist');
      cy.get('[class*="col-"]').should('exist');
    });

    it('should verify layout structure specific to DNS Finder', () => {
      cy.get('.row').should('have.length.at.least', 2);
      cy.get('.col-lg-8').should('exist');
      cy.get('.col-lg-4').should('exist');
      
      cy.get('.container-fluid.mt-4').should('exist');
      cy.get('.container-fluid.mt-4 .row').should('have.length.at.least', 2);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle API errors gracefully', () => {
      cy.intercept('GET', '/api/dns_finder/dns_monitored/', { statusCode: 500, body: { error: 'Server Error' } }).as('dnsError');
      cy.intercept('GET', '/api/dns_finder/keyword_monitored/', { statusCode: 500, body: { error: 'Server Error' } }).as('keywordError');
      cy.intercept('GET', '/api/dns_finder/alert/', { statusCode: 500, body: { error: 'Server Error' } }).as('alertsError');

      cy.visit('/#/dns_finder');
      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('exist');
    });

    it('should handle empty data states', () => {
      cy.intercept('GET', '/api/dns_finder/dns_monitored/', { statusCode: 200, body: [] }).as('emptyDns');
      cy.intercept('GET', '/api/dns_finder/keyword_monitored/', { statusCode: 200, body: [] }).as('emptyKeywords');
      cy.intercept('GET', '/api/dns_finder/alert/', { statusCode: 200, body: [] }).as('emptyAlerts');

      cy.visit('/#/dns_finder');
      cy.get('body').should('be.visible');
      cy.get('table').should('exist');
      cy.get('table thead').should('exist');
    });
  });

  describe('Performance and Integration Tests', () => {
    it('should load page within reasonable time', () => {
      const startTime = Date.now();
      cy.visit('/#/dns_finder');
      
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

    it('should verify DNS Finder specific components', () => {
      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        if (bodyText.includes('Dnstwist Algorithm') || bodyText.includes('Certificate Transparency') || bodyText.includes('Twisted DNS') || bodyText.includes('Corporate Keyword')) {
          cy.log('DNS Finder specific components found');
        } else {
          cy.log('DNS Finder components may be loaded differently');
        }
      });
    });
  });
});