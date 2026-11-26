// Overview (home page): the week in one figure and the latest AI summary, a card per module, the latest detections, the top
// vulnerabilities and the trending words, the blocks the person chooses, the anonymous view and the old Threats Watcher
// links. All API calls are mocked.
describe('Overview', () => {
  const USER = { id: 1, username: 'analyst', first_name: 'Ana', last_name: 'Lyst', email: '', is_superuser: true, is_staff: false, groups: [], permissions: [] };
  const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString().slice(0, 19);
  const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const series = (f) => Array.from({ length: 30 }, (_, i) => ({ date: day(i - 29), ...f(i) }));
  const page = (results) => ({ count: results.length, next: null, previous: null, results });

  const NODES = ['microsoft', 'adobe', 'apple', 'lockbit', 'citrix', 'ivanti'].map((name, i) => ({ id: i + 1, name, occurrences: 30 - i * 4, score: [80, 55, 20, 70, 70, 70][i], posts_count: 10 }));
  const GRAPH = { nodes: NODES, links: [{ source: 1, target: 2, weight: 3 }] };
  const THREATS = {
    totalWords: 6, newToday: 2, newThisWeek: 6, totalSources: 217, failingSources: 3, bannedWords: 10, monitoredKeywords: 2, monitoredSeen: 1,
    monitoredByLevel: {}, topWords: [], wordsPerDay: series(() => ({ count: 1 })), articlesPerDay: series(() => ({ count: 3 })),
    sourcesByCountry: [{ code: 'FR', country: 'France', count: 40 }], sourcesByConfidence: {},
  };
  const CYBER = {
    cves: { total: 10, critical7d: 2, newToday: 1, new7d: 5, archived: 0, matched: 1, exploited: 2, bySeverity: { CRITICAL: 2, HIGH: 3, MEDIUM: 4, LOW: 1 }, perDay: series(() => ({ count: 1 })) },
    victims: {
      total: 20, newToday: 2, new7d: 9, archived: 0, matched: 1, groups: 4, activeGroups7d: 3, perDay: series(() => ({ count: 1 })), topGroups: [], topSectors: [], topCountries: [],
      byCountry: [{ name: 'US', count: 12 }],
    },
    hits: { open: 7, openCve: 4, openVictims: 3, new7d: 5, archived: 2, perDay: series(() => ({ cve: 1 })) },
  };
  const CVES = [
    { id: 1, cve_id: 'CVE-2026-1001', description: 'Fortinet FortiOS heap overflow', cvss_score: 9.8, severity: 'CRITICAL', exploited: true, kev_added: day(-2), kev_due: day(5), kev_ransomware: false, epss: 0.9, epss_percentile: 0.99, published: ago(60), references: [], fetched_at: ago(50), is_archived: false, hits_count: 1 },
    { id: 2, cve_id: 'CVE-2026-1002', description: 'Citrix gateway path traversal', cvss_score: 8.1, severity: 'HIGH', published: ago(120), references: [], fetched_at: ago(110), is_archived: false, hits_count: 0 },
  ];
  const VICTIMS = [{ id: 11, group: 7, group_name: 'akira', victim_name: 'Clinique du Nord', country: 'FR', sector: 'Healthcare', attacked_at: ago(300), url: '', fetched_at: ago(290), is_archived: false, hits_count: 0 }];
  const BREAKING = { id: 5, type: 'breaking_news', keywords: 'fortinet', summary_text: 'Fortinet warns of an actively exploited flaw in FortiOS.', created_at: ago(90), updated_at: ago(90) };
  // A breaking news with a threat context after its first paragraph: there is more to read than the card shows
  const BREAKING_MORE = { ...BREAKING, id: 6, summary_text: "<p>Fortinet warns of an actively exploited flaw in FortiOS.</p><div><strong>Impact Level:</strong> <span class='badge bg-danger'>High</span></div>" };
  const WEEKLY = { id: 4, type: 'weekly_summary', keywords: '', summary_text: 'This week: ransomware activity rose in healthcare.', created_at: ago(2000), updated_at: ago(2000) };

  const DOMAINS = { total: 30, expired: 1, expiringSoon: 2, sslExpiringSoon: 1, repurchased: 3 };
  const LEAKS = { activeAlerts: 4, newThisWeek: 3, newToday: 1, totalAlerts: 9, totalKeywords: 2 };
  const DNS = { openAlerts: 12, totalAlerts: 20, newThisWeek: 4, openTakeover: 1, totalDnsMonitored: 6, totalKeywords: 3 };
  const SITES = { openAlerts: 5, newThisWeek: 2, total: 8, malicious: 1, takedownRequests: 2, legalTeam: 1 };
  const LEAK_ALERTS = page([{ id: 21, keyword: { id: 1, name: 'acme', is_regex: false }, url: 'https://pastebin.com/x', source: 'pastebin.com', status: true, created_at: ago(10) }]);
  const DNS_THREATS = page([{ id: 31, source: 'dnstwist', domain_name: 'acme-login.com', status: 'open', created_at: ago(20) }]);
  const SITE_CHANGES = page([{ id: 41, site: { id: 1, domain_name: 'phish-1.com', legitimacy: 5 }, type: 'IP change', created_at: ago(30) }]);

  // The whole page is one request: what the server answers to a visitor (the public parts) or to a signed-in person (everything)
  const overviewBody = (signedIn) => ({
    threats: THREATS,
    cyber: CYBER,
    domains: DOMAINS,
    graph: GRAPH,
    brief: { breaking_news: null, weekly_summary: null },
    topCves: CVES,
    pending: signedIn ? { count: 2 } : null,
    leaks: signedIn ? LEAKS : null,
    dns: signedIn ? DNS : null,
    sites: signedIn ? SITES : null,
    latest: signedIn
      ? { cves: CVES, victims: VICTIMS, leaks: LEAK_ALERTS.results, threats: DNS_THREATS.results, changes: SITE_CHANGES.results }
      : { cves: [], victims: [], leaks: [], threats: [], changes: [] },
  });
  const mockOverview = (signedIn, patch = {}) => {
    cy.intercept('GET', '/api/overview/', (req) => req.reply({ statusCode: 200, body: { ...overviewBody(signedIn), ...patch } })).as('overview');
  };

  describe('signed in', () => {
    beforeEach(() => {
      cy.on('uncaught:exception', () => false);
      cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: USER });
      cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: 'bootstrap', preferences: {}, avatar_color: null } });
      mockOverview(true);
      cy.intercept('PATCH', '/api/auth/profile', (req) => req.reply({ statusCode: 200, body: { theme: '', avatar_color: null, preferences: {}, ...req.body } })).as('patchProfile');
      // Pages the overview links to.
      cy.intercept('GET', '/api/threats_watcher/trendyword/?*', { statusCode: 200, body: page([]) });
      cy.intercept('GET', '/api/threats_watcher/trendyword/1/', { statusCode: 200, body: { ...NODES[0], created_at: ago(30), posts: [], monitored: false } });
      cy.intercept('GET', '/api/cyber_watch/cves/1/', { statusCode: 200, body: CVES[0] });
      cy.intercept('GET', '/api/cyber_watch/watch-rule-hits/?*', { statusCode: 200, body: page([]) });
      cy.visit('/#/', { onBeforeLoad: (win) => win.document.cookie = 'session_active=1' });
      cy.contains('h1', 'Overview', { timeout: 20000 });
    });

    describe('the week', () => {
      it('greets the person and counts the detections of the week, module by module', () => {
        // What concerns the organisation: 3 leaks + 4 DNS threats + 2 website changes + 5 watch rule matches. Not the news of the world.
        cy.get('[data-testid="week-hero"]').should('contain', 'Ana').and('contain', '14').and('contain', 'new detections').and('contain', 'for your organisation').and('contain', 'in the last 7 days');
        cy.get('[data-testid="week-hero"]').should('contain', 'Data leaks').and('contain', 'DNS threats').and('contain', 'Website changes').and('contain', 'Watch rule matches');
        cy.get('[data-testid="week-hero"]').should('not.contain', 'Ransomware victims').and('not.contain', 'CVEs');
        cy.contains('[data-testid="week-hero"] a', 'Data leaks').click();
        cy.location('hash').should('eq', '#/data_leak');
      });

      it('draws how the detections went over the last 14 days, the latest day in full colour', () => {
        cy.get('[data-testid="activity-bars"] rect').should('have.length', 14).then(($bars) => {
          const opacities = [...$bars].map((bar) => bar.getAttribute('opacity'));
          expect(opacities[13]).to.eq('1');
          expect(opacities.slice(0, 13).every((o) => o === '0.35')).to.eq(true);
        });
        cy.get('[data-testid="activity-bars"] svg').should('have.attr', 'aria-label').and('include', 'last 14 days');
      });

      it('refreshes the figures on demand', () => {
        mockOverview(true, { cyber: { ...CYBER, hits: { ...CYBER.hits, new7d: 15 } } });
        cy.get('button[aria-label="Refresh the figures"]').click();
        cy.wait('@overview');
        cy.get('[data-testid="week-hero"]').should('contain', '24');
      });

      it('asks for the whole page in a single request, and refreshes only that', () => {
        cy.get('@overview.all').should('have.length', 1);
        cy.get('button[aria-label="Refresh the figures"]').click();
        cy.get('@overview.all').should('have.length', 2);
      });
    });

    describe('the intelligence brief', () => {
      it('says so when there is no summary yet', () => {
        cy.get('[data-testid="home-brief"]').should('contain', 'No summary yet');
      });

      it('shows the breaking news of the week, and how long ago it was written', () => {
        mockOverview(true, { brief: { breaking_news: BREAKING_MORE, weekly_summary: WEEKLY } });
        cy.reload();
        cy.get('[data-testid="home-brief"]', { timeout: 20000 }).should('contain', 'Breaking news').and('contain', 'actively exploited flaw').and('contain', 'Generated');
        // What follows the first paragraph is announced, so nobody takes it for the whole text
        cy.get('[data-testid="home-brief"] [data-testid="summary-outline"]').should('contain', 'Impact: High');
        cy.get('[data-testid="home-brief"] [data-testid="read-more"]').click();
        // Read more opens the whole text where it belongs: Threats Watcher, with the reading panel open
        cy.location('hash').should('include', '#/threats_watcher').and('include', 'read=breaking');
      });

      it('has no Read more when the summary is short: there is nothing behind it', () => {
        mockOverview(true, { brief: { breaking_news: BREAKING, weekly_summary: WEEKLY } });
        cy.reload();
        cy.get('[data-testid="home-brief"]', { timeout: 20000 }).should('contain', 'Fortinet warns');
        cy.get('[data-testid="home-brief"] [data-testid="read-more"]').should('not.exist');
      });

      it('takes the breaking news off 24 hours after it was written, as on Threats Watcher', () => {
        mockOverview(true, { brief: { breaking_news: { ...BREAKING, created_at: ago(26 * 60), updated_at: ago(26 * 60) }, weekly_summary: WEEKLY } });
        cy.reload();
        cy.get('[data-testid="home-brief"]', { timeout: 20000 }).should('contain', 'This week in cyber threats').and('contain', 'ransomware activity rose');
        cy.get('[data-testid="home-brief"]').should('not.contain', 'Fortinet warns').and('not.contain', 'Breaking news');
      });

      it('still shows a breaking news written 22 hours ago', () => {
        mockOverview(true, { brief: { breaking_news: { ...BREAKING, created_at: ago(22 * 60), updated_at: ago(22 * 60) }, weekly_summary: WEEKLY } });
        cy.reload();
        cy.get('[data-testid="home-brief"]', { timeout: 20000 }).should('contain', 'Fortinet warns').and('contain', 'Breaking news');
      });

      it('falls back on the weekly report when there is no breaking news', () => {
        mockOverview(true, { brief: { breaking_news: null, weekly_summary: WEEKLY } });
        cy.reload();
        cy.get('[data-testid="home-brief"]', { timeout: 20000 }).should('contain', 'This week in cyber threats').and('contain', 'ransomware activity rose');
      });
    });

    describe('the modules', () => {
      it('has a card per module with its figures, and opens the module', () => {
        cy.get('[aria-label="Modules"] [data-testid^="module-card-"]').should('have.length', 6);
        cy.get('[data-testid="module-card-threats-watcher"]').should('contain', '6').and('contain', 'trending words').and('contain', '6 this week').and('contain', 'RSS sources');
        cy.get('[data-testid="module-card-cyber-watch"]').should('contain', '10').and('contain', 'CVEs tracked').and('contain', 'Critical CVEs').and('contain', 'Victims (7 days)');
        cy.get('[data-testid="module-card-data-leak"]').should('contain', '4').and('contain', 'active alerts').and('contain', '3 this week');
        cy.get('[data-testid="module-card-dns-threats"]').should('contain', '20').and('contain', 'suspicious domains').and('contain', 'Takeover risks');
        cy.get('[data-testid="module-card-website-monitoring"]').should('contain', '8').and('contain', 'sites monitored').and('contain', 'Malicious');
        cy.get('[data-testid="module-card-legitimate-domains"]').should('contain', '30').and('contain', 'Expiring soon').and('contain', 'Repurchased');
        cy.get('[data-testid="module-card-website-monitoring"]').click();
        cy.location('hash').should('eq', '#/website_monitoring');
      });

      it('draws a small curve of the last days on the modules that have a history', () => {
        ['threats-watcher', 'cyber-watch', 'data-leak', 'dns-threats', 'website-monitoring'].forEach((module) => {
          cy.get(`[data-testid="module-card-${module}"] svg[role="img"][aria-label*="per day"]`).should('exist');
        });
        cy.get('[data-testid="module-card-legitimate-domains"] svg[role="img"][aria-label*="per day"]').should('not.exist');
      });

      it('splits the CVEs by severity, and flags what needs a look with a dot', () => {
        cy.get('[data-testid="module-card-cyber-watch"] [role="img"][aria-label*="critical 2"]').should('exist');
        cy.get('[data-testid="module-card-cyber-watch"] [aria-label="Needs attention"]').should('exist');
        cy.get('[data-testid="module-card-threats-watcher"] [aria-label="Needs attention"]').should('not.exist');
      });
    });

    describe('the lists', () => {
      it('lists the latest detections of every module, newest first, in a block that scrolls', () => {
        cy.get('[data-testid="home-feed"] [data-scroll="true"]').should('have.css', 'overflow-y', 'auto').within(() => {
          cy.contains('"acme" found').should('be.visible');
          cy.contains('acme-login.com').should('be.visible');
          cy.contains('phish-1.com').should('be.visible');
          cy.contains('Clinique du Nord').should('be.visible');
          cy.contains('CVE-2026-1001').should('be.visible');
          // The leak (10 minutes ago) is the newest, the ransomware victim (5 hours ago) the oldest
          cy.get('li').first().should('contain', '"acme" found');
          cy.get('li').last().should('contain', 'Clinique du Nord');
          cy.contains('acme-login.com').click();
        });
        cy.location('hash').should('eq', '#/dns_finder?threat=31');
      });

      it('keeps the lists short: the feed scrolls inside 300 pixels, and the cards do not stretch to the tallest one', () => {
        cy.get('[data-testid="home-feed"] [data-scroll="true"]').should('have.css', 'max-height', '300px');
        cy.get('[data-testid="home-trending"] li').should('have.length.at.most', 6);
        cy.get('[data-testid="home-vulnerabilities"]').then(($card) => {
          expect($card[0].getBoundingClientRect().height).to.be.lessThan(380);
        });
        cy.get('[data-testid="home-trending"]').then(($card) => {
          expect($card[0].getBoundingClientRect().height).to.be.lessThan(380);
        });
      });

      it('makes every row of the lists a real link, which opens in a new tab like any other', () => {
        cy.get('[data-testid="home-feed"] li a').first().should('have.attr', 'href', '#/data_leak?alert=21');
        cy.get('[data-testid="home-vulnerabilities"] li a').first().should('have.attr', 'href').and('include', 'cve=1');
        cy.get('[data-testid="home-trending"] li a').first().should('have.attr', 'href', '#/threats_watcher?word=1');
        cy.get('[data-testid^="home-"] li[role="button"]').should('not.exist');
      });

      it('flags the vulnerabilities exploited in the wild in the top', () => {
        cy.get('[data-testid="home-vulnerabilities"] li').first().find('[data-testid="exploited-chip"]').should('contain', 'Exploited');
        cy.get('[data-testid="home-vulnerabilities"] li').eq(1).find('[data-testid="exploited-chip"]').should('not.exist');
      });

      it('ranks the top vulnerabilities by score and opens one', () => {
        cy.get('[data-testid="home-vulnerabilities"] li').should('have.length', 2).first().should('contain', 'CVE-2026-1001').and('contain', '9.8');
        cy.contains('[data-testid="home-vulnerabilities"] a', 'All CVEs').should('have.attr', 'href').and('include', '/cyber_watch');
        cy.contains('[data-testid="home-vulnerabilities"] li', 'CVE-2026-1001').click();
        cy.location('hash').should('include', 'cve=1');
      });

      it('ranks the trending words, with the reliability of their sources, and opens one', () => {
        cy.get('[data-testid="home-trending"] li').should('have.length', 6).first().should('contain', 'microsoft').and('contain', '30');
        cy.get('[data-testid="home-trending"] li').first().find('[title="Reliability 80%"]').should('exist');
        cy.get('[data-testid="home-trending"] li').eq(2).find('[title="Reliability 20%"]').should('exist');
        cy.contains('[data-testid="home-trending"] li', 'microsoft').click();
        cy.location('hash').should('eq', '#/threats_watcher?word=1');
      });
    });

    describe('needs your attention', () => {
      const labels = () => cy.get('[data-testid="home-attention"] li').then(($rows) => [...$rows].map((row) => row.textContent));

      it('lists what waits for a decision, the worst first, with how many and a link to get there', () => {
        cy.get('[data-testid="home-attention"]').should('contain', 'Needs your attention');
        labels().then((rows) => {
          expect(rows).to.have.length(10);
          // What is exploited in the wild comes first
          expect(rows[0]).to.contain('CVEs exploited in the wild').and.contain('2');
          expect(rows[1]).to.contain('Subdomain takeover risks').and.contain('1');
          expect(rows[2]).to.contain('Legitimate domains expired');
          expect(rows[3]).to.contain('Actions waiting for your approval').and.contain('2');
          expect(rows[4]).to.contain('Watch rule matches to review').and.contain('7');
          expect(rows[8]).to.contain('DNS threats to review').and.contain('12');
          expect(rows[9]).to.contain('Website changes to review').and.contain('5');
        });
        // Each line opens its page already filtered on what it counts
        cy.get('[data-testid="attention-exploited"] a').should('have.attr', 'href', '#/cyber_watch?tab=cves&cexploited=yes');
        cy.get('[data-testid="attention-takeover"] a').should('have.attr', 'href', '#/dns_finder?source=subdomain_takeover');
        cy.get('[data-testid="attention-expired"] a').should('have.attr', 'href', '#/legitimate_domains?status=expired');
        cy.get('[data-testid="attention-expiring"] a').should('have.attr', 'href', '#/legitimate_domains?status=expiring_soon');
        cy.get('[data-testid="attention-ssl"] a').should('have.attr', 'href', '#/legitimate_domains?ssl=expiring_soon');
        cy.get('[data-testid="attention-sites"] a').should('have.attr', 'href', '#/website_monitoring?tab=changes');
        cy.get('[data-testid="attention-leaks"] a').click();
        cy.location('hash').should('eq', '#/data_leak');
      });

      it('opens the window of the approvals from its line', () => {
        cy.intercept('GET', '/api/common/pending_actions/?*', { statusCode: 200, body: page([]) });
        cy.get('[data-testid="attention-pending"] button').click();
        cy.get('[role="dialog"]').should('be.visible');
      });

      it('leaves out the lines at zero', () => {
        mockOverview(true, { leaks: { ...LEAKS, activeAlerts: 0 }, pending: { count: 0 } });
        cy.reload();
        cy.get('[data-testid="home-attention"]', { timeout: 20000 }).should('be.visible');
        cy.get('[data-testid="attention-leaks"]').should('not.exist');
        cy.get('[data-testid="attention-pending"]').should('not.exist');
        cy.get('[data-testid="attention-takeover"]').should('exist');
      });

      it('says so when nothing needs attention', () => {
        mockOverview(true, {
          pending: { count: 0 },
          cyber: { ...CYBER, cves: { ...CYBER.cves, exploited: 0 }, hits: { ...CYBER.hits, open: 0 } },
          leaks: { ...LEAKS, activeAlerts: 0 },
          dns: { ...DNS, openAlerts: 0, openTakeover: 0 },
          sites: { ...SITES, openAlerts: 0 },
          domains: { ...DOMAINS, expired: 0, expiringSoon: 0, sslExpiringSoon: 0 },
        });
        cy.reload();
        cy.get('[data-testid="attention-clear"]', { timeout: 20000 }).should('contain', 'Nothing needs your attention');
      });
    });

    describe('the page', () => {
      it('is made of the blocks of the overview only: no cloud, map or lists of CVEs and victims', () => {
        cy.get('[data-testid^="home-block-"]').should('have.length', 8);
        ['setup', 'week', 'brief', 'attention', 'modules', 'feed', 'vulnerabilities', 'trending'].forEach((id) => cy.get(`[data-testid="home-block-${id}"]`).should('exist'));
        cy.get('[aria-label="Needs attention"]').filter('section').should('not.exist');
        cy.get('[data-testid="word-cloud"], [data-testid="world-map"], [data-testid="dashboard-cves"], [data-testid="dashboard-victims"]').should('not.exist');
      });

      it('puts the week next to the brief, then the modules, then the three lists', () => {
        cy.get('[data-testid="home-hero"]').children().should('have.length', 2);
        cy.get('[data-testid="home-block-week"]').then(($week) => {
          const week = $week[0].getBoundingClientRect();
          const brief = Cypress.$('[data-testid="home-block-brief"]')[0].getBoundingClientRect();
          const modules = Cypress.$('[data-testid="home-block-modules"]')[0].getBoundingClientRect();
          expect(Math.abs(week.top - brief.top)).to.be.lessThan(4);
          expect(brief.left).to.be.greaterThan(week.right - 4);
          expect(modules.top).to.be.greaterThan(week.bottom - 4);
        });
        cy.get('[data-testid="home-lists"]').children().should('have.length', 3);
      });
    });

    describe('the blocks of the page', () => {
      it('hides and shows a block from the Customise window, and keeps the choice on the account', () => {
        cy.contains('button', 'Customise').click();
        cy.get('[role="dialog"]').within(() => {
          cy.get('input[aria-label="Modules"]').should('be.checked').uncheck();
        });
        cy.wait('@patchProfile').its('request.body').should('deep.equal', { preferences: { home: { hidden: ['modules'] } } });
        cy.get('[data-testid="home-block-modules"]').should('not.exist');
        cy.get('[role="dialog"]').within(() => {
          cy.get('input[aria-label="Trending now"]').should('be.checked').uncheck();
        });
        cy.wait('@patchProfile').its('request.body').should('deep.equal', { preferences: { home: { hidden: ['modules', 'trending'] } } });
        cy.get('[data-testid="home-block-trending"]').should('not.exist');
        cy.get('[data-testid="home-lists"]').children().should('have.length', 2);
        cy.contains('[role="dialog"] button', 'Done').click();
        cy.get('[role="dialog"]').should('not.exist');
      });

      it('goes back to everything with Reset', () => {
        cy.contains('button', 'Customise').click();
        cy.get('[role="dialog"] input[aria-label="Top vulnerabilities"]').uncheck();
        cy.wait('@patchProfile');
        cy.get('[data-testid="home-block-vulnerabilities"]').should('not.exist');
        cy.contains('[role="dialog"] button', 'Reset').click();
        cy.wait('@patchProfile').its('request.body').should('deep.equal', { preferences: { home: { hidden: [] } } });
        cy.get('[data-testid="home-block-vulnerabilities"]').should('exist');
      });

      it('lets the others reflow when a block is hidden, and says so when none is left', () => {
        cy.contains('button', 'Customise').click();
        cy.get('[role="dialog"] input[type="checkbox"]:checked').each(($box) => cy.wrap($box).uncheck());
        cy.contains('[role="dialog"] button', 'Done').click();
        cy.get('[data-testid="home-empty"]').should('contain', 'Every block is hidden');
        cy.contains('button', 'Choose the blocks').click();
        cy.contains('Customise the home page').should('be.visible');
      });

      it('applies the choice saved on the account', () => {
        cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: 'bootstrap', preferences: { home: { hidden: ['feed', 'trending'] } }, avatar_color: null } });
        cy.reload();
        cy.get('[data-testid="home-block-modules"]', { timeout: 20000 }).should('exist');
        cy.get('[data-testid="home-block-feed"]').should('not.exist');
        cy.get('[data-testid="home-block-trending"]').should('not.exist');
        cy.get('[data-testid="home-block-vulnerabilities"]').should('exist');
      });
    });

    it('sends the old Threats Watcher links to its new page', () => {
      cy.visit('/#/?word=1');
      cy.location('hash').should('eq', '#/threats_watcher?word=1');
    });
  });

  describe('visitor', () => {
    it('shows the public blocks only: the week without the modules that need an account', () => {
      cy.on('uncaught:exception', () => false);
      cy.intercept('GET', '/api/auth/user', { statusCode: 401, body: { detail: 'Authentication credentials were not provided.' } });
      mockOverview(false);
      cy.visit('/#/');
      // The news of the world, not what concerns an organisation
      cy.get('[data-testid="week-hero"]', { timeout: 20000 }).should('contain', '14').and('contain', 'CVEs').and('contain', 'Ransomware victims').and('not.contain', 'Data leaks').and('not.contain', 'Watch rule matches');
      cy.get('@overview.all').should('have.length', 1);
      cy.get('[aria-label="Modules"] [data-testid^="module-card-"]').should('have.length', 3);
      cy.get('[data-testid="home-block-feed"]').should('not.exist');
      cy.get('[data-testid="home-block-attention"]').should('not.exist');
      cy.get('[data-testid="home-block-setup"]').should('not.exist');
      cy.get('[data-testid="home-block-vulnerabilities"]').should('exist');
    });
  });
});
