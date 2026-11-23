// Threats Watcher (home page): trends (briefing, KPI quick filters, word cloud, word drawer with the AI summary, monitor /
// ban / delete), monitored keywords, RSS sources (bulk reliability), banned words, Insights and the anonymous view.
// All API calls are mocked.
describe('Threats Watcher', () => {
  const USER = { id: 1, username: 'analyst', first_name: 'Ana', last_name: 'Lyst', email: '', is_superuser: true, is_staff: false, groups: [], permissions: [] };
  const API = '/api/threats_watcher/';
  const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString().slice(0, 19);
  const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  const NAMES = ['lockbit', 'ivanti', 'cve-2026-1234', 'phishing', 'fortinet', 'akira', 'citrix', 'ransomware', 'botnet', 'apt29', 'zero-day', 'exchange'];
  const WORDS = NAMES.map((name, i) => ({ id: i + 1, name, occurrences: 40 - i * 3, score: [100, 74, 50, 20][i % 4], created_at: ago(i * 500), posts_count: 40 - i * 3,
    // How each word is doing now: hot (6 today, none before), rising (4 against 1 a day), steady (1 against 1), fading (none today)
    mentions_24h: [6, 4, 1, 0][i % 4], mentions_week: [6, 10, 7, 3][i % 4], rising: [6, 3, 0, -0.5][i % 4],
    daily: [0, 0, 1, 0, 2, 1, [6, 4, 1, 0][i % 4]] }));
  const POSTS = Array.from({ length: 6 }, (_, i) => ({ url: `https://www.cert.example/advisory-${i}`, created_at: ago(i * 1500) }));
  const KEYWORDS = [
    { id: 1, name: 'acme', level: 'hot', level_display: 'Hot', threshold: 3, last_seen: ago(90), occurrences: 4, posts_count: 4, created_at: ago(20000), last_event: null },
    { id: 2, name: 'acme-corp', level: 'warm', level_display: 'Warm', threshold: 1, last_seen: null, occurrences: 0, posts_count: 0, created_at: ago(9000), last_event: null },
  ];
  const SOURCES = [
    { id: 1, url: 'https://www.cert.ssi.gouv.fr/feed/', confident: 1, country: 'France', country_code: 'FR', last_status_code: 200, last_checked: ago(20), created_at: ago(50000), last_event: null },
    { id: 2, url: 'https://blog.example.com/rss', confident: 3, country: 'United States', country_code: 'US', last_status_code: 404, last_checked: ago(20), created_at: ago(30000), last_event: null },
    { id: 3, url: 'https://news.example.org/feed', confident: 2, country: 'Germany', country_code: 'DE', last_status_code: null, last_checked: null, created_at: ago(10), last_event: null },
  ];
  const BANNED = [{ id: 1, name: 'newsletter', created_at: ago(5000), last_event: null }];
  const STATS = {
    totalWords: 12, newToday: 2, newThisWeek: 7, totalSources: 3, minTitles: 5, failingSources: 1, bannedWords: 1, monitoredKeywords: 2, monitoredSeen: 1,
    monitoredByLevel: { hot: 1, warm: 1 }, topWords: WORDS.slice(0, 8).map(({ name, occurrences }) => ({ name, occurrences })),
    wordsPerDay: Array.from({ length: 30 }, (_, i) => ({ date: day(i - 29), count: i % 4 })),
    articlesPerDay: Array.from({ length: 30 }, (_, i) => ({ date: day(i - 29), count: 20 + (i % 7) * 5 })),
    sourcesByCountry: [{ code: 'FR', country: 'France', count: 1 }, { code: 'US', country: 'United States', count: 1 }, { code: 'DE', country: 'Germany', count: 1 }],
    sourcesByConfidence: { 1: 1, 2: 1, 3: 1 },
  };
  // Same shape as summary_manager.py: one "• summary" line per topic, then an indented line of details.
  const WEEKLY = {
    id: 1, type: 'weekly_summary', keywords: '', created_at: ago(3000), updated_at: ago(3000),
    summary_text: [
      '• Ivanti patched an actively exploited flaw in Connect Secure that lets attackers run code without signing in.',
      '  Products: Connect Secure, Policy Secure | CVEs: CVE-2026-1234 (https://nvd.nist.gov/vuln/detail/CVE-2026-1234)',
      '',
      '• LockBit claimed attacks on three hospitals this week.',
      '  Threat actors: LockBit',
      '',
      '• A phishing campaign abuses fake invoices to spread a loader.',
    ].join('\n'),
  };
  const BREAKING = { id: 2, type: 'breaking_news', keywords: 'ivanti', summary_text: 'Ivanti zero-day exploited in the wild.', created_at: ago(60), updated_at: ago(60) };
  const WORD_SUMMARY = { id: 3, type: 'trendy_word_summary', keywords: 'lockbit', summary_text: 'LockBit claimed three new victims.', created_at: ago(1), updated_at: ago(1) };
  const page = (results) => ({ count: results.length, next: null, previous: null, results });
  // `cy.wait` hands back the first request nobody waited for yet (the page load); a filter is checked on the last one.
  const expectLastRequest = (alias, text) => cy.get(`@${alias}.all`).should((calls) => expect(calls.at(-1).request.url).to.include(text));
  // Set once the word summary is written, from then on the summaries list returns it.
  let summarized = false;

  const mockApi = () => {
    summarized = false;
    cy.intercept('GET', `${API}trendyword/?*`, { statusCode: 200, body: page(WORDS) }).as('words');
    cy.intercept('GET', '/api/threats_watcher/favicon/?*', { statusCode: 404, body: '' });
    cy.intercept('GET', `${API}trendyword/1/`, { statusCode: 200, body: { ...WORDS[0], posts: POSTS, monitored: false } });
    cy.intercept('GET', `${API}summary/?*`, (req) => {
      const byType = { weekly_summary: [WEEKLY], breaking_news: [BREAKING] };
      req.reply({ statusCode: 200, body: summarized ? [WORD_SUMMARY] : (byType[req.query.type] ?? []) });
    });
    cy.intercept('GET', `${API}monitored-keywords/?*`, { statusCode: 200, body: page(KEYWORDS) }).as('keywords');
    cy.intercept('GET', `${API}monitored-keywords/1/`, { statusCode: 200, body: { ...KEYWORDS[0], posts: POSTS.slice(0, 4) } });
    cy.intercept('GET', `${API}source/?*`, { statusCode: 200, body: page(SOURCES) }).as('sources');
    // Declared after the list: `source/?*` also matches `source/statistics/`, and the last intercept wins.
    cy.intercept('GET', `${API}source/statistics/`, { statusCode: 200, body: STATS });
    // The victims by country, for the world map
    cy.intercept('GET', '/api/cyber_watch/statistics/', { statusCode: 200, body: { cves: { total: 0, critical7d: 0, new7d: 0, bySeverity: {}, perDay: [] }, victims: { total: 20, new7d: 9, byCountry: [{ name: 'US', count: 12 }, { name: 'DE', count: 5 }, { name: 'FR', count: 3 }] }, hits: { open: 0 } } });
    cy.intercept('GET', `${API}source/2/`, { statusCode: 200, body: SOURCES[1] });
    cy.intercept('GET', `${API}bannedword/?*`, { statusCode: 200, body: page(BANNED) });
    cy.intercept('GET', '/api/timeline/events/?*', { statusCode: 200, body: [] });
  };

  describe('signed in', () => {
    beforeEach(() => {
      cy.on('uncaught:exception', () => false);
      cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: USER });
      cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: 'bootstrap', preferences: {}, avatar_color: null } });
      mockApi();
      cy.visit('/#/threats_watcher', { onBeforeLoad: (win) => win.localStorage.setItem('token', 'mock-token-threats') });
      cy.get('[data-testid="word-row"]', { timeout: 20000 }).should('have.length', 12);
    });

    it('shows the breaking news and the weekly digest, with real links only', () => {
      cy.get('[data-testid="breaking-news"]').should('contain', 'Ivanti zero-day exploited in the wild.');
      cy.get('[data-testid="weekly-summary"]').within(() => {
        cy.contains('a', 'CVE-2026-1234').should('have.attr', 'href', 'https://nvd.nist.gov/vuln/detail/CVE-2026-1234');
        cy.get('li').should('have.length', 2);
        cy.contains('button', 'Read the whole digest - 3 topics').click();
        cy.get('li').should('have.length', 3);
      });
    });

    it('keeps the word alone in its column, and the date on the right', () => {
      cy.get('thead th').then(($th) => expect([...$th].map((th) => th.textContent)).to.deep.equal(['Word', 'Activity', 'Trend', 'Reliability', 'First seen']));
      cy.get('[data-testid="word-row"]').first().within(() => {
        cy.get('td').first().invoke('text').should('eq', 'lockbit');
        cy.get('td').last().should('not.be.empty');
        cy.get('[data-testid="mini-bars"]').should('exist');
        cy.contains('6 articles this week');
      });
    });

    it('puts the words that jump first, and says how each one is doing now in a word', () => {
      // Rising is the default order of the table (the cloud, next to it, has its own)
      cy.get('@words.all').should((calls) => expect(calls.some((c) => c.request.url.includes('ordering=-rising') && c.request.url.includes('page_size=25'))).to.eq(true));
      const heat = (word) => cy.contains('[data-testid="word-row"]', word).find('[data-testid="heat"]');
      heat('lockbit').should('contain', 'Hot').and('have.attr', 'data-heat', 'hot');
      heat('ivanti').should('contain', 'Rising');
      heat('cve-2026-1234').should('contain', 'Steady');
      heat('phishing').should('contain', 'Fading');
    });

    it('sorts by the activity of the week, kept in the URL', () => {
      // A click on another column sorts ascending, a second one descending
      cy.contains('.MuiTableSortLabel-root', 'Activity').click();
      cy.location('hash').should('include', 'sort=mentions_week');
      expectLastRequest('words', 'ordering=mentions_week');
      cy.contains('.MuiTableSortLabel-root', 'Activity').click();
      cy.location('hash').should('include', 'sort=-mentions_week');
      // Back to the default order, which is not kept in the URL
      cy.contains('.MuiTableSortLabel-root', 'Trend').click();
      cy.location('hash').should('include', 'sort=rising');
      expectLastRequest('words', 'ordering=rising');
      cy.contains('.MuiTableSortLabel-root', 'Trend').click();
      cy.location('hash').should('not.include', 'sort=');
    });

    describe('the cloud', () => {
      it('colours the words by their heat and says what the colours mean', () => {
        cy.get('[data-testid="cloud-legend"]').should('contain', 'Hot').and('contain', 'Rising').and('contain', 'New').and('contain', 'Steady').and('contain', 'Fading');
        cy.get('[data-testid="word-cloud"] [aria-label^="lockbit,"]').should('have.attr', 'data-heat', 'hot').and('have.attr', 'aria-label').and('include', '6 articles in the last 24 h');
        cy.get('[data-testid="word-cloud"] [aria-label^="ivanti,"]').should('have.attr', 'data-heat', 'rising');
        cy.get('[data-testid="word-cloud"] [aria-label^="lockbit,"]').then(($hot) => {
          const steady = Cypress.$('[data-testid="word-cloud"] [data-heat="steady"]')[0];
          expect($hot.attr('fill')).not.to.eq(steady.getAttribute('fill'));
        });
      });

      it('shows what is talked about this week, or the most mentioned of all time', () => {
        cy.get('@words.all').should((calls) => expect(calls.some((c) => c.request.url.includes('ordering=-mentions_week') && c.request.url.includes('page_size=40'))).to.eq(true));
        cy.contains('h2', 'Talked about now').should('exist');
        cy.contains('button', 'All time').click();
        cy.contains('h2', 'Most mentioned, all time').should('exist');
        cy.get('@words.all').should((calls) => expect(calls.some((c) => c.request.url.includes('ordering=-occurrences') && c.request.url.includes('page_size=40'))).to.eq(true));
      });
    });

    it('filters from the KPI cards and the search, all kept in the URL', () => {
      cy.contains('button', 'New today').click();
      expectLastRequest('words', 'period=today');
      cy.location('hash').should('include', 'period=today');
      cy.contains('button', 'Trending words').click();
      cy.location('hash').should('not.include', 'period=');
      cy.get('input[aria-label="Search words"]').type('lock');
      expectLastRequest('words', 'search=lock');
    });

    it('shows the world map next to the word cloud, with its layers, and opens a country', () => {
      // Side by side from 1200 pixels of width
      cy.viewport(1440, 900);
      cy.get('[data-testid="world-map-card"]').should('be.visible');
      // The grid has two columns only once the cloud has its words: the check retries until the layout has settled
      cy.get('[data-testid="world-map-card"]').should(($map) => {
        const map = $map[0].getBoundingClientRect();
        const $cloud = Cypress.$('[data-testid="word-cloud"]');
        expect($cloud.length, 'word cloud').to.be.greaterThan(0);
        const cloud = $cloud[0].getBoundingClientRect();
        // Side by side on a wide screen: the map is on the right of the cloud, and they start at the same height
        expect(map.left).to.be.greaterThan(cloud.right - 4);
        expect(Math.abs(map.top - $cloud.closest('.MuiCard-root')[0].getBoundingClientRect().top)).to.be.lessThan(4);
      });
      cy.get('[data-testid="world-map"]').should('have.attr', 'aria-label').and('include', '20 ransomware victims');
      cy.contains('[data-testid="world-map-card"] button', /^Sources$/).click();
      cy.get('[data-testid="world-map"]').should('have.attr', 'aria-label').and('include', 'RSS sources');
    });

    it('opens a word from the cloud, writes its summary, then monitors and bans it', () => {
      cy.intercept('GET', `${API}summary/by-keyword/lockbit/`, (req) => {
        summarized = true;
        req.reply({ statusCode: 200, body: WORD_SUMMARY });
      }).as('summarize');
      cy.intercept('POST', `${API}monitored-keywords/`, (req) => req.reply({ statusCode: 201, body: { ...KEYWORDS[1], id: 9, ...req.body } })).as('monitor');
      cy.intercept('POST', `${API}trendyword/1/ban/`, { statusCode: 200, body: { detail: 'banned' } }).as('ban');
      cy.get('[data-testid="word-cloud"] [aria-label^="lockbit,"]').click();
      cy.location('hash').should('include', 'word=1');
      cy.get('.MuiDrawer-paper').within(() => {
        cy.get('[data-testid="word-articles"] a').should('have.length', 6);
        cy.get('[data-testid="mentions-chart"] svg').should('exist');
        cy.contains('button', 'Summarize the articles').click();
      });
      cy.wait('@summarize');
      cy.get('.MuiDrawer-paper').should('contain', 'LockBit claimed three new victims.');
      cy.get('.MuiDrawer-paper').contains('button', 'Monitor').click();
      cy.wait('@monitor').its('request.body').should('deep.equal', { name: 'lockbit', level: 'warm' });
      cy.get('.MuiDrawer-paper').contains('button', 'Ban').click();
      cy.contains('[role="dialog"]', 'Ban “lockbit”?').contains('button', /^Ban$/).click();
      cy.wait('@ban');
      cy.location('hash').should('not.include', 'word=');
    });

    it('filters, opens and adds monitored keywords', () => {
      cy.intercept('POST', `${API}monitored-keywords/`, (req) => req.reply({ statusCode: 201, body: { ...KEYWORDS[1], id: 9, ...req.body } })).as('add');
      cy.contains('[role="tab"]', 'Monitored keywords').click();
      cy.get('[data-testid="keyword-row"]').should('have.length', 2).first().should('contain', 'Hot');
      cy.get('[role="combobox"]').eq(0).click();
      cy.contains('[role="option"]', 'Hot').click();
      expectLastRequest('keywords', 'level=hot');
      cy.location('hash').should('include', 'klevel=hot');
      cy.contains('button', 'Clear').click();
      cy.get('[data-testid="keyword-row"]').first().click();
      cy.location('hash').should('include', 'keyword=1');
      cy.get('[data-testid="keyword-articles"] a').should('have.length', 4);
      cy.get('body').type('{esc}');
      cy.contains('button', /^Add$/).click();
      cy.contains('[role="menuitem"]', 'Monitored keywords').click();
      cy.location('hash').should('include', 'dialog=add-keyword');
      cy.get('[role="dialog"]').within(() => {
        cy.get('input[name="name"]').type('acme-labs');
        cy.contains('[role="radio"]', 'Super hot').click();
        cy.contains('button', /^Add$/).click();
      });
      cy.wait('@add').its('request.body').should('deep.equal', { name: 'acme-labs', level: 'super_hot', all_of: [], any_of: [], exceptions: [], whole_words: false, is_active: true });
    });

    it('says why a word is in the list, behind an icon', () => {
      cy.get('[data-testid="word-row"]').first().click();
      cy.get('[data-testid="word-why"]').trigger('mouseover');
      cy.get('[role="tooltip"]').should('contain', 'at least 5 article titles').and('contain', 'every 30 minutes');
    });

    describe('the window of a word', () => {
      beforeEach(() => {
        cy.get('[data-testid="word-row"]').first().click();
        cy.get('.MuiDrawer-paper').should('contain', 'lockbit');
      });

      it('starts with how the word is doing, in a sentence, then its reliability and its first sighting', () => {
        // The top says one thing: how the word is doing. The rest is in the foot of the window.
        cy.get('[data-testid="word-heat"]').should('contain', 'Hot').and('contain', '6 articles in the last 24 h, not seen the days before').and('not.contain', 'First seen').and('not.contain', 'High');
        cy.get('[data-testid="word-details"]').should('contain', 'Reliability').and('contain', 'First seen');
        cy.get('[data-testid="word-heat"] [data-testid="mini-bars"]').should('exist');
        cy.get('.MuiDrawer-paper').should('contain', 'First seen').and('contain', 'High');
        cy.get('.MuiDrawer-paper').should('not.contain', 'Why it is here:');
      });

      it('lists where it was mentioned by day, with a readable title for each article', () => {
        cy.get('.MuiDrawer-paper').contains('h3', 'Where it was mentioned').parent().should('contain', '6 articles from 1 site');
        cy.get('[data-testid="word-articles"] a').should('have.length', 6).first().should('contain', 'Advisory 0').and('contain', 'cert.example');
        cy.get('[data-testid="word-articles"]').should('contain', 'Today');
        cy.get('.MuiDrawer-paper').should('not.contain', 'Articles (6)');
      });

      it('marks the articles you opened, and keeps the mark', () => {
        cy.get('[data-testid="word-articles"] a').each(($a) => {
          $a.attr('target', '_self');
          $a.on('click', (e) => e.preventDefault());
        });
        cy.get('[data-testid="word-articles"] a').first().should('have.attr', 'data-read', 'false');
        cy.get('[data-testid="word-articles"] a').first().click();
        cy.get('[data-testid="word-articles"] a').first().should('have.attr', 'data-read', 'true').and('contain', 'Read');
        cy.get('[data-testid="word-articles"] a[data-read="true"]').should('have.length', 1);
        // Kept on the browser: still marked once the page is loaded again
        cy.reload();
        cy.get('[data-testid="word-articles"] a', { timeout: 20000 }).first().should('have.attr', 'data-read', 'true');
        cy.get('[data-testid="word-articles"] a').eq(1).should('have.attr', 'data-read', 'false');
      });
    });

    it('says what a normal day is in whole numbers, not with decimals', () => {
      // 4 today, 10 in the week: 6 over the 6 days before, so normally about 1 a day
      cy.contains('[data-testid="word-row"]', 'ivanti').find('[data-testid="heat"]').trigger('mouseover');
      cy.get('[role="tooltip"]').should('contain', '4 articles in the last 24 h, normally about 1 a day').and('not.contain', '0.');
    });

    it('shows the icon of each site, or its first letter when the site has none', () => {
      cy.intercept('GET', '/api/threats_watcher/favicon/?*', (req) => {
        if (req.query.host === 'cert.example') req.reply({ statusCode: 200, headers: { 'content-type': 'image/png' }, fixture: 'favicon.png,null' });
        else req.reply({ statusCode: 404, body: '' });
      }).as('favicon');
      cy.intercept('GET', `${API}trendyword/3/`, { statusCode: 200, body: { ...WORDS[2], posts: [{ url: 'https://bsky.app/profile/technijian.bsky.social/post/3n2lsf3pfea27', created_at: ago(30) }, ...POSTS], monitored: false } });
      cy.visit('/#/threats_watcher?word=3');
      cy.get('[data-testid="word-articles"]', { timeout: 20000 });
      // The site of the articles has its icon (the image really loads), asked of Watcher and not of the site
      cy.get('[data-testid="word-articles"] [data-testid="favicon"]').first().should(($img) => expect($img[0].naturalWidth).to.be.greaterThan(0));
      cy.get('@favicon.all').then((calls) => calls.forEach((c) => expect(new URL(c.request.url).pathname).to.eq('/api/threats_watcher/favicon/')));
      // The site with no icon shows its first letter
      cy.contains('[data-testid="word-articles"] li', 'bsky.app').find('[data-testid="favicon-fallback"]').should('contain', 'b');
    });

    it('opens a CVE in Cyber Watch from its window', () => {
      cy.intercept('GET', `${API}trendyword/3/`, { statusCode: 200, body: { ...WORDS[2], posts: [{ url: 'https://bsky.app/profile/technijian.bsky.social/post/3n2lsf3pfea27', created_at: ago(30) }, ...POSTS], monitored: false } });
      cy.visit('/#/threats_watcher?word=3');
      cy.get('.MuiDrawer-paper', { timeout: 20000 }).contains('a', 'Open in Cyber Watch').should('have.attr', 'href').and('include', 'cq=cve-2026-1234');
      // An article whose address ends with a number shows the part before it, not the number
      cy.get('[data-testid="word-articles"] a').first().should('contain', 'Technijian.bsky.social').and('not.contain', '3n2lsf3pfea27');
    });

    it('reads a rule back as a sentence', () => {
      cy.contains('[role="tab"]', 'Monitored keywords').click();
      cy.contains('button', /^Add$/).click();
      cy.contains('[role="menuitem"]', 'Monitored keywords').click();
      cy.get('[role="dialog"]').within(() => {
        cy.contains('label', 'Rule: several words').click();
        cy.get('[data-testid="rule-sentence"]').should('not.exist');
        cy.get('textarea[name="all_of"]').type('Lazarus, Acme');
        cy.get('textarea[name="any_of"]').type('Globex');
        cy.get('textarea[name="exceptions"]').type('webinar');
        cy.get('[data-testid="rule-sentence"]').should('contain', 'contains Lazarus and Acme, and at least one of Globex, but never webinar');
      });
    });

    it('lists the monitored keywords newest first and explains the alert levels', () => {
      cy.contains('[role="tab"]', 'Monitored keywords').click();
      cy.get('[data-testid="keyword-row"]').should('have.length', 2);
      expectLastRequest('keywords', 'ordering=-created_at');
      cy.contains('button', /^Add$/).click();
      cy.contains('[role="menuitem"]', 'Monitored keywords').click();
      cy.get('[role="dialog"]').within(() => {
        cy.contains('[role="radio"]', 'Warm').should('contain', 'Under 3').and('have.attr', 'aria-checked', 'true');
        cy.contains('[role="radio"]', 'Hot').should('contain', '3 to 9').and('have.attr', 'aria-checked', 'false');
        cy.contains('[role="radio"]', 'Super hot').should('contain', '10 or more').click().should('have.attr', 'aria-checked', 'true');
      });
    });

    describe('importing a file', () => {
    // The file chosen through the zone's input, or dropped on the zone: the same in every form
    const choose = (contents, fileName) =>
      cy.get('[data-testid="list-file"]').selectFile({ contents: Cypress.Buffer.from(contents), fileName }, { force: true });
    const many = (n, make) => Array.from({ length: n }, (_, i) => make(i + 1));

      it('reads a file of monitored keywords: the column named keyword of a CSV', () => {
        cy.contains('[role="tab"]', 'Monitored keywords').click();
        cy.contains('button', /^Add$/).click();
        cy.contains('[role="menuitem"]', 'Monitored keywords').click();
        cy.get('[data-testid="file-dropzone"]').should('contain', 'one keyword per line - up to 500 keywords');
        choose('id;keyword\n1;lazarus\n2;acme\n3;LAZARUS\n', 'keywords.csv');
        cy.get('textarea[name="name"]').should('have.value', 'lazarus\nacme');
        cy.get('[data-testid="import-summary"]').should('contain', 'Read 2 keywords from keywords.csv (column "keyword", 1 repeated value ignored)');
        cy.contains('2 monitored keywords detected');
      });

      it('refuses too many monitored keywords and another kind of file', () => {
        cy.contains('[role="tab"]', 'Monitored keywords').click();
        cy.contains('button', /^Add$/).click();
        cy.contains('[role="menuitem"]', 'Monitored keywords').click();
        choose(many(501, (n) => 'kw' + n).join('\n'), 'huge.txt');
        cy.get('[data-testid="import-error"]').should('contain', 'huge.txt has 501 keywords').and('contain', 'the most one import takes is 500');
        cy.get('[data-testid="file-dropzone"]').selectFile({ contents: Cypress.Buffer.from('%PDF'), fileName: 'notes.pdf' }, { action: 'drag-drop' });
        cy.get('[data-testid="import-error"]').should('contain', 'notes.pdf is not a .txt or .csv file');
      });

      it('has no file zone for a rule', () => {
        cy.contains('[role="tab"]', 'Monitored keywords').click();
        cy.contains('button', /^Add$/).click();
        cy.contains('[role="menuitem"]', 'Monitored keywords').click();
        cy.get('[data-testid="file-dropzone"]').should('exist');
        cy.contains('label', 'Rule: several words').click();
        cy.get('[data-testid="file-dropzone"]').should('not.exist');
      });

      it('reads a file of banned words, skipping a header word', () => {
        cy.contains('[role="tab"]', 'Banned words').click();
        cy.contains('button', /^Add$/).click();
        cy.contains('[role="menuitem"]', 'Banned words').click();
        cy.get('[data-testid="file-dropzone"]').should('contain', 'one banned word per line - up to 1,000 banned words');
        choose('word\nlockbit\nakira\n', 'words.txt');
        cy.get('textarea[name="name"]').should('have.value', 'lockbit\nakira');
        cy.get('[data-testid="import-summary"]').should('contain', 'Read 2 banned words from words.txt (one per line, "word" header ignored)');
      });

      it('reads a file of feeds one line at a time: a comma stays in its URL', () => {
        cy.contains('[role="tab"]', 'Sources').click();
        cy.contains('button', /^Add$/).click();
        cy.contains('[role="menuitem"]', 'RSS source').click();
        cy.get('[data-testid="file-dropzone"]').should('contain', 'one feed URL per line - up to 200 feed URLs');
        choose('url\nhttps://a.example/feed?tags=x,y\nhttps://b.example/rss\n', 'feeds.txt');
        cy.get('textarea[name="url"]').should('have.value', 'https://a.example/feed?tags=x,y\nhttps://b.example/rss');
        cy.get('[data-testid="import-summary"]').should('contain', 'Read 2 feed URLs from feeds.txt (one per line, "url" header ignored)');
        cy.get('[data-testid="import-warning"]').should('not.exist');
      });

      it('warns that a long list of feeds makes each pass longer, and refuses more than 200', () => {
        cy.contains('[role="tab"]', 'Sources').click();
        cy.contains('button', /^Add$/).click();
        cy.contains('[role="menuitem"]', 'RSS source').click();
        choose(many(60, (n) => 'https://feed' + n + '.example/rss').join('\n'), 'sixty.txt');
        cy.get('[data-testid="import-warning"]').should('contain', 'every 30 minutes').and('contain', 'a long list makes each pass longer');
        choose(many(201, (n) => 'https://feed' + n + '.example/rss').join('\n'), 'huge.txt');
        cy.get('[data-testid="import-error"]').should('contain', 'huge.txt has 201 feed URLs').and('contain', 'the most one import takes is 200');
      });
    });

    it('explains the reliability of a source from 1 to 3', () => {
      cy.contains('[role="tab"]', 'Sources').click();
      cy.contains('button', /^Add$/).click();
      cy.contains('[role="menuitem"]', 'RSS source').click();
      cy.get('[role="dialog"]').within(() => {
        cy.contains('[role="radio"]', 'High').should('contain', '100 %').and('contain', 'Official sources');
        cy.contains('[role="radio"]', 'Medium').should('contain', '50 %');
        cy.contains('[role="radio"]', 'Low').should('contain', '20 %').click().should('have.attr', 'aria-checked', 'true');
        cy.contains('High from 70 %, Medium above 30 %, Low at 30 % or less');
      });
    });

    it('lists the sources with their reliability and changes it in bulk', () => {
      cy.intercept('POST', `${API}source/bulk_update/`, (req) =>
        req.reply({ statusCode: 200, body: { succeeded: 2, skipped: 0, errors: 0, ok_status: 'updated', results: req.body.ids.map((id) => ({ value: String(id), status: 'updated', reason: '', id })) } }),
      ).as('bulkUpdate');
      cy.contains('[role="tab"]', 'Sources').click();
      // 1 is the most reliable source (core.get_confidence_score).
      cy.get('[data-testid="source-row"]').eq(0).should('contain', 'cert.ssi.gouv.fr').and('contain', 'High - 100%').and('contain', 'OK');
      cy.get('[data-testid="source-row"]').eq(1).should('contain', 'Low - 20%').and('contain', 'HTTP 404');
      cy.get('[role="combobox"]').eq(1).click();
      cy.contains('[role="option"]', 'Failing').click();
      expectLastRequest('sources', 'status=failing');
      cy.contains('button', 'Clear').click();
      cy.get('[data-testid="source-row"]').eq(0).find('input[type="checkbox"]').check();
      cy.get('[data-testid="source-row"]').eq(1).find('input[type="checkbox"]').check();
      cy.contains('button', 'Set reliability…').click();
      cy.contains('[role="menuitem"]', 'Medium').click();
      cy.wait('@bulkUpdate').its('request.body').should('deep.equal', { ids: [1, 2], changes: { confident: 2 } });
    });

    it('unbans a word', () => {
      cy.intercept('DELETE', `${API}bannedword/1/`, { statusCode: 204 }).as('unban');
      cy.contains('[role="tab"]', 'Banned words').click();
      cy.get('[data-testid="banned-row"]').first().click();
      cy.get('.MuiDrawer-paper').contains('button', 'Unban').click();
      cy.contains('[role="dialog"]', 'Unban this word?').contains('button', 'Unban').click();
      cy.wait('@unban');
    });

    it('shows the insights and filters from them', () => {
      cy.contains('[role="tab"]', 'Insights').click();
      cy.get('[data-testid="articles-chart"] svg').should('exist');
      cy.get('[data-testid="words-chart"] svg').should('exist');
      cy.get('button[aria-label="Show ivanti in the trends"]').click();
      cy.location('hash').should('include', 'q=ivanti').and('not.include', 'tab=');
      // The trends are redrawn for the new search: the tabs are replaced with them, so wait for the list before using a tab
      cy.get('[data-testid="word-row"]').should('exist');
      cy.get('[data-testid="articles-chart"]').should('not.exist');
      cy.contains('[role="tab"]', 'Insights').click();
      // The tab is back with its charts once its data has arrived: clicking before that hits a list that is about to be redrawn
      cy.get('[data-testid="articles-chart"] svg').should('exist');
      cy.get('[data-testid="words-chart"] svg').should('exist');
      cy.get('button[aria-label="Show the sources of Germany"]').should('be.visible').click();
      cy.location('hash').should('include', 'tab=sources').and('include', 'scountry=DE');
    });
  });

  it('is read only for an anonymous visitor', () => {
    cy.on('uncaught:exception', () => false);
    cy.intercept('GET', '/api/auth/user', { statusCode: 401, body: { detail: 'Authentication credentials were not provided.' } });
    mockApi();
    cy.visit('/#/threats_watcher');
    cy.get('[data-testid="word-row"]', { timeout: 20000 }).should('have.length', 12);
    cy.contains('[role="tab"]', 'Banned words').should('not.exist');
    cy.contains('[role="tab"]', 'Monitored keywords').should('not.exist'); // the words of a rule are not public
    cy.contains('button', /^Add$/).should('not.exist');
    cy.get('[data-testid="word-row"]').first().click();
    cy.get('.MuiDrawer-paper').contains('button', /^(Monitor|Ban|Delete)$/).should('not.exist');
  });
});
