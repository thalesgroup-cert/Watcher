// Website Monitoring module: websites (KPI quick filters, filters / sort in the URL, drawer, add / edit / delete,
// bulk change and exports), changes (triage, drawer, link to the website) and Insights. All API calls are mocked.
describe('Website Monitoring', () => {
  const USER = { id: 1, username: 'analyst', first_name: 'Ana', last_name: 'Lyst', email: '', is_superuser: true, is_staff: false, groups: [], permissions: [] };
  const API = '/api/site_monitoring/';
  const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString().slice(0, 19);
  const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  const site = (id, overrides = {}) => ({
    id, domain_name: `phish-${id}.com`, ticket_id: null, rtir: id, ip: '203.0.113.10', ip_second: null, ip_monitoring: true,
    mail_A_record_ip: null, MX_records: "['10 mx1.phish.com.', '20 mx2.phish.com.']", mail_monitoring: true, content_monitoring: true,
    monitored: true, web_status: 200, server_banner: 'nginx', x_powered_by: null, registrar: 'NameCheap', legitimacy: 5,
    takedown_request: false, legal_team: false, blocking_request: false, created_at: ago(9000), expiry: null,
    domain_expiry: day(200), domain_created_at: day(-30), ssl_expiry: null, udrp_status: null, udrp_last_checked: null,
    misp_event_uuid: [], last_event: null, alerts_count: 2, open_alerts_count: 1, last_alert_at: ago(60),
    ...overrides,
  });
  const SITES = [site(1), site(2, { legitimacy: 2, web_status: null, alerts_count: 0, open_alerts_count: 0, last_alert_at: null })];
  const change = (id, overrides = {}) => ({
    id, site: { id: 1, domain_name: 'phish-1.com', legitimacy: 5 }, type: 'IP address change detected', difference_score: null,
    new_ip: '198.51.100.7', old_ip: '203.0.113.10', new_ip_second: null, old_ip_second: null, new_MX_records: null, old_MX_records: null,
    new_mail_A_record_ip: null, old_mail_A_record_ip: null, new_registrar: null, old_registrar: null, new_expiry_date: null,
    old_expiry_date: null, new_ssl_expiry: null, old_ssl_expiry: null, new_server_banner: null, old_server_banner: null,
    new_x_powered_by: null, old_x_powered_by: null, status: true, created_at: ago(id), ...overrides,
  });
  const CHANGES = [change(11), change(12, { type: 'RDAP registrar change detected', new_ip: null, old_ip: null, old_registrar: 'GoDaddy', new_registrar: 'NameCheap' })];
  const STATS = {
    total: 2, malicious: 1, takedownRequests: 0, legalTeam: 0, blockingRequests: 0, newToday: 0, newThisWeek: 0, offline: 1, expiringSoon: 0,
    byLegitimacy: { 5: 1, 2: 1 }, openAlerts: 2, archivedAlerts: 0,
    alertsByKind: { hosting: 1, mail: 0, content: 0, registration: 1, certificate: 0, server: 0 },
    alertsPerDay: Array.from({ length: 30 }, (_, i) => ({ date: day(i - 29), count: i % 3 })), topRegistrars: [{ name: 'NameCheap', count: 2 }],
  };
  const page = (results) => ({ count: results.length, next: null, previous: null, results });
  const SUMMARY = (status, ids) => ({ succeeded: ids.length, skipped: 0, errors: 0, ok_status: status, results: ids.map((id) => ({ value: `phish-${id}.com`, status, reason: '', id })) });

  beforeEach(() => {
    cy.on('uncaught:exception', () => false);
    cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: USER });
    cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: 'bootstrap', preferences: {}, avatar_color: null } });
    cy.intercept('GET', `${API}site/?*`, { statusCode: 200, body: page(SITES) }).as('sites');
    cy.intercept('GET', `${API}site/1/`, { statusCode: 200, body: SITES[0] });
    cy.intercept('GET', `${API}site/statistics/`, { statusCode: 200, body: STATS });
    cy.intercept('GET', `${API}alert/?*`, { statusCode: 200, body: page(CHANGES) }).as('changes');
    cy.intercept('GET', `${API}alert/11/`, { statusCode: 200, body: { ...CHANGES[0], site: SITES[0] } });
    cy.intercept('GET', `${API}alert/12/`, { statusCode: 200, body: { ...CHANGES[1], site: SITES[0] } });
    cy.intercept('GET', '/api/timeline/events/?*', { statusCode: 200, body: [] });
    cy.visit('/#/website_monitoring', { onBeforeLoad: (win) => win.localStorage.setItem('token', 'mock-token-site') });
    cy.get('[data-testid="site-row"]', { timeout: 20000 }).should('have.length', 2);
  });

  describe('websites', () => {
    it('describes each website', () => {
      cy.get('[data-testid="site-row"]').first().should('contain', 'phish-1.com').and('contain', 'NameCheap').and('contain', 'Malicious').and('contain', 'Online');
      cy.get('[data-testid="site-row"]').eq(1).should('contain', 'Suspicious').and('contain', 'Offline');
    });

    it('filters from the KPI cards, the toolbar and the column headers, all kept in the URL', () => {
      cy.wait('@sites'); // the request of the first display, so that the next waits are the ones of the filters
      cy.contains('button', 'Malicious').click();
      cy.wait('@sites').its('request.url').should('include', 'legitimacy=5,6');
      cy.location('hash').should('include', 'legitimacy=5%2C6');
      cy.contains('button', 'Clear').click();
      cy.get('[role="combobox"]').eq(1).click();
      cy.contains('[role="option"]', 'Offline').click();
      cy.wait('@sites').its('request.url').should('include', 'web=offline');
      cy.get('[role="combobox"]').eq(3).click();
      cy.contains('[role="option"]', 'Takedown requested').click();
      cy.wait('@sites').its('request.url').should('include', 'action=takedown');
      cy.contains('th [role="button"]', 'Changes to review').click();
      cy.wait('@sites').its('request.url').should('include', 'ordering=open_alerts_count');
    });

    it('opens a website with its state, hosting and recent changes', () => {
      cy.get('[data-testid="site-row"]').first().click();
      cy.location('hash').should('include', 'site=1');
      cy.wait('@changes').its('request.url').should('include', 'site=1').and('include', 'page_size=5');
      cy.get('.MuiDrawer-paper').within(() => {
        cy.contains('#site-drawer-title', 'phish-1.com');
        cy.contains('10 mx1.phish.com., 20 mx2.phish.com.');
        cy.contains('nginx');
        cy.contains('Hosting (IP)').click();
      });
      cy.location('hash').should('include', 'tab=changes').and('include', 'change=11');
    });

    it('edits and deletes a website', () => {
      cy.intercept('PATCH', `${API}site/1/`, (req) => req.reply({ statusCode: 200, body: { ...SITES[0], ...req.body } })).as('patch');
      cy.intercept('DELETE', `${API}site/1/`, { statusCode: 204 }).as('delete');
      cy.get('[data-testid="site-row"]').first().click();
      cy.get('.MuiDrawer-paper').contains('button', 'Edit').click();
      // The drawer is a dialog too: only the form and the confirmation are meant.
      cy.get('[role="dialog"]:not(.MuiDrawer-paper)').within(() => {
        cy.get('input[name="ticket_id"]').type('INC-42');
        cy.contains('label', 'Takedown requested').click();
        cy.contains('button', 'Save').click();
      });
      cy.wait('@patch').its('request.body').should('include', { ticket_id: 'INC-42', takedown_request: true, legitimacy: 5, domain_name: 'phish-1.com' });
      cy.get('.MuiDrawer-paper').contains('button', 'Delete').click();
      cy.get('[role="dialog"]:not(.MuiDrawer-paper)').contains('button', 'Delete').click();
      cy.wait('@delete');
    });

    it('adds several websites; an unknown one is not checked', () => {
      cy.intercept('POST', `${API}site/bulk_create/`, (req) => req.reply({ statusCode: 200, body: { ...SUMMARY('created', [3, 4]), dry_run: req.body.dry_run } })).as('bulkCreate');
      cy.contains('button', 'Monitor websites').click();
      cy.location('hash').should('include', 'dialog=add');
      cy.get('[role="dialog"]').within(() => {
        cy.contains('label', 'Add several, one per line').click();
        cy.get('textarea[name="domain_name"]').type('a.com\nb.com');
        cy.get('[role="combobox"]').click();
      });
      cy.contains('[role="option"]', 'Unknown').click();
      cy.get('[role="dialog"]').within(() => {
        cy.contains('A site of unknown legitimacy is not checked');
        cy.contains('button', 'Monitor 2').click();
      });
      cy.wait('@bulkCreate').its('request.body').should((body) => {
        expect(body.values).to.eq('a.com\nb.com');
        expect(body.dry_run).to.eq(false);
        expect(body.shared).to.include({ legitimacy: 1, ip_monitoring: false, content_monitoring: false, mail_monitoring: false });
      });
    });

    it('changes and exports the selection in bulk', () => {
      cy.intercept('POST', `${API}site/bulk_update/`, { statusCode: 200, body: SUMMARY('updated', [1, 2]) }).as('bulkUpdate');
      cy.intercept('POST', `${API}site/bulk_export_misp/`, { statusCode: 200, body: SUMMARY('exported', [1, 2]) }).as('bulkMisp');
      cy.get('input[aria-label="Select the websites of this page"]').check();
      cy.get('[role="region"][aria-label="Selection"]').contains('button', 'Change').click();
      cy.get('[role="dialog"]').within(() => {
        cy.contains('label', 'Legitimacy').click();
        cy.contains('label', 'Takedown requested').click();
        cy.contains('button', 'Apply to 2').click();
      });
      cy.wait('@bulkUpdate').its('request.body').should('deep.equal', { ids: [1, 2], changes: { legitimacy: 5, takedown_request: true } });
      cy.contains('[role="dialog"]', '2 updated').contains('button', 'Close').click();
      cy.get('input[aria-label="Select the websites of this page"]').check();
      cy.get('[role="region"][aria-label="Selection"]').contains('button', 'Export').click();
      cy.contains('[role="menuitem"]', 'To MISP').click();
      cy.wait('@bulkMisp').its('request.body').should('deep.equal', { ids: [1, 2] });
    });

    it('moves a website to Legitimate Domains in one server step', () => {
      cy.intercept('POST', `${API}site/bulk_export_legitimate/`, { statusCode: 200, body: SUMMARY('exported', [1]) }).as('legit');
      cy.get('[data-testid="site-row"]').first().click();
      cy.get('.MuiDrawer-paper').contains('button', 'Export').click();
      cy.contains('[role="menuitem"]', 'To Legitimate Domains').click();
      cy.get('[role="dialog"] textarea').first().should('have.value', 'Exported from Website Monitoring - Original legitimacy: Malicious (registered)');
      cy.get('[role="dialog"]').contains('button', 'Add to Legitimate Domains').click();
      cy.wait('@legit').its('request.body').should('deep.equal', { ids: [1], comment: 'Exported from Website Monitoring - Original legitimacy: Malicious (registered)' });
    });
  });

  describe('changes', () => {
    beforeEach(() => {
      cy.contains('[role="tab"]', 'Changes').click();
      cy.get('[data-testid="change-row"]').should('have.length', 2);
    });

    it('opens on the changes to review and filters them', () => {
      cy.wait('@changes').its('request.url').should('include', 'status=active');
      cy.get('[data-testid="change-row"]').eq(1).should('contain', 'Registration').and('contain', 'GoDaddy to NameCheap');
      cy.get('[role="combobox"]').eq(0).click();
      cy.contains('[role="option"]', 'Mail servers').click();
      cy.wait('@changes').its('request.url').should('include', 'kind=mail');
      cy.location('hash').should('include', 'ckind=mail');
    });

    it('shows a change, archives it and moves on, then opens its website', () => {
      cy.intercept('PATCH', `${API}alert/11/`, { statusCode: 200, body: {} }).as('archive');
      cy.get('[data-testid="change-row"]').first().click();
      cy.get('.MuiDrawer-paper').within(() => {
        cy.get('[data-testid="change-diff"]').should('contain', '203.0.113.10').and('contain', '198.51.100.7');
        cy.contains('button', 'Archive').click();
      });
      cy.wait('@archive').its('request.body').should('deep.equal', { status: false });
      cy.location('hash').should('include', 'change=12');
      cy.get('.MuiDrawer-paper').contains('button', 'Website').click();
      cy.location('hash').should('include', 'site=1').and('not.include', 'tab=');
      cy.contains('#site-drawer-title', 'phish-1.com');
    });
  });

  it('shows the insights and filters from them', () => {
    cy.contains('[role="tab"]', 'Insights').click();
    cy.get('[data-testid="per-day-chart"] svg').should('exist');
    cy.get('button[aria-label="Show the registration changes"]').click();
    cy.location('hash').should('include', 'tab=changes').and('include', 'ckind=registration');
  });
});
