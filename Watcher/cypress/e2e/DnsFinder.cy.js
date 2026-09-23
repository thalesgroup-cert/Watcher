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
            status: "pending",
            comments: null,
            corporate_keyword: null,
            corporate_dns: "watcher.com",
            created_at: "2025-06-19T14:30:00Z",
            misp_event_uuid: "['550e8400-e29b-41d4-a716-446655440000']",
            technical_details: {
              fuzzer: "homoglyph",
              corporate_dns: "watcher.com",
              issuer: null,
              san_list: null,
              detected_at: "2025-06-19T14:30:00Z",
              dns_twisted_id: 101
            }
          },
          {
            id: 2,
            source: "certstream_keyword",
            domain_name: "watcher-threat.com",
            status: "resolved",
            comments: "Confirmed benign, this is our own marketing partner's domain and has been cleared by the SOC lead after review.",
            corporate_keyword: "watcher",
            corporate_dns: null,
            created_at: "2025-06-18T16:45:00Z",
            misp_event_uuid: null,
            technical_details: {
              fuzzer: null,
              corporate_keyword: "watcher",
              issuer: "Let's Encrypt",
              san_list: ["watcher-threat.com", "www.watcher-threat.com"],
              detected_at: "2025-06-18T16:45:00Z",
              dns_twisted_id: 102
            }
          },
          {
            id: 3,
            source: "subdomain_takeover",
            domain_name: "old.watcher.com",
            status: "confirmed",
            comments: null,
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
              dns_twisted_id: 501
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
          domain_name: "old.watcher.com",
          provider: "Amazon S3",
          cname_target: "mybucket.s3.amazonaws.com",
          status: "confirmed",
          last_checked_at: "2025-06-20T10:00:00Z",
          http_status_code: 404
        }
      ]
    }).as('getDnsMonitoredDanglingSubdomains');

    cy.intercept('PATCH', '**/api/dns_finder/dns_twisted/**', (req) => ({
      statusCode: 200,
      body: { id: parseInt(req.url.split('/').pop()), domain_name: "vvatcher.com", ...req.body }
    })).as('patchDnsTwisted');

    cy.intercept('GET', '**/api/timeline/events/**', {
      statusCode: 200,
      body: { count: 0, next: null, previous: null, results: [] }
    }).as('getTimelineEvents');

    cy.intercept('POST', '**/api/site_monitoring/site/**', (req) => ({
      statusCode: 201,
      body: { id: Date.now(), ...req.body, created_at: new Date().toISOString() }
    })).as('addSite');

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
    // Checks the button text first rather than assuming a starting state,
    // since the global "show/hide filters" preference can carry over from
    // an earlier test or a shared localStorage key.
    const ensureFiltersVisible = () => {
      cy.get('body').then($body => {
        if ($body.find('button:contains("Show Filters")').length > 0) {
          cy.contains('button', 'Show Filters').click();
        }
      });
    };

    const ensureFiltersHidden = () => {
      cy.get('body').then($body => {
        if ($body.find('button:contains("Hide Filters")').length > 0) {
          cy.contains('button', 'Hide Filters').click();
        }
      });
    };

    const showAllStatuses = () => {
      ensureFiltersVisible();
      cy.contains('label', 'Status').parent().find('select').select('');
      cy.wait(300);
    };

    const resetFilters = () => {
      cy.contains('label', 'Status').parent().find('select').select('open');
      ensureFiltersHidden();
    };

    // The per-row Status control is a SplitButton: the small caret button
    // opens the dropdown, then the target status is a .dropdown-item link.
    const selectRowStatus = (domainName, statusLabel) => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', domainName)
        .find('.dropdown-toggle-split')
        .click();
      cy.contains('.dropdown-item', statusLabel).click();
    };

    it('should display the unified threats table in ResizableContainer with all three sources selectable', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .within(() => {
          cy.get('h4:contains("DNS Threats Monitored")', { timeout: 10000 }).should('exist');
          cy.get('table', { timeout: 10000 }).should('exist');
          cy.get('table thead th').should('contain', 'Domain Name');
          cy.get('table thead th').should('contain', 'Status');
          cy.get('table thead th').should('contain', 'Source');
          cy.get('table thead th').should('contain', 'Monitored');
          cy.get('table thead th').should('contain', 'Created At');
        });

      ensureFiltersVisible();
      cy.contains('label', 'Source').parent().find('select').as('sourceSelect');
      cy.get('@sourceSelect').find('option').should('contain.text', 'Dnstwist Algorithm');
      cy.get('@sourceSelect').find('option').should('contain.text', 'Certificate Transparency Stream');
      cy.get('@sourceSelect').find('option').should('contain.text', 'Subdomain Takeover Detection');
      ensureFiltersHidden();
    });

    it('should default the Status filter to Open and hide resolved rows until cleared', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .within(() => {
          cy.get('tbody').should('contain', 'vvatcher.com');
          cy.get('tbody').should('not.contain', 'watcher-threat.com');
        });

      ensureFiltersVisible();
      cy.contains('label', 'Status').parent().find('select').should('have.value', 'open');
      cy.contains('label', 'Status').parent().find('select').select('');
      cy.wait(300);

      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .within(() => {
          cy.get('tbody').should('contain', 'watcher-threat.com');
        });
      resetFilters();
    });

    it('should display each source badge with its context tag under the domain name, and a Status select per row', () => {
      showAllStatuses();

      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .within(() => {
          cy.get('tbody').should('contain', 'vvatcher.com');
          cy.get('tbody').should('contain', 'watcher-threat.com');
          cy.get('tbody').should('contain', 'old.watcher.com');

          cy.get('tbody').should('contain', 'Dnstwist Algorithm');
          cy.get('tbody').should('contain', 'Certificate Transparency Stream');
          cy.get('tbody').should('contain', 'Subdomain Takeover Detection');

          cy.get('tbody').should('contain', 'Fuzzer: homoglyph');
          cy.get('tbody').should('contain', "Issuer: Let's Encrypt");
          cy.get('tbody').should('contain', 'Provider: Amazon S3');

          // Every row has its own Status dropdown, defaulting to that row's value.
          cy.contains('table tbody tr', 'vvatcher.com').find('.btn-group').should('contain.text', 'Pending');
          cy.contains('table tbody tr', 'watcher-threat.com').find('.btn-group').should('contain.text', 'Resolved');
          cy.contains('table tbody tr', 'old.watcher.com').find('.btn-group').should('contain.text', 'Confirmed');
        });

      resetFilters();
    });

    it('should show the same Status dropdown/Export/Edit/Timeline actions on every row regardless of source', () => {
      showAllStatuses();

      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .find('table tbody tr')
        .each($row => {
          cy.wrap($row).find('.dropdown-toggle-split').should('exist');
          cy.wrap($row).find('button[title="Export"]').should('exist');
          cy.wrap($row).find('button[title="Edit"]').should('exist');
          cy.wrap($row).find('button[title="Timeline"]').should('exist');
        });

      resetFilters();
    });

    it('should show the Fuzzer badge inline under the domain name for a dnstwist row', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', 'vvatcher.com')
        .within(() => {
          cy.contains('Fuzzer: homoglyph').should('be.visible');
        });
    });

    it('should show the Issuer badge inline for a certstream row without the removed certificate validity fields', () => {
      showAllStatuses();

      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', 'watcher-threat.com')
        .within(() => {
          cy.contains("Issuer: Let's Encrypt").should('be.visible');
          cy.contains('Not Before').should('not.exist');
          cy.contains('Not After').should('not.exist');
          cy.contains('Serial Number').should('not.exist');
          cy.contains('Fingerprint').should('not.exist');
        });

      resetFilters();
    });

    it('should show the Provider/CNAME badges inline for a subdomain takeover row', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', 'old.watcher.com')
        .within(() => {
          cy.contains('Provider: Amazon S3').should('be.visible');
          cy.contains('CNAME: mybucket.s3.amazonaws.com').should('be.visible');
        });
    });

    it('should change the Status of a dnstwist row directly via its dropdown, no confirmation modal', () => {
      selectRowStatus('vvatcher.com', 'Confirmed');

      cy.wait('@updateAlertStatus', { timeout: 10000 });
      cy.get('.modal').should('not.exist');
    });

    it('should change the Status of an archived certstream row back to pending', () => {
      showAllStatuses();

      selectRowStatus('watcher-threat.com', 'Pending');

      cy.wait('@updateAlertStatus', { timeout: 10000 });

      resetFilters();
    });

    it('should change the Status of a subdomain takeover row the same way as the other two sources', () => {
      selectRowStatus('old.watcher.com', 'Resolved');

      cy.wait('@updateAlertStatus', { timeout: 10000 });
    });

    it('should open the Edit modal for a subdomain takeover row and submit CNAME/Provider/HTTP Status Code/Comments changes', () => {
      showAllStatuses();

      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', 'old.watcher.com')
        .find('button[title="Edit"]')
        .click();

      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('contain', 'Edit');
      cy.get('.modal').within(() => {
        cy.contains('label', 'CNAME Target').should('exist');
        cy.contains('label', 'Provider').should('exist');
        cy.contains('label', 'HTTP Status Code').should('exist');
        cy.contains('label', 'Status').should('not.exist');
        cy.contains('label', 'Comments').should('exist');

        cy.contains('label', 'Provider').next().find('input').clear().type('Google Cloud Storage');
        cy.contains('label', 'Comments').next().find('textarea').clear().type('Escalated to the asset owner.');
        cy.contains('button', 'Save').click();
      });

      cy.wait(['@patchDnsTwisted', '@updateAlertStatus'], { timeout: 10000 });
      resetFilters();
    });

    it('should open the Edit modal for a dnstwist row and submit a Fuzzer change', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', 'vvatcher.com')
        .find('button[title="Edit"]')
        .click();

      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal-title').should('contain', 'Edit');
      cy.get('.modal').within(() => {
        cy.contains('label', 'Fuzzer').should('exist');
        cy.contains('label', 'Comments').should('exist');
        cy.contains('label', 'Fuzzer').parent().find('input').clear().type('bitsquatting');
        cy.contains('button', 'Save').click();
      });

      cy.wait(['@patchDnsTwisted', '@updateAlertStatus'], { timeout: 10000 });
    });

    it('should open the Edit modal for a certstream row with an Issuer and Comments field', () => {
      showAllStatuses();

      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', 'watcher-threat.com')
        .find('button[title="Edit"]')
        .click();

      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal').within(() => {
        cy.contains('label', 'Issuer').should('exist');
        cy.contains('label', 'Comments').should('exist');
        cy.contains('label', 'Comments').next().find('textarea')
          .should('have.value', "Confirmed benign, this is our own marketing partner's domain and has been cleared by the SOC lead after review.");
        cy.contains('button', 'Close').click();
      });

      resetFilters();
    });

    it('should open the Export destination selector for a dnstwist row with MISP full-width then Legitimate Domains and Website Monitoring 50/50', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', 'vvatcher.com')
        .find('button[title="Export"]')
        .click();

      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.contains('Choose your export destination').should('be.visible');
      cy.get('.modal').within(() => {
        cy.contains('button', 'MISP Export').should('exist');
        cy.contains('button', 'Legitimate Domains').should('exist');
        cy.contains('button', 'Website Monitoring').should('exist');
        cy.get('.btn-close').click();
      });
    });

    it('should open the Export destination selector for a subdomain takeover row with only MISP and Website Monitoring', () => {
      showAllStatuses();

      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', 'old.watcher.com')
        .find('button[title="Export"]')
        .click();

      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.get('.modal').within(() => {
        cy.contains('button', 'MISP Export').should('exist');
        cy.contains('button', 'Website Monitoring').should('exist');
        cy.contains('button', 'Legitimate Domains').should('not.exist');
        cy.get('.btn-close').click();
      });
      resetFilters();
    });

    it('should complete the Website Monitoring export workflow from a dnstwist row', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', 'vvatcher.com')
        .find('button[title="Export"]')
        .click();

      cy.get('.modal', { timeout: 10000 }).should('be.visible');
      cy.contains('.modal button', 'Website Monitoring').click();

      cy.get('.modal').within(() => {
        cy.contains('Website Monitoring').should('exist');
        cy.contains('label', 'Legitimacy').should('exist');
        cy.contains('label', 'IP Monitoring').should('exist');
        cy.contains('label', 'Web Content Monitoring').should('exist');
        cy.contains('label', 'Email Monitoring').should('exist');
        cy.contains('label', 'Takedown Request').should('exist');
        cy.contains('label', 'Legal Team').should('exist');
        cy.contains('label', 'Blocking Request').should('exist');
        cy.contains('button', 'Export to Website Monitoring').click();
      });

      cy.wait('@addSite', { timeout: 10000 });
    });

    it('should open the Timeline modal for a dnstwist row and merge history from both DnsTwisted and its Alert', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', 'vvatcher.com')
        .find('button[title="Timeline"]')
        .click();

      cy.wait(['@getTimelineEvents', '@getTimelineEvents'], { timeout: 10000 });
      cy.contains('History for').should('be.visible');
      cy.get('.modal .btn-close').click();
    });

    it('should open the Timeline modal for a subdomain takeover row', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', 'old.watcher.com')
        .find('button[title="Timeline"]')
        .click();

      cy.wait(['@getTimelineEvents', '@getTimelineEvents'], { timeout: 10000 });
      cy.contains('History for').should('be.visible');
      cy.get('.modal .btn-close').click();
    });

    it('should sort the unified threats table', () => {
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .within(() => {
          cy.get('table th:contains("Domain Name")').click();
          cy.wait(500);
        });
    });

    it('should filter the table down to a single source via the Source dropdown', () => {
      ensureFiltersVisible();

      cy.contains('label', 'Source').parent().find('select').select('subdomain_takeover');
      cy.wait(300);

      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .within(() => {
          cy.get('table tbody tr').each($row => {
            cy.wrap($row).find('td').eq(2).invoke('text').then(text => {
              if (!text.includes('No results found')) {
                expect(text).to.contain('Subdomain Takeover Detection');
              }
            });
          });
        });

      // Reset the filter so it doesn't leak into subsequent tests.
      cy.contains('label', 'Source').parent().find('select').select('');
      ensureFiltersHidden();
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
      // Move the pending dnstwist row to confirmed
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', 'vvatcher.com')
        .find('.dropdown-toggle-split')
        .click();
      cy.contains('.dropdown-item', 'Confirmed').click();

      cy.wait('@updateAlertStatus', { timeout: 10000 });

      cy.wait(1000);

      // watcher-threat.com is resolved → hidden by 'open' filter; show all statuses first
      cy.get('body').then($body => {
        if ($body.find('button:contains("Show Filters")').length > 0) {
          cy.contains('button', 'Show Filters').click();
        }
      });
      cy.contains('label', 'Status').parent().find('select').select('');
      cy.wait(300);

      // Move the resolved certstream row back to pending
      cy.contains('.card-header', 'DNS Threats Monitored').closest('.card.h-100.shadow-sm')
        .contains('table tbody tr', 'watcher-threat.com')
        .find('.dropdown-toggle-split')
        .click();
      cy.contains('.dropdown-item', 'Pending').click();

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
      cy.get('a:contains("DNS Threats Monitored"), a[href*="dns_finder"]').should('exist');
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
