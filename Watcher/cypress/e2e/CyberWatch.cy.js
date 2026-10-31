// Cyber Watch: matches inbox (KPI quick filters, drawer, archive moving on, bulk archive), CVEs (severity filters,
// drawer with references and rules), ransomware victims (group), watch rules (live preview, create + match the data
// collected, pause, delete) and Insights. All API calls are mocked.
describe('Cyber Watch', () => {
  const USER = { id: 1, username: 'analyst', first_name: 'Ana', last_name: 'Lyst', email: '', is_superuser: true, is_staff: false, groups: [], permissions: [] };
  const API = '/api/cyber_watch/';
  const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString().slice(0, 19);
  const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  const CVES = [
    { id: 1, cve_id: 'CVE-2026-1001', description: 'Fortinet FortiOS SSL-VPN heap overflow allows remote code execution without authentication.', cvss_score: 9.8, severity: 'CRITICAL', published: ago(120), references: [{ url: 'https://fortiguard.example/psirt/FG-IR-26-001', type: 'ADVISORY' }, { url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-1001', type: 'WEB' }], fetched_at: ago(100), is_archived: false, hits_count: 1 },
    { id: 2, cve_id: 'CVE-2026-1002', description: 'WordPress plugin Forms stored XSS.', cvss_score: 5.4, severity: 'MEDIUM', published: ago(600), references: [], fetched_at: ago(590), is_archived: false, hits_count: 0 },
    { id: 3, cve_id: 'CVE-2026-1003', description: 'Linux kernel use-after-free in netfilter.', cvss_score: null, severity: '', published: ago(900), references: [], fetched_at: ago(890), is_archived: false, hits_count: 0 },
  ];
  const VICTIMS = [
    { id: 11, group: 7, group_name: 'akira', victim_name: 'Clinique du Nord', country: 'FR', sector: 'Healthcare', attacked_at: ago(300), url: 'https://www.ransomware.live/id/abc', fetched_at: ago(290), is_archived: false, hits_count: 1 },
    { id: 12, group: 8, group_name: 'qilin', victim_name: 'Steelworks GmbH', country: 'DE', sector: 'Manufacturing', attacked_at: ago(2000), url: '', fetched_at: ago(1990), is_archived: false, hits_count: 0 },
  ];
  const GROUP = { id: 7, name: 'akira', description: 'Akira is a ransomware group active since 2023.', source: 'ransomware.live', first_seen: '2023-03-01', victim_count: 412, last_attack_at: ago(300) };
  const RULES = [
    { id: 1, name: 'Edge devices', keywords: ['Fortinet', 'Ivanti'], exceptions: [], scope: 'cve', is_active: true, created_at: ago(30000), hits_count: 3, open_hits_count: 1, last_hit_at: ago(110), last_event: null },
    { id: 2, name: 'Healthcare sector', keywords: ['Healthcare'], exceptions: [], scope: 'ransomware', is_active: true, created_at: ago(20000), hits_count: 1, open_hits_count: 1, last_hit_at: ago(290), last_event: null },
  ];
  const MATCHES = [
    {
      id: 21, rule: 1, rule_name: 'Edge devices', rule_scope: 'cve', hit_type: 'cve', object_id: 'CVE-2026-1001', hit_display: 'CVE-2026-1001 - Fortinet FortiOS SSL-VPN heap overflow',
      matched_keyword: 'Fortinet', hit_at: ago(110), is_archived: false,
      target: { kind: 'cve', id: 1, cve_id: 'CVE-2026-1001', severity: 'CRITICAL', cvss_score: 9.8, published: ago(120), is_archived: false },
    },
    {
      id: 22, rule: 2, rule_name: 'Healthcare sector', rule_scope: 'ransomware', hit_type: 'ransomware_victim', object_id: 'akira::Clinique du Nord', hit_display: 'Clinique du Nord (akira) - FR',
      matched_keyword: 'Healthcare', hit_at: ago(290), is_archived: false,
      target: { kind: 'victim', id: 11, victim_name: 'Clinique du Nord', group_id: 7, group_name: 'akira', country: 'FR', sector: 'Healthcare', attacked_at: ago(300), url: 'https://www.ransomware.live/id/abc', is_archived: false },
    },
  ];
  const series = (f) => Array.from({ length: 30 }, (_, i) => ({ date: day(i - 29), ...f(i) }));
  const STATS = {
    cves: { total: 3, critical7d: 1, newToday: 1, new7d: 3, archived: 4, matched: 1, bySeverity: { CRITICAL: 1, MEDIUM: 1, NONE: 1 }, perDay: series((i) => ({ count: i % 5 })) },
    victims: {
      total: 2, newToday: 1, new7d: 2, archived: 0, matched: 1, groups: 2, activeGroups7d: 2, perDay: series((i) => ({ count: (i * 3) % 7 })),
      topGroups: [{ id: 7, name: 'akira', count: 1 }, { id: 8, name: 'qilin', count: 1 }],
      topSectors: [{ name: 'Healthcare', count: 1 }, { name: 'Manufacturing', count: 1 }],
      topCountries: [{ name: 'FR', count: 1 }, { name: 'DE', count: 1 }],
    },
    hits: { open: 2, openCve: 1, openVictims: 1, new7d: 2, archived: 5, perDay: series((i) => ({ count: 1, cve: i % 2, ransomware_victim: 1 - (i % 2) })) },
    rules: { total: 2, active: 2, byRule: [{ id: 1, name: 'Edge devices', open: 1, total: 3, active: true }, { id: 2, name: 'Healthcare sector', open: 1, total: 1, active: true }] },
  };
  const PREVIEW = { cves: 4, victims: 0, cveSamples: [{ id: 1, label: 'CVE-2026-1001', detail: 'Fortinet FortiOS SSL-VPN heap overflow', keyword: 'Fortinet', severity: 'CRITICAL', date: ago(120) }], victimSamples: [] };
  const page = (results) => ({ count: results.length, next: null, previous: null, results });
  const SUMMARY = (status, ids) => ({ succeeded: ids.length, skipped: 0, errors: 0, ok_status: status, results: ids.map((id) => ({ value: String(id), status, reason: '', id })) });

  beforeEach(() => {
    cy.on('uncaught:exception', () => false);
    cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: USER });
    cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: 'bootstrap', preferences: {}, avatar_color: null } });
    cy.intercept('GET', `${API}statistics/`, { statusCode: 200, body: STATS });
    cy.intercept('GET', `${API}watch-rule-hits/?*`, (req) => {
      const { object_id: objectId, rule } = req.query;
      const rows = objectId ? MATCHES.filter((m) => m.object_id === objectId) : rule ? MATCHES.filter((m) => String(m.rule) === String(rule)) : MATCHES;
      req.reply({ statusCode: 200, body: page(rows) });
    }).as('matches');
    cy.intercept('GET', `${API}watch-rule-hits/21/`, { statusCode: 200, body: MATCHES[0] });
    cy.intercept('GET', `${API}watch-rule-hits/22/`, { statusCode: 200, body: MATCHES[1] });
    cy.intercept('GET', `${API}cves/?*`, { statusCode: 200, body: page(CVES) }).as('cves');
    cy.intercept('GET', `${API}cves/1/`, { statusCode: 200, body: CVES[0] });
    cy.intercept('GET', `${API}ransomware/victims/?*`, { statusCode: 200, body: page(VICTIMS) }).as('victims');
    cy.intercept('GET', `${API}ransomware/victims/11/`, { statusCode: 200, body: VICTIMS[0] });
    cy.intercept('GET', `${API}ransomware/groups/7/`, { statusCode: 200, body: GROUP });
    cy.intercept('GET', `${API}watch-rules/?*`, { statusCode: 200, body: page(RULES) });
    cy.intercept('GET', `${API}watch-rules/1/`, { statusCode: 200, body: RULES[0] });
    cy.intercept('GET', '/api/timeline/events/?*', { statusCode: 200, body: [] });
    cy.visit('/#/cyber_watch', { onBeforeLoad: (win) => win.localStorage.setItem('token', 'mock-token-cyber') });
    cy.get('[data-testid="match-row"]', { timeout: 20000 }).should('have.length', 2);
  });

  describe('matches', () => {
    it('opens on what is left to review and filters from the KPI cards and the toolbar', () => {
      cy.wait('@matches').its('request.url').should('include', 'status=active');
      cy.get('[data-testid="match-row"]').first().should('contain', 'CVE-2026-1001').and('contain', 'Critical - 9.8').and('contain', 'Fortinet');
      cy.contains('button', /^Ransomware victims\s*1/).click();
      cy.wait('@matches').its('request.url').should('include', 'hit_type=ransomware_victim');
      cy.location('hash').should('include', 'type=ransomware_victim');
      cy.contains('button', /^To review\s*2/).click();
      cy.get('[role="combobox"]').eq(1).click();
      cy.contains('[role="option"]', 'Edge devices').click();
      cy.wait('@matches').its('request.url').should('include', 'rule=1');
    });

    it('explains a match, archives it and moves on to the next one, then opens the victim', () => {
      cy.intercept('PATCH', `${API}watch-rule-hits/21/`, (req) => req.reply({ statusCode: 200, body: { ...MATCHES[0], ...req.body } })).as('archive');
      cy.get('[data-testid="match-row"]').first().click();
      cy.location('hash').should('include', 'match=21');
      cy.get('.MuiDrawer-paper').within(() => {
        cy.contains('Edge devices');
        cy.contains('remote code execution');
        cy.get('mark').should('contain', 'Fortinet');
        cy.contains('button', /^Archive$/).click();
      });
      cy.wait('@archive').its('request.body').should('deep.equal', { is_archived: true });
      cy.location('hash').should('include', 'match=22');
      cy.get('.MuiDrawer-paper').contains('button', 'Open the victim').click();
      cy.location('hash').should('include', 'tab=ransomware').and('include', 'victim=11');
      cy.get('.MuiDrawer-paper').should('contain', '412');
      cy.get('[data-testid="rules-matched"]').should('contain', 'Healthcare sector');
      cy.wait('@victims'); // the request of the first display of the victims tab
      cy.get('.MuiDrawer-paper').contains('button', 'Show its victims').click();
      cy.wait('@victims').its('request.url').should('include', 'group_id=7');
    });

    it('archives several matches at once', () => {
      cy.intercept('POST', `${API}watch-rule-hits/bulk_update/`, (req) => req.reply({ statusCode: 200, body: SUMMARY('updated', req.body.ids) })).as('bulk');
      cy.get('[data-testid="match-row"]').eq(0).find('input[type="checkbox"]').check();
      cy.get('[data-testid="match-row"]').eq(1).find('input[type="checkbox"]').check();
      cy.contains('button', /^Archive$/).click();
      cy.wait('@bulk').its('request.body').should('deep.equal', { ids: [21, 22], changes: { is_archived: true } });
    });
  });

  it('lists the CVEs by severity and opens one with its references and rules', () => {
    cy.intercept('PATCH', `${API}cves/1/`, (req) => req.reply({ statusCode: 200, body: { ...CVES[0], ...req.body } })).as('archiveCve');
    cy.contains('[role="tab"]', 'CVEs').click();
    cy.get('[data-testid="cve-row"]').eq(2).should('contain', 'Not scored yet');
    cy.wait('@cves'); // the request of the first display of this tab
    cy.contains('button', 'Critical - 7 days').click();
    cy.wait('@cves').its('request.url').should('include', 'severity=CRITICAL').and('include', 'period=7d');
    cy.get('[data-testid="cve-row"]').first().click();
    cy.get('.MuiDrawer-paper').should('contain', 'fortiguard.example');
    cy.get('[data-testid="rules-matched"]').should('contain', 'Edge devices');
    cy.get('.MuiDrawer-paper').contains('button', /^Archive$/).click();
    cy.wait('@archiveCve').its('request.body').should('deep.equal', { is_archived: true });
    cy.get('[data-testid="rules-matched"] [role="button"]').first().click();
    cy.location('hash').should('include', 'match=21').and('not.include', 'tab=');
  });

  describe('watch rules', () => {
    it('previews a new rule, creates it and matches the data already collected', () => {
      cy.intercept('POST', `${API}watch-rules/preview/`, { statusCode: 200, body: PREVIEW }).as('preview');
      cy.intercept('POST', `${API}watch-rules/`, (req) => req.reply({ statusCode: 201, body: { ...RULES[0], ...req.body, id: 9, hits_count: 0, open_hits_count: 0, last_hit_at: null } })).as('create');
      cy.intercept('POST', `${API}watch-rules/9/scan/`, { statusCode: 200, body: { created: 4 } }).as('scan');
      cy.intercept('GET', `${API}watch-rules/9/`, { statusCode: 200, body: { ...RULES[0], id: 9, name: 'VPN vendors' } });
      cy.contains('button', 'New watch rule').click();
      cy.location('hash').should('include', 'tab=rules').and('include', 'dialog=add-rule');
      cy.get('[role="dialog"]').within(() => {
        cy.get('input[name="name"]').type('VPN vendors');
        cy.contains('button', /^CVEs$/).click();
        cy.get('textarea[name="keywords"]').type('Fortinet, Ivanti{enter}Citrix');
      });
      cy.wait('@preview').its('request.body').should('deep.equal', { keywords: ['Fortinet', 'Ivanti', 'Citrix'], exceptions: [], scope: 'cve' });
      cy.get('[data-testid="rule-preview"]').should('contain', 'Would match 4 CVEs');
      cy.get('[role="dialog"]').contains('button', 'Create').click();
      cy.wait('@create').its('request.body').should('include', { name: 'VPN vendors', scope: 'cve', is_active: true });
      cy.wait('@scan');
      cy.location('hash').should('include', 'rule=9');
    });

    it('pauses and deletes a rule', () => {
      cy.intercept('PATCH', `${API}watch-rules/1/`, (req) => req.reply({ statusCode: 200, body: { ...RULES[0], ...req.body } })).as('pause');
      cy.intercept('DELETE', `${API}watch-rules/1/`, { statusCode: 204 }).as('delete');
      cy.contains('[role="tab"]', 'Watch rules').click();
      cy.get('[data-testid="rule-row"]').first().click();
      cy.get('[data-testid="rule-keywords"]').should('contain', 'Fortinet');
      cy.get('.MuiDrawer-paper').contains('button', 'Pause').click();
      cy.wait('@pause').its('request.body').should('deep.equal', { is_active: false });
      cy.get('.MuiDrawer-paper').contains('button', 'Delete').click();
      // The drawer is a dialog too: only the confirmation is meant.
      cy.get('[role="dialog"]:not(.MuiDrawer-paper)').should('contain', '3 matches are deleted').contains('button', 'Delete').click();
      cy.wait('@delete');
    });
  });

  it('shows the insights and filters from them', () => {
    cy.contains('[role="tab"]', 'Insights').click();
    cy.get('[data-testid="matches-chart"] svg').should('exist');
    cy.get('button[aria-label="Show the critical CVEs"]').click();
    cy.location('hash').should('include', 'tab=cves').and('include', 'csev=CRITICAL');
    cy.contains('[role="tab"]', 'Insights').click();
    cy.get('button[aria-label="Review the matches of Healthcare sector"]').click();
    cy.location('hash').should('include', 'rule=2').and('not.include', 'tab=');
  });
});
