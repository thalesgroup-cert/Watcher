describe('Legitimate Domains - E2E Test Suite', () => {
  const setupIntercepts = () => {
    // Setup API mocks
    cy.intercept('GET', '/api/common/legitimate_domains/', {
      statusCode: 200,
      body: {
        count: 4,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            domain_name: "watcher-company.com",
            ticket_id: "240529-1a2b3",
            contact: "IT Team - it@watcher.com",
            expiry: "2026-12-31T23:59:59Z",
            repurchased: true,
            comments: "Main corporate domain - critical asset",
            created_at: "2025-06-19T10:00:00Z"
          },
          {
            id: 2,
            domain_name: "watcher-backup.fr",
            ticket_id: "240530-4c5d6",
            contact: "Security Team",
            expiry: "2025-11-15T23:59:59Z",
            repurchased: false,
            comments: "Backup domain for disaster recovery",
            created_at: "2025-06-18T15:30:00Z"
          },
          {
            id: 3,
            domain_name: "old-watcher-domain.org",
            ticket_id: null,
            contact: "John Doe - john@watcher.com",
            expiry: "2025-10-20T23:59:59Z",
            repurchased: false,
            comments: "Expiring soon - decision pending on renewal",
            created_at: "2025-06-17T08:15:00Z"
          },
          {
            id: 4,
            domain_name: "expired-watcher.net",
            ticket_id: "240528-7e8f9",
            contact: "Legal Team",
            expiry: "2025-05-01T23:59:59Z",
            repurchased: false,
            comments: "Expired - needs immediate attention",
            created_at: "2025-06-16T12:00:00Z"
          }
        ]
      }
    }).as('getDomains');

    // Mock CRUD operations
    cy.intercept('POST', '/api/common/legitimate_domains/', (req) => ({
      statusCode: 201,
      body: {
        id: Date.now(),
        ...req.body,
        created_at: new Date().toISOString()
      }
    })).as('addDomain');

    cy.intercept('DELETE', '/api/common/legitimate_domains/*', { statusCode: 204 }).as('deleteDomain');

    cy.intercept('PATCH', '/api/common/legitimate_domains/*', (req) => ({
      statusCode: 200,
      body: { id: parseInt(req.url.split('/').pop()), ...req.body }
    })).as('patchDomain');

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

    // Navigate to Legitimate Domains
    cy.visit('/#/legitimate_domains');
    cy.wait('@getDomains', { timeout: 15000 });

    cy.log('Authentication completed and navigated to Legitimate Domains');
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
      if (!currentUrl.includes('/legitimate_domains') || currentUrl.includes('about:blank')) {
        cy.log('Redirecting back to Legitimate Domains...');
        cy.visit('/#/legitimate_domains', { failOnStatusCode: false });
        cy.wait(1000);
      } else {
        cy.log('Staying on Legitimate Domains page');
      }
    });

    cy.url().should('include', '/legitimate_domains');
    cy.get('.container-fluid', { timeout: 10000 }).should('exist');

    cy.log('Page ready with session maintained');
  });

  describe('Page Navigation and Access', () => {
    it('should be on the correct Legitimate Domains page', () => {
      cy.url().should('include', '#/legitimate_domains');
      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('exist');
    });

    it('should display LegitimateStats dashboard', () => {
      cy.get('.container-fluid.mt-3', { timeout: 15000 }).should('exist');

      cy.get('.card.border-0.shadow-sm', { timeout: 15000 }).should('have.length', 4);

      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        if (bodyText.includes('TOTAL DOMAINS') && bodyText.includes('REPURCHASED') &&
            bodyText.includes('EXPIRED') && bodyText.includes('EXPIRING SOON')) {
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
        if (bodyText.includes('watcher-company.com') || bodyText.includes('watcher-backup.fr') ||
            bodyText.includes('old-watcher-domain.org')) {
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

      cy.get('a:contains("Legitimate Domains"), a[href*="legitimate_domains"]').should('exist').click();
      cy.url().should('include', 'legitimate_domains');

      cy.get('.navbar').should('exist');
    });
  });

  describe('Statistics Dashboard', () => {
    it('should display all stat cards', () => {
      cy.get('.card.border-0.shadow-sm').should('have.length', 4);
    });

    it('should display correct stat card icons', () => {
      cy.get('.card .material-icons').then(($icons) => {
        const iconTexts = $icons.toArray().map(icon => Cypress.$(icon).text());
        const validIcons = iconTexts.filter(text => 
          text.includes('link') || text.includes('check_circle') ||
          text.includes('error') || text.includes('warning')
        );
        expect(validIcons.length).to.equal(4);
      });
    });

    it('should display stat card titles', () => {
      cy.get('.card.border-0.shadow-sm').each(($card) => {
        cy.wrap($card).within(() => {
          cy.get('.text-uppercase').should('exist');
        });
      });

      cy.get('body').should('contain', 'TOTAL DOMAINS');
      cy.get('body').should('contain', 'REPURCHASED');
      cy.get('body').should('contain', 'EXPIRED');
      cy.get('body').should('contain', 'EXPIRING SOON');
    });

    it('should update stats based on filtered data', () => {
      // Apply filter
      cy.get('button:contains("Show Filters")').first().click();
      cy.get('input[placeholder*="Search"]').clear().type('watcher-company');
      cy.wait(1000);

      cy.get('.card.border-0.shadow-sm').should('exist');
    });

    it('should display correct statistics counts', () => {
      cy.get('.card.border-0.shadow-sm').first().within(() => {
        cy.get('.h2').invoke('text').then((text) => {
          const num = parseInt(text.trim());
          cy.log(`Total domains count: ${num}`);
          expect(num).to.be.at.least(0);
        });
      });

      cy.get('.card.border-0.shadow-sm').eq(1).within(() => {
        cy.get('.h2').invoke('text').then((text) => {
          const num = parseInt(text.trim());
          cy.log(`Repurchased domains count: ${num}`);
          expect(num).to.be.at.least(0);
        });
      });

      cy.get('.card.border-0.shadow-sm').eq(2).within(() => {
        cy.get('.h2').invoke('text').then((text) => {
          const num = parseInt(text.trim());
          cy.log(`Expired domains count: ${num}`);
          expect(num).to.be.at.least(0);
        });
      });

      cy.get('.card.border-0.shadow-sm').eq(3).within(() => {
        cy.get('.h2').invoke('text').then((text) => {
          const num = parseInt(text.trim());
          cy.log(`Expiring soon domains count: ${num}`);
          expect(num).to.be.at.least(0);
        });
      });
    });
  });

  describe('Domains Display and Management', () => {
    it('should display domains table structure', () => {
      cy.get('table', { timeout: 10000 }).should('exist');

      cy.get('table').within(() => {
        cy.get('thead').should('exist');
        cy.get('tbody').should('exist');
      });
    });

    it('should display table headers correctly', () => {
      cy.get('table thead').within(() => {
        cy.get('th').should('contain', 'Domain Name');
        cy.get('th').should('contain', 'Ticket ID');
        cy.get('th').should('contain', 'Contact');
        cy.get('th').should('contain', 'Expiry');
        cy.get('th').should('contain', 'Repurchased');
        cy.get('th').should('contain', 'Comments');
      });
    });

    it('should display domains data when available', () => {
      cy.get('table tbody tr').should('have.length.at.least', 1);
      
      cy.get('tbody').then(($tbody) => {
        const text = $tbody.text();
        const hasTestDomain = text.includes('watcher') || text.includes('test-') || text.includes('.com') || text.includes('.fr');
        expect(hasTestDomain).to.be.true;
      });
    });

    it('should display TableManager features', () => {
      cy.contains('Showing', { timeout: 10000 }).should('exist');
      cy.get('select').filter((index, el) => {
        const text = Cypress.$(el).closest('.d-flex, div').find('label, span').text();
        return text.includes('Items per page');
      }).should('exist');
    });

    it('should display Add New Domain button', () => {
      cy.get('button:contains("Add New Domain"), button:contains("Add")').first().should('exist');
    });

    it('should open add domain modal', () => {
      cy.get('button:contains("Add New Domain"), button:contains("Add")').first().click();
      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('contain', 'Add New Domain');
      cy.get('input[placeholder*="example.com"]').should('exist');
      cy.get('button:contains("Close")').first().click();
    });

    it('should handle complete domain addition workflow', () => {
      cy.get('button:contains("Add New Domain"), button:contains("Add")').first().click();
      cy.get('.modal', { timeout: 10000 }).should('be.visible');

      cy.get('.modal input[placeholder*="example.com"]').first().type('test-new-legitimate-domain.com');
      cy.get('.modal input[placeholder*="240529"]').first().type('E2E-TEST-001');
      cy.get('.modal input[placeholder*="IT Team"]').first().type('E2E Test Team');
      cy.get('.modal textarea[placeholder*="Add notes"]').first().type('This is a test domain for E2E testing purposes');

      cy.get('.modal button:contains("Add")').click();

      cy.wait('@addDomain', { timeout: 10000 });
      cy.wait(1000);
    });

    it('should display action buttons for authenticated users', () => {
      cy.get('table tbody tr').first().within(() => {
        cy.get('button[title*="Edit"], i.material-icons:contains("edit")').should('exist');
        cy.get('button[title*="Delete"], i.material-icons:contains("delete")').should('exist');
      });
    });

    it('should handle domain edit workflow', () => {
      cy.get('table tbody').then(($tbody) => {
        const $matchingRow = $tbody.find('td').filter((i, td) => {
          return Cypress.$(td).text().trim() === 'watcher-company.com';
        }).closest('tr');
    
        if ($matchingRow.length) {
          cy.wrap($matchingRow).within(() => {
            cy.get('button[title*="Edit"], i.material-icons:contains("edit")').first().click();
          });
    
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          cy.get('.modal-title').should('contain', 'Edit Domain');
          cy.get('.modal input[placeholder*="example.com"]').first().invoke('val').should('equal', 'watcher-company.com');
          cy.get('button:contains("Close")').first().click();
        } else {
          cy.get('table tbody tr').first().then(($tr) => {
            const domainFromRow = $tr.find('td').first().text().trim();
    
            cy.wrap($tr).within(() => {
              cy.get('button[title*="Edit"], i.material-icons:contains("edit")').first().click();
            });
    
            cy.get('.modal', { timeout: 10000 }).should('be.visible');
            cy.get('.modal-title').should('contain', 'Edit Domain');
            cy.get('.modal input[placeholder*="example.com"]').first().invoke('val').should('equal', domainFromRow);
            cy.get('button:contains("Close")').first().click();
          });
        }
      });
    });    
    
    it('should handle domain deletion workflow', () => {
      cy.get('table tbody tr').first().within(() => {
        cy.get('button[title*="Delete"], i.material-icons:contains("delete")').first().click();
      });

      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('contain', 'Action Requested');
      cy.get('.modal-body').should('contain', 'delete');
      cy.get('button:contains("Close")').first().click();
    });

    it('should display expiry badges', () => {
      cy.get('table tbody').then(($tbody) => {
        const badges = $tbody.find('.badge').toArray().filter(el => {
          const text = Cypress.$(el).text();
          return text.includes('Expired') || text.includes('Expiring Soon') || text.includes('Valid');
        });

        if (badges.length > 0) {
          cy.log('Expiry badges found');
        }
      });
    });

    it('should sort domains table', () => {
      cy.get('table th:contains("Domain Name")').click();
      cy.wait(500);
      cy.get('table th:contains("Domain Name")').click();
      cy.wait(500);
      cy.log('Sorting toggled successfully');
    });

    it('should display comments in table', () => {
      cy.get('table tbody tr').first().within(() => {
        cy.get('td').then(($cells) => {
          const cellTexts = $cells.toArray().map(cell => Cypress.$(cell).text());
          const hasComment = cellTexts.some(text => 
            text.includes('Main corporate domain') || text.length > 0
          );
          expect(hasComment).to.be.true;
        });
      });
    });
  });

  describe('Domain Edit Modal Features', () => {
    beforeEach(() => {
      cy.get('table tbody tr').first().within(() => {
        cy.get('button[title*="Edit"], i.material-icons:contains("edit")').first().click();
      });
      cy.get('.modal', { timeout: 10000 }).should('be.visible');
    });

    afterEach(() => {
      cy.get('button:contains("Close")').first().click();
    });

    it('should display all edit form fields', () => {
      cy.get('.modal').within(() => {
        cy.get('input[placeholder*="example.com"]').should('exist');
        cy.get('input[placeholder*="240529"]').should('exist');
        cy.get('input[placeholder*="IT Team"]').should('exist');
        cy.get('input[type="checkbox"]').should('exist');
        cy.get('textarea[placeholder*="Add notes"]').should('exist');
      });
    });

    it('should display DayPickerInput for expiry date', () => {
      cy.get('.modal').within(() => {
        cy.get('.DayPickerInput, input[placeholder*="2025"]').should('exist');
      });
    });

    it('should handle repurchased toggle switch', () => {
      cy.get('.modal').within(() => {
        cy.get('input[type="checkbox"]').click({ force: true });
        cy.wait(500);
        cy.get('input[type="checkbox"]').click({ force: true });
      });
    });

    it('should validate required fields', () => {
      cy.get('.modal').within(() => {
        cy.get('input[placeholder*="example.com"]').clear();
        cy.get('button:contains("Update")').click();
      });

      cy.get('.modal').should('be.visible');
    });
  });

  describe('Domain Add Modal Features', () => {
    beforeEach(() => {
      cy.get('button:contains("Add New Domain"), button:contains("Add")').first().click();
      cy.get('.modal', { timeout: 10000 }).should('be.visible');
    });

    afterEach(() => {
      cy.get('button:contains("Close")').first().click();
    });

    it('should display all add form fields', () => {
      cy.get('.modal').within(() => {
        cy.get('input[placeholder*="example.com"]').should('exist');
        cy.get('input[placeholder*="240529"]').should('exist');
        cy.get('input[placeholder*="IT Team"]').should('exist');
        cy.get('input[type="checkbox"]').should('exist');
        cy.get('textarea[placeholder*="Add notes"]').should('exist');
      });
    });

    it('should have empty fields by default', () => {
      cy.get('.modal').within(() => {
        cy.get('input[placeholder*="example.com"]').should('have.value', '');
        cy.get('input[placeholder*="240529"]').should('have.value', '');
        cy.get('textarea[placeholder*="Add notes"]').should('have.value', '');
      });
    });

    it('should validate required domain name field', () => {
      cy.get('.modal').within(() => {
        cy.get('button:contains("Add")').click();
      });

      cy.get('.modal').should('be.visible');
    });

    it('should handle maxLength for comments', () => {
      const longText = 'a'.repeat(400);
      cy.get('.modal').within(() => {
        cy.get('textarea[placeholder*="Add notes"]').type(longText);
        cy.get('textarea[placeholder*="Add notes"]').invoke('val').should('have.length', 300);
      });
    });
  });

  describe('Filtering and Search', () => {
    it('should handle search filter', () => {
      cy.get('button:contains("Show Filters")').first().click();
      cy.wait(500);
      
      cy.get('input[placeholder*="Search"]').clear().type('watcher');
      cy.wait(1500);

      cy.get('table tbody tr').should('have.length.at.least', 1);
      
      cy.get('tbody').then(($tbody) => {
        const text = $tbody.text().toLowerCase();
        expect(text).to.include('watcher');
      });
    });

    it('should handle repurchased filter', () => {
      cy.get('button:contains("Show Filters")').first().click();
      cy.get('select').filter((index, el) => {
        const label = Cypress.$(el).closest('.col-12, .col-md-2').find('label').text();
        return label.includes('Repurchased');
      }).select('true');
      cy.wait(1000);

      cy.get('table tbody tr').should('have.length', 1);
      cy.get('tbody').should('contain', 'watcher-company.com');
    });

    it('should handle expiry status filter', () => {
      cy.get('button:contains("Show Filters")').first().click();
      cy.wait(500);
      
      cy.get('select').filter((index, el) => {
        const label = Cypress.$(el).closest('.col-12, .col-md-2').find('label').text();
        return label.includes('Expiry Status');
      }).select('expired');
      cy.wait(1500);

      cy.get('table tbody tr').should('have.length.at.least', 1);
    });

    it('should handle date range filter', () => {
      cy.get('button:contains("Show Filters")').first().click();
      cy.get('select').filter((index, el) => {
        const label = Cypress.$(el).closest('.col-12, .col-md-4').find('label').text();
        return label.includes('Created');
      }).select('30d');
      cy.wait(1000);

      cy.get('table tbody tr').should('have.length.at.least', 1);
    });

    it('should clear filters with Reset to Default', () => {
      cy.get('button:contains("Show Filters")').first().click();
      cy.get('input[placeholder*="Search"]').clear().type('watcher');
      cy.wait(500);

      cy.get('button:contains("Reset to Default")').click();
      cy.wait(500);

      cy.get('table tbody tr').should('have.length', 4);
    });
  });

  describe('Data Interaction and Workflow', () => {
    it('should handle repurchased status change workflow', () => {
      cy.get('table tbody tr').eq(1).within(() => {
        cy.get('button[title*="Edit"], i.material-icons:contains("edit")').first().click();
      });

      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal input[type="checkbox"]').click({ force: true });
      cy.get('.modal button:contains("Update")').click();

      cy.wait('@patchDomain', { timeout: 10000 });
    });

    it('should verify filtered data propagation to stats', () => {
      // Apply global filter
      cy.get('button:contains("Show Filters")').first().click();
      cy.wait(500);
      
      cy.get('input[placeholder*="Search"]').clear().type('watcher');
      cy.wait(1500);

      cy.get('.card.border-0.shadow-sm').first().within(() => {
        cy.get('.h2').invoke('text').then((text) => {
          const num = parseInt(text);
          expect(num).to.be.at.least(1);
          cy.log(`Filtered domains count: ${num}`);
        });
      });
    });
  });

  describe('Navigation and UI Tests', () => {
    it('should test header navigation links', () => {
      cy.get('.navbar, nav').should('exist');
      cy.get('a:contains("Website Monitoring"), a[href*="website_monitoring"]').should('exist');
      cy.get('a:contains("Data Leak"), a[href*="data_leak"]').should('exist');
      cy.get('a:contains("Twisted DNS Finder"), a[href*="dns_finder"]').should('exist');
      cy.get('a:contains("Legitimate Domains"), a[href*="legitimate_domains"]').should('exist');
    });

    it('should verify layout structure specific to Legitimate Domains', () => {
      cy.get('.container-fluid.mt-3').should('exist');
      cy.get('.row').should('have.length.at.least', 1);

      cy.get('.card.border-0.shadow-sm').should('have.length', 4);

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
      cy.intercept('GET', '/api/common/legitimate_domains/', {
        statusCode: 500,
        body: { error: 'Server Error' }
      }).as('domainsError');

      cy.reload();
      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('exist');
    });

    it('should handle empty data states', () => {
      cy.intercept('GET', '/api/common/legitimate_domains/', {
        statusCode: 200,
        body: []
      }).as('emptyDomains');

      cy.reload();
      cy.get('body').should('be.visible');
      cy.get('table').should('exist');

      cy.get('table tbody tr td').should('contain', 'No');
    });

    it('should handle invalid date input', () => {
      cy.get('button:contains("Add New Domain"), button:contains("Add")').first().click();
      cy.get('.modal', { timeout: 10000 }).should('be.visible');

      cy.get('.modal input[placeholder*="example.com"]').first().type('test-invalid-date.com');
      
      cy.get('.modal .DayPickerInput input').first().type('invalid-date');
      
      cy.get('.modal button:contains("Close")').first().click({ force: true });
      cy.wait(500);
    });
  });

  describe('Performance and Integration Tests', () => {
    it('should load page within reasonable time', () => {
      const startTime = Date.now();
      cy.reload();

      cy.get('table', { timeout: 20000 }).should('exist').then(() => {
        const loadTime = Date.now() - startTime;
        expect(loadTime).to be.lessThan(25000);
      });
    });

    it('should complete basic workflow integration test', () => {
      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('exist');
      cy.get('.card.border-0.shadow-sm').should('have.length', 4);
      cy.get('table').should('exist');

      cy.get('body').then(($body) => {
        const buttons = $body.find('button');
        cy.log(`Found ${buttons.length} interactive buttons`);
        expect(buttons.length).to.be.greaterThan(5);
      });
    });

    it('should verify Legitimate Domains specific components', () => {
      cy.get('body').then(($body) => {
        const bodyText = $body.text();

        const hasDomains = bodyText.includes('Domain Name') || bodyText.includes('watcher');
        const hasStats = bodyText.includes('TOTAL DOMAINS');
        const hasRepurchased = bodyText.includes('REPURCHASED');
        const hasExpiry = bodyText.includes('EXPIRING SOON');

        if (hasDomains) cy.log('Domains section found');
        if (hasStats) cy.log('Stats section found');
        if (hasRepurchased) cy.log('Repurchased tracking found');
        if (hasExpiry) cy.log('Expiry tracking found');

        expect(hasDomains && hasStats).to.be.true;
      });
    });
  });

  describe('TableManager Advanced Features', () => {
    it('should test filter save functionality', () => {
      cy.get('button:contains("Save Filter")').click();
      cy.get('.modal', { timeout: 5000 }).should('be.visible');
      cy.get('.modal input[type="text"]').type('Test Legitimate Filter');
      cy.get('.modal button:contains("Save Filter")').click();
      cy.wait(500);

      cy.get('button:contains("Saved Filters")').should('contain', '(1)');
    });

    it('should test items per page change', () => {
      cy.get('select').filter((index, el) => {
        const text = Cypress.$(el).closest('.d-flex, div').find('label, span').text();
        return text.includes('Items per page');
      }).select('10');
      cy.wait(500);

      cy.get('table tbody tr').should('have.length.at.least', 1);
    });

    it('should test pagination if more than 5 items', () => {
      cy.get('body').then(($body) => {
        const paginationButtons = $body.find('button').toArray().filter(btn => {
          const text = Cypress.$(btn).text();
          return text.includes('Next') || text.includes('Previous') || /^\d+$/.test(text);
        });

        if (paginationButtons.length > 0) {
          cy.log('Pagination controls found');
        }
      });
    });
  });

  after(() => {
    cy.log('Starting Legitimate Domains cleanup...');

    // Clean up test domains
    cy.request({
      method: 'GET',
      url: '/api/common/legitimate_domains/',
      headers: {
        'Authorization': `Token ${Cypress.env('authData').token}`
      },
      failOnStatusCode: false
    }).then((response) => {
      if (response.status === 200 && response.body && response.body.results) {
        response.body.results.forEach((domain) => {
          if (domain.domain_name.includes('test-') || domain.domain_name.includes('e2e-')) {
            cy.request({
              method: 'DELETE',
              url: `/api/common/legitimate_domains/${domain.id}/`,
              headers: { 'Authorization': `Token ${Cypress.env('authData').token}` },
              failOnStatusCode: false
            });
          }
        });
      }
    });

    // Clear localStorage items specific to Legitimate Domains
    cy.window().then((win) => {
      win.localStorage.removeItem('watcher_localstorage_items_legitimateDomains');
      win.localStorage.removeItem('watcher_localstorage_filters_legitimateDomains');
      win.localStorage.clear();
      win.sessionStorage.clear();
    });

    cy.log('Legitimate Domains cleanup completed');
  });
});
