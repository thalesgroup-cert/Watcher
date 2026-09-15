describe('DNS Finder - E2E Test Suite', () => {
  const setupIntercepts = () => {
    cy.intercept('GET', '**/api/dns_finder/dns_monitored/**', {
      statusCode: 200,
      body: {
        count: 3,
        next: null,
        previous: null,
        results: [
          {
            id: 1, domain_name: "watcher.com", created_at: "2025-06-19T10:00:00Z",
            last_event: {
              username: "admin",
              first_name: "Admin",
              last_name: "User",
              avatar_color: "#2196f3",
              action: "updated",
              timestamp: "2026-06-24T14:30:00Z"
            }
          },
          { id: 2, domain_name: "watcher.fr", created_at: "2025-06-18T15:30:00Z", last_event: null },
          { id: 3, domain_name: "watcher.org", created_at: "2025-06-17T08:15:00Z", last_event: null }
        ]
      }
    }).as('getDnsMonitored');

    cy.intercept('GET', '**/api/dns_finder/keyword_monitored/**', {
      statusCode: 200,
      body: {
        count: 3,
        next: null,
        previous: null,
        results: [
          {
            id: 1, name: "watcher", created_at: "2025-06-19T10:00:00Z",
            last_event: {
              username: "admin",
              first_name: "Admin",
              last_name: "User",
              avatar_color: "#2196f3",
              action: "created",
              timestamp: "2026-06-24T10:00:00Z"
            }
          },
          { id: 2, name: "threat-intel", created_at: "2025-06-18T15:30:00Z", last_event: null },
          { id: 3, name: "security-corp", created_at: "2025-06-17T08:15:00Z", last_event: null }
        ]
      }
    }).as('getKeywordMonitored');

    // Unified DNS Threats Monitored table (replaces the old alert/dangling_alert panel listings).
    // One row per source so filtering-by-source and the source-specific action sets can be exercised.
    cy.intercept('GET', '**/api/dns_finder/threats_monitored/**', {
      statusCode: 200,
      body: {
        count: 3,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            source: "dnstwist",
            domain_name: "vvatcher.com",
            status_tag: "active",
            corporate_keyword: null,
            corporate_dns: "watcher.com",
            created_at: "2025-06-19T14:30:00Z",
            misp_event_uuid: "['550e8400-e29b-41d4-a716-446655440000']",
            technical_details: {
              fuzzer: "homoglyph",
              corporate_dns: "watcher.com",
              detected_at: "2025-06-19T14:30:00Z"
            }
          },
          {
            id: 2,
            source: "certstream_keyword",
            domain_name: "watcher-threat.com",
            status_tag: "archived",
            corporate_keyword: "watcher",
            corporate_dns: null,
            created_at: "2025-06-18T16:45:00Z",
            misp_event_uuid: null,
            technical_details: {
              corporate_keyword: "watcher",
              issuer: "Let's Encrypt",
              san_list: ["watcher-threat.com", "www.watcher-threat.com"],
              not_before: "2025-06-18T00:00:00Z",
              not_after: "2025-09-18T00:00:00Z",
              serial_number: "0x1234",
              fingerprint_sha256: "AA:BB:CC:DD"
            }
          },
          {
            id: 3,
            source: "subdomain_takeover",
            domain_name: "old.watcher.com",
            status_tag: "dangling_confirmed",
            corporate_keyword: null,
            corporate_dns: "watcher.com",
            created_at: "2025-06-17T08:15:00Z",
            misp_event_uuid: null,
            technical_details: {
              provider: "Amazon S3",
              cname_target: "mybucket.s3.amazonaws.com",
              http_status_code: 404,
              last_checked_at: "2025-06-20T10:00:00Z",
              corporate_dns: "watcher.com",
              dangling_subdomain_id: 501
            }
          }
        ]
      }
    }).as('getThreatsMonitored');

    // Dangling subdomains for one Corporate DNS Asset, opened from DnsMonitored's per-row modal.
    cy.intercept('GET', '**/api/dns_finder/dns_monitored/*/dangling_subdomains/**', {
      statusCode: 200,
      body: [
        {
          id: 1,
          subdomain: "old.watcher.com",
          provider: "Amazon S3",
          cname_target: "mybucket.s3.amazonaws.com",
          status: "dangling_confirmed",
          discovered_at: "2025-06-19T10:00:00Z",
          last_checked_at: "2025-06-20T10:00:00Z",
          http_status_code: 404
        }
      ]
    }).as('getDnsMonitoredDanglingSubdomains');

    cy.intercept('PATCH', '**/api/dns_finder/dangling_subdomain/**', (req) => ({
      statusCode: 200,
      body: { id: parseInt(req.url.split('/').pop()), subdomain: "old.watcher.com", ...req.body }
    })).as('patchDanglingSubdomain');

    // Statistics panel + supporting "all pages" fetches used by DnsFinderStats.
    cy.intercept('GET', '**/api/dns_finder/dns_monitored/statistics/**', {
      statusCode: 200,
      body: {
        totalAlerts: 3, newToday: 0, newThisWeek: 3, totalDnsMonitored: 3, totalKeywords: 3,
        totalDanglingSubdomains: 1, totalDanglingConfirmed: 1, totalDanglingSuspected: 0
      }
    }).as('getDnsFinderStatistics');

    cy.intercept('GET', '**/api/dns_finder/alert/**', {
      statusCode: 200,
      body: { count: 0, next: null, previous: null, results: [] }
    }).as('getAlerts');

    cy.intercept('GET', '**/api/site_monitoring/site/**', {
      statusCode: 200,
      body: { count: 0, next: null, previous: null, results: [] }
    }).as('getSites');

    // Mock CRUD operations
    cy.intercept('POST', '**/api/dns_finder/dns_monitored/**', (req) => ({
      statusCode: 201,
      body: { id: Date.now(), ...req.body, created_at: new Date().toISOString() }
    })).as('addDnsMonitored');

    cy.intercept('POST', '**/api/dns_finder/keyword_monitored/**', (req) => ({
      statusCode: 201,
      body: { id: Date.now(), ...req.body, created_at: new Date().toISOString() }
    })).as('addKeywordMonitored');

    cy.intercept('DELETE', '**/api/dns_finder/dns_monitored/**', { statusCode: 204 }).as('deleteDnsMonitored');
    cy.intercept('DELETE', '**/api/dns_finder/keyword_monitored/**', { statusCode: 204 }).as('deleteKeywordMonitored');

    cy.intercept('PATCH', '**/api/dns_finder/dns_monitored/**', (req) => ({
      statusCode: 200,
      body: { id: parseInt(req.url.split('/').pop()), ...req.body }
    })).as('patchDnsMonitored');

    cy.intercept('PATCH', '**/api/dns_finder/keyword_monitored/**', (req) => ({
      statusCode: 200,
      body: { id: parseInt(req.url.split('/').pop()), ...req.body }
    })).as('patchKeywordMonitored');

    cy.intercept('PATCH', '**/api/dns_finder/alert/**', (req) => ({
      statusCode: 200,
      body: { id: parseInt(req.url.split('/').pop()), ...req.body }
    })).as('updateAlertStatus');

    cy.intercept('POST', '**/api/dns_finder/misp/**', {
      statusCode: 200,
      body: { message: 'Successfully exported to MISP', event_uuid: '550e8400-e29b-41d4-a716-446655440003' }
    }).as('exportToMISP');
  };

  before(() => {
    const credentials = Cypress.env('testCredentials');

    setupIntercepts();

    // Mock auth endpoints
    cy.intercept('GET', '**/api/auth/user/', {
      statusCode: 200,
      body: {
        id: 1,
        username: credentials.username,
        first_name: credentials.firstName,
        email: credentials.email,
        is_superuser: true
      }
    }).as('getUser');

    cy.intercept('POST', '**/api/auth/login/', {
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
    cy.wait('@getThreatsMonitored', { timeout: 15000 });

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
      cy.get('.container-fluid', { timeout: 15000 }).should('exist');

      cy.contains('.card-header', 'Statistics', { timeout: 15000 }).should('exist');
      cy.contains('.card-header', 'DNS Threats Monitored').should('exist');
      cy.contains('.card-header', 'Corporate DNS Assets Monitored').should('exist');
      cy.contains('.card-header', 'Corporate Keywords Monitored').should('exist');
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

      cy.visit('/#/');
      cy.url().should('include', '#/');

      cy.visit('/#/dns_finder');
      cy.url().should('include', '/dns_finder');

      cy.get('.navbar').should('exist');
    });
  });

  describe('DNS Monitored Display and Management', () => {
    it('should display DNS monitored table in ResizableContainer', () => {
      cy.contains('.card-header', 'Corporate DNS Assets Monitored').closest('.card.h-100.shadow-sm')
        .within(() => {
          cy.get('h4:contains("Corporate DNS")', { timeout: 10000 }).should('exist');
          cy.get('h6:contains("Dnstwist Algorithm & Subdomain Takeover Detection")', { timeout: 10000 }).should('exist');
          cy.get('table', { timeout: 10000 }).should('exist');
        });
    });

    it('should display DNS monitored data when available', () => {
      cy.contains('.card-header', 'Corporate DNS Assets Monitored').closest('.card.h-100.shadow-sm')
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
      cy.contains('.card-header', 'Corporate DNS Assets Monitored').closest('.card.h-100.shadow-sm')
        .within(() => {
          cy.get('.material-icons:contains("edit")').should('exist');
          cy.get('.material-icons:contains("delete")').should('exist');
        });
    });

    it('should handle DNS edit workflow', () => {
      cy.contains('.card-header', 'Corporate DNS Assets Monitored').closest('.card.h-100.shadow-sm')
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
      cy.contains('.card-header', 'Corporate DNS Assets Monitored').closest('.card.h-100.shadow-sm')
        .find('.material-icons:contains("delete")')
        .first()
        .click();

      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('contain', 'Action Requested');
      cy.get('.modal-body').should('contain', 'delete');
      cy.get('button:contains("Close")').first().click();
    });

    it('should sort DNS monitored table', () => {
      cy.contains('.card-header', 'Corporate DNS Assets Monitored').closest('.card.h-100.shadow-sm')
        .within(() => {
          cy.get('table th:contains("Domain Name")').click();
          cy.wait(500);
          cy.get('table th:contains("Domain Name")').click();
          cy.wait(500);
        });
    });

    it('should open the Dangling Subdomains modal for a Corporate DNS Asset', () => {
      cy.contains('.card-header', 'Corporate DNS Assets Monitored').closest('.card.h-100.shadow-sm')
        .find('button[title="View Dangling Subdomains"]')
        .first()
        .click();

      cy.wait('@getDnsMonitoredDanglingSubdomains', { timeout: 10000 });
      cy.contains('Dangling Subdomains for').should('be.visible');
      cy.get('.modal').within(() => {
        cy.get('table tbody tr').should('have.length.at.least', 1);
        cy.get('tbody').should('contain', 'old.watcher.com');
        cy.get('tbody').should('contain', 'Amazon S3');
        cy.contains('button', 'Close').click();
      });
    });
  });

  describe('Keyword Monitored Display and Management', () => {
    it('should display keyword monitored table in ResizableContainer', () => {
      cy.contains('.card-header', 'Corporate Keywords Monitored').closest('.card.h-100.shadow-sm')
        .within(() => {
          cy.get('h4:contains("Corporate Keywords")', { timeout: 10000 }).should('exist');
          cy.get('h6:contains("Certificate Transparency")', { timeout: 10000 }).should('exist');
          cy.get('table', { timeout: 10000 }).should('exist');
        });
    });

    it('should display keyword monitored data when available', () => {
      cy.contains('.card-header', 'Corporate Keywords Monitored').closest('.card.h-100.shadow-sm')
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
      cy.contains('.card-header', 'Corporate Keywords Monitored').closest('.card.h-100.shadow-sm')
        .within(() => {
          cy.get('.material-icons:contains("edit")').should('exist');
          cy.get('.material-icons:contains("delete")').should('exist');
        });
    });

    it('should handle keyword edit workflow', () => {
      cy.contains('.card-header', 'Corporate Keywords Monitored').closest('.card.h-100.shadow-sm')
        .find('.material-icons:contains("edit")')
        .first()
        .scrollIntoView()
        .click({ force: true });

      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('exist');
      cy.get('button:contains("Close")').first().click();
    });

    it('should handle keyword deletion workflow', () => {
      cy.contains('.card-header', 'Corporate Keywords Monitored').closest('.card.h-100.shadow-sm')
        .find('.material-icons:contains("delete")')
        .first()
        .click();

      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('contain', 'Action Requested');
      cy.get('.modal-body').should('contain', 'delete');
      cy.get('button:contains("Close")').first().click();
    });

    it('should sort keyword monitored table', () => {
      cy.contains('.card-header', 'Corporate Keywords Monitored').closest('.card.h-100.shadow-sm')
        .within(() => {
          cy.get('table th:contains("Name")').click();
          cy.wait(500);
        });
    });
  });

  describe('DNS Threats Monitored (unified) Display and Management', () => {
    it('should display the unified threats table in ResizableContainer with all three sources selectable', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .within(() => {
          cy.get('h4:contains("DNS Threats Monitored")', { timeout: 10000 }).should('exist');
          cy.get('table', { timeout: 10000 }).should('exist');
          cy.get('table thead th').should('contain', 'Domain Name');
          cy.get('table thead th').should('contain', 'Source');
          cy.get('table thead th').should('contain', 'Corporate Keyword');
          cy.get('table thead th').should('contain', 'Corporate DNS');
          cy.get('table thead th').should('contain', 'Created At');
        });

      cy.contains('button', 'Show Filters').click();
      cy.contains('label', 'Source').parent().find('select').as('sourceSelect');
      cy.get('@sourceSelect').find('option').should('contain.text', 'Dnstwist Algorithm');
      cy.get('@sourceSelect').find('option').should('contain.text', 'Certificate Transparency Stream');
      cy.get('@sourceSelect').find('option').should('contain.text', 'Subdomain Takeover Detection');
      cy.contains('button', 'Hide Filters').click();
    });

    it('should display each source with its badge and status tag', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .within(() => {
          cy.get('tbody').should('contain', 'vvatcher.com');
          cy.get('tbody').should('contain', 'watcher-threat.com');
          cy.get('tbody').should('contain', 'old.watcher.com');

          cy.get('tbody').should('contain', 'Dnstwist Algorithm');
          cy.get('tbody').should('contain', 'Certificate Transparency Stream');
          cy.get('tbody').should('contain', 'Subdomain Takeover Detection');

          cy.get('tbody').should('contain', 'Active');
          cy.get('tbody').should('contain', 'Archived');
        });
    });

    it('should display MISP export and Technical Details buttons on every row', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .find('table tbody tr')
        .each($row => {
          cy.wrap($row).find('button[title="Technical Details"]').should('exist');
          cy.wrap($row).find('button[title="Export"]').should('exist');
        });
    });

    it('should only show Monitor/Disable actions on dnstwist and certstream rows, not on subdomain takeover rows', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .within(() => {
          cy.contains('table tbody tr', 'vvatcher.com').within(() => {
            cy.get('button:contains("Disable"), button:contains("Enable")').should('exist');
            cy.get('button[title="Mark Resolved"]').should('not.exist');
          });

          cy.contains('table tbody tr', 'old.watcher.com').within(() => {
            cy.get('button:contains("Disable"), button:contains("Enable")').should('not.exist');
            cy.get('button[title="Mark Resolved"]').should('exist');
            cy.get('button[title="Mark False Positive"]').should('exist');
            cy.get('button[title="Re-check"]').should('exist');
            cy.get('button[title="History"]').should('exist');
          });
        });
    });

    it('should open the Technical Details modal for a dnstwist row', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', 'vvatcher.com')
        .find('button[title="Technical Details"]')
        .click();

      cy.contains('Technical details for').should('be.visible');
      cy.get('.modal').within(() => {
        cy.contains('Fuzzer').should('exist');
        cy.contains('homoglyph').should('exist');
        cy.contains('button', 'Close').click();
      });
    });

    it('should open the Technical Details modal for a subdomain takeover row', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', 'old.watcher.com')
        .find('button[title="Technical Details"]')
        .click();

      cy.contains('Technical details for').should('be.visible');
      cy.get('.modal').within(() => {
        cy.contains('Provider').should('exist');
        cy.contains('Amazon S3').should('exist');
        cy.contains('button', 'Close').click();
      });
    });

    it('should handle alert disable workflow on a dnstwist row', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', 'vvatcher.com')
        .find('button:contains("Disable")')
        .click();

      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('contain', 'Action Requested');
      cy.get('.modal-body').should('contain', 'disable');
      cy.get('button:contains("Close")').first().click();
    });

    it('should handle alert enable workflow on an archived certstream row', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', 'watcher-threat.com')
        .find('button:contains("Enable")')
        .click();

      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('contain', 'Action Requested');
      cy.get('.modal-body').should('contain', 'enable');
      cy.get('button:contains("Close")').first().click();
    });

    it('should handle the "Monitor this domain" workflow on a dnstwist row', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', 'vvatcher.com')
        .find('button[title*="Monitor"]')
        .click();

      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('contain', 'Action Requested');
      cy.get('.modal-body').should('contain', 'vvatcher.com');
      cy.get('button:contains("Close")').first().click();
    });

    it('should handle the mark-resolved workflow on a subdomain takeover row', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', 'old.watcher.com')
        .find('button[title="Mark Resolved"]')
        .click();

      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('contain', 'Action Requested');
      cy.get('.modal-body').should('contain', 'Resolved');
      cy.get('.modal button:contains("Yes")').click();
      cy.wait('@patchDanglingSubdomain', { timeout: 10000 });
    });

    it('should sort the unified threats table', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .within(() => {
          cy.get('table th:contains("Domain Name")').click();
          cy.wait(500);
        });
    });

    it('should filter the table down to a single source via the Source dropdown', () => {
      cy.contains('button', 'Show Filters').click();

      cy.contains('label', 'Source').parent().find('select').select('subdomain_takeover');
      cy.wait(300);

      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .within(() => {
          cy.get('table tbody tr').each($row => {
            cy.wrap($row).find('td').eq(1).invoke('text').then(text => {
              if (!text.includes('No results found')) {
                expect(text).to.contain('Subdomain Takeover Detection');
              }
            });
          });
        });

      // Reset the filter so it doesn't leak into subsequent tests.
      cy.contains('label', 'Source').parent().find('select').select('');
      cy.contains('button', 'Hide Filters').click();
    });
  });

  describe('ResizableContainer Functionality', () => {
    it('should display ResizableContainer dividers', () => {
      cy.get('.card.h-100.shadow-sm', { timeout: 10000 })
        .should('have.length.at.least', 2);

      cy.get('.card.h-100.shadow-sm').each(($card) => {
        cy.wrap($card).then(($el) => {
          cy.log(`Panel card found with ${$el.find('table').length} tables`);
        });
      });
    });

    it('should handle divider double-click to reset', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm').should('exist').then(() => {
        cy.log('DNS Threats Monitored panel found - PanelGrid layout verified');
      });
      cy.contains('.card-header', 'Corporate DNS Assets Monitored').closest('.card.h-100.shadow-sm').should('exist').then(() => {
        cy.log('Corporate DNS Assets Monitored panel found - PanelGrid layout verified');
      });
    });

    it('should show tooltip on divider hover', () => {
      cy.get('.card.h-100.shadow-sm [title="Hide DNS Threats Monitored"]').should('exist');
      cy.get('.card.h-100.shadow-sm [title="Hide Corporate DNS Assets Monitored"]').should('exist');
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
      // Disable the active dnstwist row
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', 'vvatcher.com')
        .find('button:contains("Disable")')
        .click();

      cy.get('.modal button:contains("Yes")').click();
      cy.wait('@updateAlertStatus', { timeout: 10000 });

      cy.wait(1000);

      // Enable the archived certstream row
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', 'watcher-threat.com')
        .find('button:contains("Enable")')
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
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .find('table tbody tr')
        .should('have.length.at.least', 1);

      cy.get('input[placeholder*="Search"]').clear();
      cy.contains('button', 'Hide Filters').click();
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
      cy.get('.container-fluid').should('exist');
      cy.get('.row').should('have.length.at.least', 1);

      cy.get('.card.h-100.shadow-sm', { timeout: 10000 })
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
      cy.intercept('GET', '**/api/dns_finder/dns_monitored/**', {
        statusCode: 500,
        body: { error: 'Server Error' }
      }).as('dnsError');

      cy.intercept('GET', '**/api/dns_finder/keyword_monitored/**', {
        statusCode: 500,
        body: { error: 'Server Error' }
      }).as('keywordError');

      cy.intercept('GET', '**/api/dns_finder/threats_monitored/**', {
        statusCode: 500,
        body: { error: 'Server Error' }
      }).as('threatsError');

      cy.reload();
      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('exist');
    });

    it('should handle empty data states', () => {
      cy.intercept('GET', '**/api/dns_finder/dns_monitored/**', {
        statusCode: 200,
        body: { count: 0, next: null, previous: null, results: [] }
      }).as('emptyDns');

      cy.intercept('GET', '**/api/dns_finder/keyword_monitored/**', {
        statusCode: 200,
        body: { count: 0, next: null, previous: null, results: [] }
      }).as('emptyKeywords');

      cy.intercept('GET', '**/api/dns_finder/threats_monitored/**', {
        statusCode: 200,
        body: { count: 0, next: null, previous: null, results: [] }
      }).as('emptyThreats');

      cy.reload();
      cy.wait(['@emptyDns', '@emptyKeywords', '@emptyThreats']);

      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('exist');

      cy.get('table').should('exist');
      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        const hasEmptyIndicator =
          bodyText.includes('No data') ||
          bodyText.includes('No records') ||
          bodyText.includes('No results found') ||
          bodyText.includes('0 entries') ||
          $body.find('tbody tr').length === 0;

        expect(hasEmptyIndicator).to.be.true;
      });
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

    it('should verify DNS Finder specific components', () => {
      cy.get('body').then(($body) => {
        const bodyText = $body.text();

        const hasDnstwist = bodyText.includes('Dnstwist Algorithm');
        const hasCertTransparency = bodyText.includes('Certificate Transparency');
        const hasSubdomainTakeover = bodyText.includes('Subdomain Takeover Detection');
        const hasKeyword = bodyText.includes('Corporate Keyword');

        if (hasDnstwist) cy.log('Dnstwist Algorithm source found');
        if (hasCertTransparency) cy.log('Certificate Transparency source found');
        if (hasSubdomainTakeover) cy.log('Subdomain Takeover Detection source found');
        if (hasKeyword) cy.log('Corporate Keyword data found');

        expect(hasDnstwist || hasCertTransparency || hasSubdomainTakeover).to.be.true;
      });
    });

    it('should verify all major components are loaded', () => {
      cy.get('.container-fluid').should('exist');
      cy.get('.card.h-100.shadow-sm').should('have.length.at.least', 2);
      cy.get('table').should('have.length.at.least', 2);
      cy.get('h4:contains("DNS Threats Monitored")').should('exist');
      cy.get('h4:contains("Corporate DNS")').should('exist');
      cy.get('h4:contains("Corporate Keywords")').should('exist');
    });
  });

  after(() => {
    cy.log('Starting DNS Finder cleanup...');

    const authData = Cypress.env('authData');
    if (authData && authData.token) {
      // Clean up test DNS entries
      cy.request({
        method: 'GET',
        url: '/api/dns_finder/dns_monitored/',
        headers: {
          'Authorization': `Token ${authData.token}`
        },
        failOnStatusCode: false
      }).then((response) => {
        if (response.status === 200 && response.body && response.body.results) {
          response.body.results.forEach((dns) => {
            if (dns.domain_name.includes('test-') || dns.domain_name.includes('e2e-')) {
              cy.request({
                method: 'DELETE',
                url: `/api/dns_finder/dns_monitored/${dns.id}/`,
                headers: { 'Authorization': `Token ${authData.token}` },
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
          'Authorization': `Token ${authData.token}`
        },
        failOnStatusCode: false
      }).then((response) => {
        if (response.status === 200 && response.body && response.body.results) {
          response.body.results.forEach((keyword) => {
            if (keyword.name.includes('test-') || keyword.name.includes('e2e-')) {
              cy.request({
                method: 'DELETE',
                url: `/api/dns_finder/keyword_monitored/${keyword.id}/`,
                headers: { 'Authorization': `Token ${authData.token}` },
                failOnStatusCode: false
              });
            }
          });
        }
      });
    } else {
      cy.log('No auth token available - skipping cleanup');
    }

    // Reset DB-stored preferences
    if (authData && authData.token) {
      cy.request({
        method: 'PATCH',
        url: '/api/auth/profile',
        headers: { 'Authorization': `Token ${authData.token}` },
        body: { preferences: {} },
        failOnStatusCode: false
      });
    }

    // Clear ephemeral localStorage/sessionStorage
    cy.window().then((win) => {
      win.localStorage.clear();
      win.sessionStorage.clear();
    });

    cy.log('DNS Finder cleanup completed');
  });
});
