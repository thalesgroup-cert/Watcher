// DNS threats module: triage (KPI quick filters, filters / sort in the URL, drawer with status changes, edit, export
// to Legitimate Domains, bulk status), watched domains and keywords, Insights. All API calls are mocked.
describe('DNS threats', () => {
  const USER = { id: 1, username: 'analyst', first_name: 'Ana', last_name: 'Lyst', email: '', is_superuser: true, is_staff: false, groups: [], permissions: [] };
  const DNS = '/api/dns_finder/';
  const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString().slice(0, 19);

  const threat = (id, overrides = {}) => ({
    id, source: 'dnstwist', domain_name: `acrne-${id}.com`, corporate_dns: 'acme.com', corporate_keyword: null,
    status: 'pending', comments: null, created_at: ago(id), misp_event_uuid: [], monitored: false, legitimate: false,
    technical_details: { fuzzer: 'homoglyph', issuer: null, san_list: null, provider: null, cname_target: null, http_status_code: null, last_checked_at: null, dns_twisted_id: 100 + id },
    ...overrides,
  });
  const THREATS = [
    threat(1),
    threat(2, {
      source: 'certstream_keyword', domain_name: 'acme-login.net', corporate_dns: null, corporate_keyword: 'acme', status: 'suspected',
      technical_details: { fuzzer: null, issuer: "Let's Encrypt", san_list: ['acme-login.net', 'www.acme-login.net'], provider: null, cname_target: null, http_status_code: null, last_checked_at: null, dns_twisted_id: 102 },
    }),
    threat(3, {
      source: 'subdomain_takeover', domain_name: 'old.acme.com', status: 'confirmed', monitored: true,
      technical_details: { fuzzer: null, issuer: null, san_list: null, provider: 'Amazon S3', cname_target: 'bucket.s3.amazonaws.com', http_status_code: 404, last_checked_at: ago(30), dns_twisted_id: 103 },
    }),
  ];
  const DOMAINS = [{ id: 7, domain_name: 'acme.com', created_at: ago(9000), last_event: null, threats_count: 2, open_threats_count: 2, takeover_count: 1, last_threat_at: ago(1) }];
  const KEYWORDS = [{ id: 8, name: 'acme', created_at: ago(9000), last_event: null, threats_count: 1, open_threats_count: 1, last_threat_at: ago(2) }];
  const STATS = {
    openAlerts: 3, confirmedAlerts: 1, openTakeover: 1, totalAlerts: 3, newToday: 3, newThisWeek: 3, totalDnsMonitored: 1, totalKeywords: 1,
    byStatus: { pending: 1, suspected: 1, confirmed: 1 }, bySource: { dnstwist: 1, certstream_keyword: 1, subdomain_takeover: 1 },
    perDay: Array.from({ length: 30 }, (_, i) => ({ date: new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10), dnstwist: i % 3, certstream_keyword: i % 2, subdomain_takeover: 0 })),
    topIssuers: [{ name: "Let's Encrypt", count: 1 }], topFuzzers: [{ name: 'homoglyph', count: 1 }],
  };
  const page = (results) => ({ count: results.length, next: null, previous: null, results });

  beforeEach(() => {
    cy.on('uncaught:exception', () => false);
    cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: USER });
    cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: 'bootstrap', preferences: {}, avatar_color: null } });
    cy.intercept('GET', `${DNS}threats_monitored/?*`, { statusCode: 200, body: page(THREATS) }).as('threats');
    THREATS.forEach((t) => cy.intercept('GET', `${DNS}threats_monitored/${t.id}/`, { statusCode: 200, body: t }));
    cy.intercept('GET', `${DNS}dns_monitored/?*`, { statusCode: 200, body: page(DOMAINS) }).as('domains');
    cy.intercept('GET', `${DNS}keyword_monitored/?*`, { statusCode: 200, body: page(KEYWORDS) }).as('keywords');
    cy.intercept('GET', `${DNS}dns_monitored/7/`, { statusCode: 200, body: DOMAINS[0] });
    cy.intercept('GET', `${DNS}dns_monitored/statistics/`, { statusCode: 200, body: STATS });
    cy.intercept('GET', '/api/timeline/events/?*', { statusCode: 200, body: [] }).as('history');
    cy.visit('/#/dns_finder', { onBeforeLoad: (win) => win.localStorage.setItem('token', 'mock-token-dns') });
    cy.get('[data-testid="threat-row"]', { timeout: 20000 }).should('have.length', 3);
  });

  describe('threats', () => {
    it('opens on the open threats and describes each one', () => {
      cy.wait('@threats').its('request.url').should('include', 'status=open').and('include', 'page_size=25');
      cy.contains('button', 'Open').should('have.attr', 'aria-pressed', 'true').and('contain', '3');
      cy.get('[data-testid="threat-row"]').eq(0).should('contain', 'homoglyph variant').and('contain', 'Look-alike').and('contain', 'acme.com');
      cy.get('[data-testid="threat-row"]').eq(1).should('contain', "Let's Encrypt - 2 names on the certificate").and('contain', 'Suspected');
      cy.get('[data-testid="threat-row"]').eq(2).should('contain', 'Amazon S3 - CNAME bucket.s3.amazonaws.com').and('contain', 'Takeover risk');
    });

    it('filters from the KPI cards, the toolbar and the column headers, all kept in the URL', () => {
      cy.wait('@threats'); // the request of the first display, so that the next waits are the ones of the filters
      cy.contains('button', 'Takeover risks').click();
      cy.wait('@threats').its('request.url').should('include', 'source=subdomain_takeover').and('include', 'status=open');
      cy.contains('button', 'Clear').click();
      cy.location('hash').should('eq', '#/dns_finder');

      cy.get('input[aria-label="Search threats"]').type('acme');
      cy.wait('@threats').its('request.url').should('include', 'search=acme');
      cy.get('[role="combobox"]').eq(0).click();
      cy.contains('[role="option"]', 'False positive').click();
      cy.wait('@threats').its('request.url').should('include', 'status=false_positive');
      cy.get('[role="combobox"]').eq(2).click();
      cy.contains('[role="option"]', 'acme.com').click();
      cy.wait('@threats').its('request.url').should('include', 'corporate_dns=acme.com');
      cy.location('hash').should('include', 'asset=d%3Aacme.com');
      cy.contains('th [role="button"]', 'Source').click();
      cy.wait('@threats').its('request.url').should('include', 'ordering=source');
    });

    it('opens a threat with its detection details and merged history', () => {
      cy.get('[data-testid="threat-row"]').eq(2).click();
      cy.location('hash').should('include', 'threat=3');
      cy.get('.MuiDrawer-paper').within(() => {
        cy.contains('#threat-drawer-title', 'old.acme.com');
        cy.contains('Subdomain pointing to a resource');
        cy.contains('bucket.s3.amazonaws.com');
        cy.contains('404');
        cy.contains('In Website Monitoring');
        cy.contains('[role="group"][aria-label="Status"] button', 'Confirmed').should('have.attr', 'aria-pressed', 'true');
      });
      // `should` retries until both histories have been asked for.
      cy.get('@history.all').should((calls) => {
        const urls = calls.map((c) => c.request.url).join(' ');
        expect(urls).to.include('content_type=dns_finder.alert').and.include('content_type=dns_finder.dnstwisted');
      });
    });

    it('resolving a threat moves on to the next one', () => {
      cy.intercept('PATCH', `${DNS}alert/1/`, { statusCode: 200, body: {} }).as('status');
      cy.get('[data-testid="threat-row"]').first().click();
      cy.get('.MuiDrawer-paper').contains('[role="group"][aria-label="Status"] button', 'Resolved').click();
      cy.wait('@status').its('request.body').should('deep.equal', { status: 'resolved' });
      cy.location('hash').should('include', 'threat=2');
    });

    it('edits the technical details and the comments', () => {
      cy.intercept('PATCH', `${DNS}dns_twisted/101/`, { statusCode: 200, body: {} }).as('twisted');
      cy.intercept('PATCH', `${DNS}alert/1/`, { statusCode: 200, body: {} }).as('alert');
      cy.get('[data-testid="threat-row"]').first().click();
      cy.get('.MuiDrawer-paper').contains('button', 'Edit').click();
      // The drawer is a dialog too: only the edit form is meant.
      cy.get('[role="dialog"]:not(.MuiDrawer-paper)').within(() => {
        cy.get('input[name="fuzzer"]').clear().type('bitsquatting');
        cy.get('textarea[name="comments"]').type('Parked page');
        cy.contains('button', 'Save').click();
      });
      cy.wait('@twisted').its('request.body').should('deep.equal', { fuzzer: 'bitsquatting' });
      cy.wait('@alert').its('request.body').should('deep.equal', { comments: 'Parked page' });
    });

    it('exports to Legitimate Domains, then resolves the threat', () => {
      cy.intercept('POST', '/api/common/legitimate_domains/', (req) => req.reply({ statusCode: 201, body: { id: 50, ...req.body } })).as('legit');
      cy.intercept('PATCH', `${DNS}alert/1/`, { statusCode: 200, body: {} }).as('status');
      cy.get('[data-testid="threat-row"]').first().click();
      cy.get('.MuiDrawer-paper').contains('button', 'Export').click();
      cy.contains('[role="menuitem"]', 'To Legitimate Domains').click();
      cy.get('[role="dialog"] textarea').first().should('have.value', 'Exported from DNS Threats - Monitored domain: acme.com - homoglyph technique');
      cy.get('[role="dialog"]').contains('button', 'Add to Legitimate Domains').click();
      cy.wait('@legit').its('request.body').should('include', { domain_name: 'acrne-1.com' });
      cy.wait('@status').its('request.body').should('deep.equal', { status: 'resolved' });
    });

    it('offers Website Monitoring only for domains not monitored yet', () => {
      cy.get('[data-testid="threat-row"]').eq(2).click();
      cy.get('.MuiDrawer-paper').contains('button', 'Export').click();
      cy.contains('[role="menuitem"]', 'To Website Monitoring').should('have.attr', 'aria-disabled', 'true').and('contain', 'Already monitored');
    });

    it('sets the status of the selection in bulk', () => {
      cy.intercept('POST', `${DNS}alert/bulk_update/`, {
        statusCode: 200,
        body: { succeeded: 3, skipped: 0, errors: 0, ok_status: 'updated', results: THREATS.map((t) => ({ value: t.domain_name, status: 'updated', reason: '', id: t.id })) },
      }).as('bulk');
      cy.get('input[aria-label="Select the threats of this page"]').check();
      cy.get('[role="region"][aria-label="Selection"]').contains('button', 'Set status').click();
      cy.contains('[role="menuitem"]', 'False positive').click();
      cy.wait('@bulk').its('request.body').should('deep.equal', { ids: [1, 2, 3], changes: { status: 'false_positive' } });
      cy.contains('[role="dialog"]', '3 updated').contains('button', 'Close').click();
    });
  });

  describe('watched assets', () => {
    it('lists the monitored domains with their counters and links one to its takeover risks', () => {
      cy.contains('[role="tab"]', 'Monitored domains').click();
      cy.location('hash').should('include', 'tab=domains');
      cy.get('[data-testid="asset-row"]').first().should('contain', 'acme.com');
      // The requests of the first display: the asset filter of the threats tab, then the list of this tab.
      cy.wait('@domains');
      cy.wait('@domains');
      cy.contains('th [role="button"]', 'Takeover risks').click();
      cy.wait('@domains').its('request.url').should('include', 'ordering=takeover_count');
      cy.get('[data-testid="asset-row"]').first().click();
      cy.location('hash').should('include', 'did=7');
      cy.get('.MuiDrawer-paper').contains('button', 'Show the takeover risks').click();
      cy.location('hash').should('include', 'asset=d%3Aacme.com').and('include', 'source=subdomain_takeover').and('not.include', 'tab=');
    });

    it('adds several keywords at once', () => {
      cy.intercept('POST', `${DNS}keyword_monitored/bulk_create/`, {
        statusCode: 200,
        body: { succeeded: 2, skipped: 0, errors: 0, ok_status: 'created', results: [{ value: 'acme', status: 'created', reason: '', id: 9 }, { value: 'acmecorp', status: 'created', reason: '', id: 10 }] },
      }).as('bulkCreate');
      cy.contains('button', 'Watch more').click();
      cy.contains('[role="menuitem"]', 'Keywords').click();
      cy.location('hash').should('include', 'dialog=add-keyword');
      cy.get('[role="dialog"]').within(() => {
        cy.contains('label', 'Add several, one per line').click();
        cy.get('textarea[name="name"]').type('acme\nacmecorp');
        cy.contains('2 keywords detected');
        cy.contains('button', 'Add 2').click();
      });
      cy.wait('@bulkCreate').its('request.body').should('deep.include', { values: 'acme\nacmecorp', dry_run: false });
      cy.contains('[role="dialog"]', '2 created').contains('button', 'Close').click();
    });
  });

  it('shows the insights and filters the threats from them', () => {
    cy.contains('[role="tab"]', 'Insights').click();
    cy.get('[data-testid="per-day-chart"] svg').should('exist');
    cy.get('[aria-label="Top issuers"]').should('contain', "Let's Encrypt");
    cy.get('button[aria-label="Show the confirmed threats"]').click();
    cy.location('hash').should('include', 'status=confirmed').and('not.include', 'tab=');
  });
});
