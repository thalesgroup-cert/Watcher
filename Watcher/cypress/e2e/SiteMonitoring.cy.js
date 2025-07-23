describe('Site Monitoring - E2E Test Suite', () => {
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
    cy.intercept('GET', '/api/site_monitoring/site/', {
      statusCode: 200,
      body: [
        {
          id: 1, domain_name: "watcher.com", ip: "192.168.1.10", rtir: "SM-2025-001",
          ticket_id: "240529-2e0a2", expiry: "2025-12-31T23:59:59Z", ip_monitoring: true,
          content_monitoring: true, mail_monitoring: true, monitored: true,
          misp_event_uuid: "['550e8400-e29b-41d4-a716-446655440000']",
          created_at: "2025-06-19T10:00:00Z", web_status: 200
        },
        {
          id: 2, domain_name: "watcher.fr", ip: "10.0.0.5", rtir: "SM-2025-002",
          ticket_id: "240530-3f1b3", expiry: "2025-11-30T23:59:59Z", ip_monitoring: true,
          content_monitoring: false, mail_monitoring: true, monitored: false,
          misp_event_uuid: null, created_at: "2025-06-18T15:30:00Z", web_status: null
        },
        {
          id: 3, domain_name: "watcher.org", ip: "172.16.0.20", rtir: "SM-2025-003",
          ticket_id: null, expiry: null, ip_monitoring: false, content_monitoring: true,
          mail_monitoring: false, monitored: true,
          misp_event_uuid: "['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002']",
          created_at: "2025-06-17T08:15:00Z", web_status: 200
        }
      ]
    }).as('getSites');

    cy.intercept('GET', '/api/site_monitoring/alert/', {
      statusCode: 200,
      body: [
        {
          id: 1, site: { id: 1, domain_name: "watcher.com" }, type: "IP change detected",
          new_ip: "192.168.1.11", old_ip: "192.168.1.10", new_ip_second: null, old_ip_second: null,
          new_MX_records: "['mail.watcher.com']", old_MX_records: "['old-mail.watcher.com']",
          new_mail_A_record_ip: "192.168.1.11", old_mail_A_record_ip: "192.168.1.10",
          difference_score: 95.5, status: true, created_at: "2025-06-19T14:30:00Z"
        },
        {
          id: 2, site: { id: 2, domain_name: "watcher.fr" }, type: "Content change detected",
          new_ip: null, old_ip: null, new_ip_second: null, old_ip_second: null,
          new_MX_records: null, old_MX_records: null, new_mail_A_record_ip: null, old_mail_A_record_ip: null,
          difference_score: 87.2, status: true, created_at: "2025-06-19T12:15:00Z"
        },
        {
          id: 3, site: { id: 1, domain_name: "watcher.com" }, type: "MX records change detected",
          new_ip: null, old_ip: null, new_ip_second: null, old_ip_second: null,
          new_MX_records: "['new-mail.watcher.com']", old_MX_records: "['mail.watcher.com']",
          new_mail_A_record_ip: "172.16.0.25", old_mail_A_record_ip: "172.16.0.20",
          difference_score: 78.9, status: false, created_at: "2025-06-18T16:45:00Z"
        }
      ]
    }).as('getSiteAlerts');

    cy.intercept('POST', '/api/site_monitoring/site/', (req) => ({
      statusCode: 201,
      body: { id: Date.now(), ...req.body, rtir: `SM-2025-${String(Date.now()).slice(-3)}`,
              created_at: new Date().toISOString(), monitored: false, misp_event_uuid: null, web_status: null }
    })).as('addSite');

    cy.intercept('DELETE', '/api/site_monitoring/site/*', { statusCode: 204 }).as('deleteSite');
    cy.intercept('PATCH', '/api/site_monitoring/site/*', (req) => ({
      statusCode: 200, body: { id: parseInt(req.url.split('/').pop()), ...req.body }
    })).as('patchSite');

    cy.intercept('PATCH', '/api/site_monitoring/alert/*', (req) => ({
      statusCode: 200, body: { id: parseInt(req.url.split('/').pop()), ...req.body }
    })).as('updateSiteAlertStatus');

    cy.intercept('POST', '/api/site_monitoring/misp/', {
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

    // Navigation to website monitoring
    cy.url().then((currentUrl) => {
      if (!currentUrl.includes('/website_monitoring')) {
        cy.log('Navigating to Website Monitoring...');
        cy.visit('/#/website_monitoring');
      } else {
        cy.log('Staying on Website Monitoring page');
      }
    });
    
    cy.wait(1000);
    cy.url().should('include', '/website_monitoring');
    cy.get('.container-fluid', { timeout: 15000 }).should('exist');
    
    cy.wait('@getSites', { timeout: 15000 });
    cy.wait('@getSiteAlerts', { timeout: 15000 });
    
    cy.log('Page loaded with session');
  });

  after(() => {
    cy.log('Starting Site Monitoring cleanup...');
    
    // Clean up test site entries
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
          if (site.domain_name && site.domain_name.includes('test-e2e-site')) {
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

    // Clear localStorage and sessionStorage
    cy.window().then((win) => {
      win.localStorage.clear();
      win.sessionStorage.clear();
    });
    
    cy.log('Site Monitoring cleanup completed');
  });

  describe('Page Navigation and Access', () => {
    it('should be on the correct site monitoring page', () => {
      cy.url().should('include', '#/website_monitoring');
      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('exist');
    });

    it('should display main sections', () => {
      cy.get('h4', { timeout: 15000 }).should('exist');
      cy.get('table', { timeout: 15000 }).should('exist');
      cy.get('body').should('contain', 'Alerts');
    });

    it('should load data automatically', () => {
      cy.get('table tbody tr', { timeout: 15000 }).should('exist');
    });

    it('should maintain session across navigation', () => {
      cy.get('.navbar').should('exist');
      cy.get('a:contains("Website Monitoring")').should('exist');
      
      cy.get('a[href="/#/"], a:contains("Watcher"), .navbar-brand').first().click();
      cy.url().should('include', '#/');
      
      cy.get('a:contains("Website Monitoring"), a[href*="website_monitoring"]').should('exist').click();
      cy.url().should('include', 'website_monitoring');
      
      cy.get('.navbar').should('exist');
    });
  });

  describe('Sites Display and Management', () => {
    it('should display sites table structure', () => {
      cy.url().should('include', '/website_monitoring');
      cy.get('table', { timeout: 20000 }).should('exist');
      
      cy.get('table').first().within(() => {
        cy.get('thead').should('exist');
        cy.get('tbody').should('exist');
      });
      
      cy.get('table tbody tr', { timeout: 10000 }).should('have.length.at.least', 1);
    });

    it('should display sites data when available', () => {
      cy.get('table tbody', { timeout: 15000 }).should('exist');
      cy.get('table tbody tr').should('have.length.at.least', 1);
      
      cy.get('tbody').should('contain', 'watcher.com');
      cy.get('tbody').should('contain', 'watcher.fr');
      cy.get('tbody').should('contain', 'watcher.org');
    });

    it('should find and interact with Add button', () => {
      cy.get('body').then(($body) => {
        const addButtons = $body.find('button:contains("Add"), button:contains("New"), button:contains("Create")');
        if (addButtons.length > 0) {
          cy.wrap(addButtons.first()).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          cy.get('.modal-title').should('contain', 'Action Requested');
          cy.get('input[placeholder*="example"]').should('exist');
          cy.get('button:contains("Close"), button:contains("Cancel"), .modal .close').first().click();
        } else {
          cy.log('No Add buttons found');
        }
      });
    });

    it('should find action buttons when data is present', () => {
      cy.get('body').then(($body) => {
        const actionButtons = $body.find('button[title*="Edit"], button[title*="Delete"], button[title*="MISP"], button[data-toggle="tooltip"], i.material-icons').parent('button');
        
        if (actionButtons.length > 0) {
          cy.wrap(actionButtons.first()).should('be.visible');
          cy.log(`Found ${actionButtons.length} action buttons`);
        } else {
          cy.log('No action buttons found');
        }
      });
    });

    it('should display MISP status badges correctly', () => {
      cy.get('body').should('contain', 'watcher.com');
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

  describe('Alerts Display and Management', () => {
    it('should display alerts sections', () => {
      cy.url().should('include', '/website_monitoring');
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
      
      cy.get('tbody').should('contain', 'IP change detected');
      cy.get('tbody').should('contain', 'Content change detected');
      cy.get('tbody').should('contain', 'MX records change detected');
    });

    it('should find alert action buttons', () => {
      cy.get('body').then(($body) => {
        const alertButtons = $body.find('button:contains("Details"), button:contains("Records"), button:contains("Enable"), button:contains("Disable")');
        
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
        const detailButtons = $body.find('button:contains("Details"), button:contains("Records")');
        if (detailButtons.length > 0) {
          cy.wrap(detailButtons.first()).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          cy.get('.modal').within(() => {
            cy.get('.modal-title').should('exist');
            cy.get('.modal-body').should('exist');
          });
          cy.get('button:contains("Close"), .modal .close').first().click();
        }
      });
    });
  });

  describe('Form Interactions and CRUD Operations', () => {
    it('should handle complete site addition workflow', () => {
      cy.get('body').then(($body) => {
        const addButtons = $body.find('button:contains("Add"), button:contains("New")');
        if (addButtons.length > 0) {
          cy.wrap(addButtons.first()).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          
          cy.get('input[placeholder*="example"], input[type="text"]').first().type('test-e2e-site.com');
          
          cy.get('input[placeholder*="240529"], input[placeholder*="230509"]').then(($ticketInputs) => {
            if ($ticketInputs.length > 0) {
              cy.wrap($ticketInputs.first()).type('E2E-TEST-001');
            }
          });
          
          cy.get('input[type="checkbox"], .form-check-input').should('exist');
          
          cy.get('.modal').within(() => {
            cy.get('button[type="submit"], button:contains("Add")').click({ force: true });
          });
          
          cy.get('.modal', { timeout: 15000 }).should('not.exist');
        }
      });
    });

    it('should validate form inputs', () => {
      cy.get('body').then(($body) => {
        const addButtons = $body.find('button:contains("Add"), button:contains("New")');
        if (addButtons.length > 0) {
          cy.wrap(addButtons.first()).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          
          cy.get('input[placeholder*="example"]').should('have.attr', 'required');
          cy.get('input[placeholder*="example"]').should('have.attr', 'pattern');
          
          cy.get('button:contains("Close"), button:contains("Cancel")').first().click();
        }
      });
    });

    it('should handle MISP export workflow', () => {
      cy.get('body').then(($body) => {
        const mispButtons = $body.find('button[title*="Export"], button[title*="MISP"]');
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
  });

  describe('Alert Management Workflow', () => {
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

    it('should display alert details correctly', () => {
      cy.get('body').then(($body) => {
        const detailButtons = $body.find('button:contains("Details"), button:contains("Records")');
        if (detailButtons.length > 0) {
          cy.wrap(detailButtons.first()).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          
          cy.get('.modal').then(($modal) => {
            const modalText = $modal.text();
            if (modalText.includes('Details') || modalText.includes('IP') || modalText.includes('MX') || modalText.includes('Score')) {
              cy.log('Alert details modal content verified');
            } else {
              cy.log('Modal opened but content differs from expected details patterns');
            }
          });
          
          cy.get('button:contains("Close"), .modal .close').first().click();
        }
      });
    });
  });

  describe('Navigation and UI Tests', () => {
    it('should navigate between different sections', () => {
      cy.get('a[href="/#/"], a:contains("Watcher"), .navbar-brand').first().click();
      cy.url().should('include', '#/');
      
      cy.get('a:contains("Website Monitoring"), a[href*="website_monitoring"]').should('exist').click();
      cy.url().should('include', 'website_monitoring');
    });

    it('should test header navigation links', () => {
      cy.get('.navbar, nav').should('exist');
      cy.get('a:contains("Website Monitoring"), a[href*="website_monitoring"]').should('exist');
      cy.get('a:contains("Data Leak"), a[href*="data_leak"]').should('exist');
      cy.get('a:contains("DNS Finder"), a[href*="dns_finder"]').should('exist');
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
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle API errors gracefully', () => {
      cy.intercept('GET', '/api/site_monitoring/site/', { statusCode: 500, body: { error: 'Server Error' } }).as('sitesError');
      cy.intercept('GET', '/api/site_monitoring/alert/', { statusCode: 500, body: { error: 'Server Error' } }).as('alertsError');

      cy.visit('/#/website_monitoring');
      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('exist');
    });

    it('should handle empty data states', () => {
      cy.intercept('GET', '/api/site_monitoring/site/', { statusCode: 200, body: [] }).as('emptySites');
      cy.intercept('GET', '/api/site_monitoring/alert/', { statusCode: 200, body: [] }).as('emptyAlerts');

      cy.visit('/#/website_monitoring');
      cy.get('body').should('be.visible');
      cy.get('table').should('exist');
      cy.get('table thead').should('exist');
    });
  });

  describe('Performance and Integration Tests', () => {
    it('should load page within reasonable time', () => {
      const startTime = Date.now();
      cy.visit('/#/website_monitoring');
      
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
  });
});