// Legitimate Domains module: list with KPI quick filters, filters / sort in the URL, detail drawer, add / edit /
// delete, "one per line" add, bulk actions, MISP export, Insights tab and the public view. All API calls are mocked.
describe('Legitimate Domains', () => {
  const USER = { id: 1, username: 'analyst', first_name: 'Ana', last_name: 'Lyst', email: '', is_superuser: true, is_staff: false, groups: [], permissions: [] };
  const API = '/api/common/legitimate_domains/';

  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  const DOMAINS = [
    {
      id: 1, domain_name: 'watcher-company.com', ticket_id: '240529-1a2b3', contact: 'IT team', created_at: `${day(-30)}T10:00:00`,
      domain_created_at: '2010-03-01T00:00:00', expiry: day(-3), ssl_expiry: day(12), repurchased: true,
      comments: 'Main corporate domain', misp_event_uuid: ['5f1c2d3e-0000-4000-8000-000000000001'],
      last_event: { username: 'analyst', first_name: 'Ana', last_name: 'Lyst', avatar_color: null, action: 'updated', timestamp: `${day(-1)}T09:00:00` },
    },
    {
      id: 2, domain_name: 'watcher-backup.fr', ticket_id: '', contact: '', created_at: `${day(-10)}T10:00:00`,
      domain_created_at: null, expiry: day(200), ssl_expiry: null, repurchased: false, comments: '', misp_event_uuid: [], last_event: null,
    },
  ];
  const PAGE = { count: 2, next: null, previous: null, results: DOMAINS };
  const STATS = {
    total: 2, repurchased: 1, expired: 1, unconfirmed: 0, unverified: 0, notRegistered: 0, expiringSoon: 0, noExpiry: 0, sslExpired: 0, sslExpiringSoon: 1, sslNoExpiry: 1,
    newToday: 0, newThisWeek: 0, topTlds: [{ tld: '.com', count: 1 }, { tld: '.fr', count: 1 }],
    upcoming: Array.from({ length: 12 }, (_, i) => ({ month: day(i * 30).slice(0, 7), domains: i === 6 ? 1 : 0, certificates: i === 0 ? 1 : 0 })),
  };
  const SUMMARY = (status, n) => ({
    succeeded: n, skipped: 0, errors: 0, ok_status: status,
    results: DOMAINS.slice(0, n).map((d) => ({ value: d.domain_name, status, reason: '', id: d.id })),
  });

  const mockApi = (user = USER) => {
    cy.on('uncaught:exception', () => false);
    if (user) cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: user });
    else cy.intercept('GET', '/api/auth/user', { statusCode: 401, body: { detail: 'Authentication credentials were not provided.' } });
    cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: 'bootstrap', preferences: {}, avatar_color: null } });
    cy.intercept('GET', `${API}?*`, { statusCode: 200, body: PAGE }).as('list');
    cy.intercept('GET', `${API}statistics/`, { statusCode: 200, body: STATS }).as('stats');
    cy.intercept('GET', `${API}1/`, { statusCode: 200, body: DOMAINS[0] }).as('detail');
    cy.intercept('GET', '/api/timeline/events/?*', {
      statusCode: 200,
      body: [{
        id: 9, content_type: 'common.legitimatedomain', object_id: 1, action: 'updated', action_label: 'Updated', user: 1,
        username: 'analyst', first_name: 'Ana', last_name: 'Lyst', avatar_color: null, timestamp: `${day(-1)}T09:00:00`,
        diff: { contact: { old: '', new: 'IT team' } }, object_repr: 'watcher-company.com',
      }],
    }).as('history');
  };

  const visit = (path = '') =>
    cy.visit(`/#/legitimate_domains${path}`, { onBeforeLoad: (win) => win.localStorage.setItem('token', 'mock-token-legit') });

  describe('screenshots of a domain', () => {
    const SHOTS = `${API}1/screenshots/`;
    const shot = { id: 7, url: 'https://watcher-company.com/', size: 430_000, created_at: `${day(-1)}T09:00:00`, taken_by: 'analyst' };

    // `page` is a fixture: a flat image 1280 pixels wide, as tall as the page it stands for
    const openDrawer = (page) => {
      mockApi();
      cy.intercept('GET', SHOTS, { statusCode: 200, body: { configured: true, results: [shot] } });
      cy.intercept('GET', `${SHOTS}7/image/`, { statusCode: 200, headers: { 'content-type': 'image/png' }, fixture: page });
      visit();
      cy.get('[data-testid="domain-row"]', { timeout: 20000 }).first().click();
      // The panel is below the details in the drawer: scroll to it
      cy.get('[data-testid="screenshots-panel"]', { timeout: 20000 }).scrollIntoView().should('be.visible');
    };



    it('tells that the capture of a long page shows only its top, and its size', () => {
      openDrawer('long-page.png');
      cy.get('[data-testid="long-page"]').should('contain', 'Long page').and('contain', '1280 × 4000 px');
    });

    it('says nothing for a capture that is not longer than a screen', () => {
      openDrawer('short-page.png');
      cy.get('img[alt="Latest screenshot"]').should('be.visible');
      cy.get('[data-testid="long-page"]').should('not.exist');
    });

    it('fits the whole page in the viewer', () => {
      openDrawer('long-page.png');
      cy.get('button[aria-label="View the latest screenshot"]').click();
      cy.get('button[aria-label="Fit the page"]').should('not.be.disabled').click();
      cy.get('[aria-live="polite"]').invoke('text').then((text) => {
        const percent = Number(text.replace(/\D/g, ''));
        expect(percent, 'zoom after fitting a page four times taller than wide').to.be.within(5, 40);
      });
      // The whole page is in the scroll area: the image is not taller than the area
      cy.get('[data-testid="image-viewer-scroll"]').then(($area) => {
        const img = $area.find('img')[0];
        expect(img.getBoundingClientRect().height).to.be.at.most($area[0].clientHeight);
      });
      cy.get('button[aria-label="Fit the width"]').click();
      cy.contains('[aria-live="polite"]', '100 %');
    });

    it('says why a capture could not be taken', () => {
      openDrawer('short-page.png');
      cy.intercept('POST', `${SHOTS}capture/`, {
        statusCode: 502,
        body: { error: 'The screenshot could not be taken. The site did not answer in time.' },
      }).as('capture');
      cy.contains('button', 'Take a screenshot').click();
      cy.wait('@capture');
      cy.contains('The site did not answer in time.').should('be.visible');
    });
  });

  describe('signed in', () => {
    beforeEach(() => {
      mockApi();
      visit();
      cy.get('[data-testid="domain-row"]', { timeout: 20000 }).should('have.length', 2);
    });

    it('shows the KPI cards and filters the list from them', () => {
      cy.wait('@list'); // the request of the first display, so that the next waits are the ones of the filters
      cy.contains('button', 'Expired').should('contain', '1').click();
      cy.wait('@list').its('request.url').should('include', 'status=expired');
      cy.location('hash').should('include', 'status=expired');
      cy.contains('button', 'Expired').should('have.attr', 'aria-pressed', 'true');
      cy.contains('button', 'Certificates to renew').should('contain', '1').click();
      cy.location('hash').should('include', 'ssl=attention').and('not.include', 'status=');
    });

    it('describes each domain', () => {
      cy.get('[data-testid="domain-row"]').first().within(() => {
        cy.contains('watcher-company.com');
        cy.contains('IT team - #240529-1a2b3');
        cy.contains(/^Expired /);
        cy.get('[aria-label="Repurchased"]').should('exist');
        cy.get('[aria-label="Has comments"]').should('exist');
      });
      cy.get('[data-testid="domain-row"]').eq(1).should('contain', 'Not detected yet');
    });

    it('puts search, filters, sort and page size in the request and the URL', () => {
      cy.wait('@list'); // the request of the first display
      cy.get('input[aria-label="Search domains"]').type('watcher');
      cy.wait('@list').its('request.url').should('include', 'search=watcher');
      cy.location('hash').should('include', 'q=watcher');

      cy.get('[role="combobox"]').first().click();
      cy.contains('[role="option"]', 'Needs attention').click();
      cy.wait('@list').its('request.url').should('include', 'status=attention');

      cy.contains('th [role="button"]', /^Domain$/).click();
      cy.wait('@list').its('request.url').should('include', 'ordering=domain_name');
      cy.location('hash').should('include', 'sort=domain_name');

      cy.contains('button', 'Clear').click();
      cy.location('hash').should('not.include', 'q=').and('not.include', 'status=');
    });

    it('opens a domain in the drawer, with its details and history', () => {
      cy.get('[data-testid="domain-row"]').first().click();
      cy.location('hash').should('include', 'domain=1');
      cy.wait('@history').its('request.url').should('include', 'content_type=common.legitimatedomain').and('include', 'object_id=1');
      cy.get('.MuiDrawer-paper').within(() => {
        cy.contains('#domain-drawer-title', 'watcher-company.com');
        cy.contains('Main corporate domain');
        cy.contains('5f1c2d3e-0000-4000-8000-000000000001');
        cy.get('[data-testid="event-diff"]').should('contain', 'IT team');
        cy.get('button[aria-label="Close details"]').click();
      });
      cy.get('.MuiDrawer-paper:visible').should('not.exist');
      cy.location('hash').should('not.include', 'domain=');
    });

    it('opens the drawer from a link', () => {
      visit('?domain=1');
      cy.contains('#domain-drawer-title', 'watcher-company.com', { timeout: 20000 });
    });

    it('adds a domain', () => {
      cy.intercept('POST', API, (req) => req.reply({ statusCode: 201, body: { ...DOMAINS[1], id: 3, ...req.body } })).as('create');
      cy.contains('button', 'Add domains').click();
      cy.location('hash').should('include', 'dialog=add');
      cy.get('[role="dialog"]').within(() => {
        cy.get('input[name="domain_name"]').type('new-domain.com');
        cy.get('input[name="ticket_id"]').type('bad ticket');
        cy.contains('Letters, digits, dashes and dots only');
        cy.contains('button', 'Add domain').should('be.disabled');
        cy.get('input[name="ticket_id"]').clear().type('T-1');
        cy.get('[aria-label="Domain expiry shortcuts"]').contains('+1 year').click();
        cy.contains('button', 'Add domain').click();
      });
      cy.wait('@create').its('request.body').should((body) => {
        expect(body.domain_name).to.eq('new-domain.com');
        expect(body.ticket_id).to.eq('T-1');
        expect(body.expiry).to.match(/^\d{4}-\d{2}-\d{2}$/);
        expect(body.ssl_expiry).to.eq(null);
      });
      cy.get('[role="dialog"]').should('not.exist');
      cy.location('hash').should('not.include', 'dialog=');
    });

    it('adds several domains, one per line, with a preview', () => {
      cy.intercept('POST', `${API}bulk_create/`, (req) =>
        req.reply({ statusCode: 200, body: { ...SUMMARY('created', 2), dry_run: req.body.dry_run } }),
      ).as('bulkCreate');
      cy.contains('button', 'Add domains').click();
      cy.contains('label', 'Add several, one per line').click();
      cy.get('textarea[name="domain_name"]').type('a.com\nb.com\nA.com');
      cy.contains('2 domains detected');
      cy.contains('button', 'Preview').click();
      cy.wait('@bulkCreate').its('request.body').should('deep.include', { values: 'a.com\nb.com\nA.com', dry_run: true });
      cy.contains('[role="dialog"]', 'Preview only').contains('button', 'Close').click();
      cy.contains('button', 'Add 2 domains').click();
      cy.wait('@bulkCreate').its('request.body.dry_run').should('eq', false);
      cy.contains('[role="dialog"]', '2 created').contains('button', 'Close').click();
      cy.get('[role="dialog"]').should('not.exist');
    });

    describe('importing a file of domains', () => {
      // A summary for the domains of one request, as the server would send it
      const summaryOf = (req, status = 'created') => {
        const values = req.body.values.split('\n').filter(Boolean);
        return { succeeded: values.length, skipped: 0, errors: 0, ok_status: status, dry_run: req.body.dry_run, results: values.map((value, i) => ({ value, status, reason: '', id: i + 1 })) };
      };
      const manyDomains = (n) => Array.from({ length: n }, (_, i) => `domain-${i + 1}.com`);
      const open = () => {
        cy.contains('button', 'Add domains').click();
        cy.contains('[role="dialog"]', 'Add legitimate domains').as('form');
      };
      const choose = (contents, fileName = 'domains.csv') =>
        cy.get('[data-testid="list-file"]').selectFile({ contents: Cypress.Buffer.from(contents), fileName }, { force: true });

      it('reads the column named domain of a CSV and says what it took', () => {
        open();
        choose('ticket,domain,contact\nT1,example.com,it\nT2,foo.fr,it\nT3,EXAMPLE.com,it\n');
        cy.get('textarea[name="domain_name"]').should('have.value', 'example.com\nfoo.fr');
        cy.get('[data-testid="import-summary"]').should('contain', 'Read 2 domains from domains.csv (column "domain", 1 repeated value ignored)');
        cy.contains('2 domains detected');
        cy.contains('button', 'Add 2 domains').should('exist');
      });

      it('reads the first column of a file with semicolons, quotes and no header', () => {
        open();
        choose('"a.com";x\n"b.com";y\n# a comment\n\nc.com;z\n', 'list.csv');
        cy.get('textarea[name="domain_name"]').should('have.value', 'a.com\nb.com\nc.com');
        cy.get('[data-testid="import-summary"]').should('contain', 'first column');
      });

      it('reads a text file with one domain per line, skipping a header word and the BOM of Excel', () => {
        open();
        choose('\uFEFFdomain\nexample.com\nfoo.fr\n', 'list.txt');
        cy.get('textarea[name="domain_name"]').should('have.value', 'example.com\nfoo.fr');
        cy.get('[data-testid="import-summary"]').should('contain', 'one per line, "domain" header ignored');
      });

      it('reads a file made of one line of values', () => {
        open();
        choose('a.com, b.com, c.com');
        cy.get('textarea[name="domain_name"]').should('have.value', 'a.com\nb.com\nc.com');
        cy.get('[data-testid="import-summary"]').should('contain', 'one line of values');
      });

      it('takes a file dropped on the zone', () => {
        open();
        cy.get('[data-testid="file-dropzone"]').should('contain', 'Drop a file here or click to choose').and('contain', 'TXT or CSV');
        cy.get('[data-testid="file-dropzone"]').selectFile({ contents: Cypress.Buffer.from('domain\na.com\nb.com\n'), fileName: 'dropped.csv' }, { action: 'drag-drop' });
        cy.get('textarea[name="domain_name"]').should('have.value', 'a.com\nb.com');
        cy.get('[data-testid="import-summary"]').should('contain', 'Read 2 domains from dropped.csv');
      });

      it('lights up while a file is above the zone and refuses another kind of file', () => {
        open();
        cy.get('[data-testid="file-dropzone"]').trigger('dragenter', { dataTransfer: new DataTransfer() }).should('have.attr', 'data-dragging', 'true').and('contain', 'Drop to import');
        cy.get('[data-testid="file-dropzone"]').trigger('dragleave').should('have.attr', 'data-dragging', 'false');
        cy.get('[data-testid="file-dropzone"]').selectFile({ contents: Cypress.Buffer.from('%PDF-1.4'), fileName: 'notes.pdf' }, { action: 'drag-drop' });
        cy.get('[data-testid="import-error"]').should('contain', 'notes.pdf is not a .txt or .csv file');
      });

      it('says when a file has no domain, or too many', () => {
        open();
        choose('# nothing here\n\n');
        cy.get('[data-testid="import-error"]').should('contain', 'No domain found in domains.csv');
        choose(manyDomains(2001).join('\n'), 'huge.txt');
        cy.get('[data-testid="import-error"]').should('contain', 'huge.txt has 2,001 domains').and('contain', 'Split the file');
        // Nothing was taken from the refused files: the field stays the single line it was
        cy.get('input[name="domain_name"]').should('have.value', '');
      });

      it('sends a long list in batches of 200 and adds the batches up', () => {
        const bodies = [];
        cy.intercept('POST', `${API}bulk_create/`, (req) => {
          bodies.push(req.body);
          req.reply({ statusCode: 200, body: summaryOf(req) });
        }).as('bulkCreate');
        open();
        choose(manyDomains(450).join('\n'), 'big.txt');
        cy.contains('450 domains detected').and('contain', 'Sent in 3 batches of 200');
        cy.contains('button', 'Add 450 domains').click();
        cy.get('@bulkCreate.all').should('have.length', 3).then(() => {
          expect(bodies.map((b) => b.values.split('\n').length)).to.deep.equal([200, 200, 50]);
          expect(bodies.every((b) => b.dry_run === false)).to.equal(true);
        });
        cy.contains('[role="dialog"]', '450 created').within(() => {
          cy.get('[data-testid="bulk-result-hidden"]').should('contain', 'Only the skipped and the errors are listed (450 others hidden)');
          cy.contains('button', 'Show all').click();
          cy.get('[data-testid="bulk-result-hidden"]').should('contain', 'All 450 items are listed');
          cy.get('table tbody tr').should('have.length', 450);
        });
      });

      it('previews a long list batch by batch without saving', () => {
        const bodies = [];
        cy.intercept('POST', `${API}bulk_create/`, (req) => {
          bodies.push(req.body);
          req.reply({ statusCode: 200, body: summaryOf(req) });
        }).as('bulkCreate');
        open();
        choose(manyDomains(250).join('\n'));
        cy.contains('button', 'Preview').click();
        cy.get('@bulkCreate.all').should('have.length', 2).then(() => {
          expect(bodies.every((b) => b.dry_run === true)).to.equal(true);
        });
        cy.contains('[role="dialog"]', 'Preview only').and('contain', '250 would be created');
      });

      it('keeps what the first batches did when a later one fails', () => {
        let calls = 0;
        cy.intercept('POST', `${API}bulk_create/`, (req) => {
          calls += 1;
          if (calls === 2) req.reply({ statusCode: 500, body: { error: 'boom' } });
          else req.reply({ statusCode: 200, body: summaryOf(req) });
        }).as('bulkCreate');
        open();
        choose(manyDomains(450).join('\n'));
        cy.contains('button', 'Add 450 domains').click();
        cy.contains('[role="dialog"]', 'stopped at 200 of 450').and('contain', '200 created');
      });

      it('sends a short list as one request, unchanged', () => {
        const bodies = [];
        cy.intercept('POST', `${API}bulk_create/`, (req) => {
          bodies.push(req.body);
          req.reply({ statusCode: 200, body: summaryOf(req) });
        }).as('bulkCreate');
        open();
        choose('a.com\nb.com\n');
        cy.contains('button', 'Add 2 domains').click();
        cy.get('@bulkCreate.all').should('have.length', 1).then(() => {
          expect(bodies[0].values).to.equal('a.com\nb.com');
        });
      });
    });

    describe('cancelling and undoing an import', () => {
      // One id per item over the whole import, as the server gives them
      let next = 0;
      const summaryOf = (req) => {
        const values = req.body.values.split('\n').filter(Boolean);
        return { succeeded: values.length, skipped: 0, errors: 0, ok_status: 'created', dry_run: req.body.dry_run, results: values.map((value) => ({ value, status: 'created', reason: '', id: ++next })) };
      };
      const deletedOf = (req) => ({
        succeeded: req.body.ids.length, skipped: 0, errors: 0, ok_status: 'deleted',
        results: req.body.ids.map((id) => ({ value: 'item ' + id, status: 'deleted', reason: '', id })),
      });
      const many = (n) => Array.from({ length: n }, (_, i) => `domain-${i + 1}.com`);
      const choose = (contents, fileName = 'list.txt') =>
        cy.get('[data-testid="list-file"]').selectFile({ contents: Cypress.Buffer.from(contents), fileName }, { force: true });
      const open = () => cy.contains('button', 'Add domains').click();
      beforeEach(() => {
        next = 0;
      });

      it('takes back what an import created, after asking twice', () => {
        const deleted = [];
        cy.intercept('POST', `${API}bulk_create/`, (req) => req.reply({ statusCode: 200, body: summaryOf(req) })).as('bulkCreate');
        cy.intercept('POST', `${API}bulk_delete/`, (req) => {
          deleted.push(req.body.ids);
          req.reply({ statusCode: 200, body: deletedOf(req) });
        }).as('bulkDelete');
        open();
        cy.contains('label', 'Add several, one per line').click();
        cy.get('textarea[name="domain_name"]').type('a.com\nb.com');
        cy.contains('button', 'Add 2 domains').click();
        cy.wait('@bulkCreate');
        cy.contains('[role="dialog"]', '2 created').within(() => {
          cy.get('[data-testid="bulk-undo"]').click();
          cy.get('[data-testid="bulk-undo-confirm-text"]').should('contain', 'This removes the 2 items this import created');
          cy.contains('button', 'Keep them').click();
          cy.get('[data-testid="bulk-undo"]').should('be.visible').click();
          cy.get('[data-testid="bulk-undo-confirm"]').should('contain', 'Remove 2 items').click();
        });
        cy.get('@bulkDelete.all').should('have.length', 1).then(() => {
          expect(deleted[0]).to.deep.equal([1, 2]);
        });
        cy.contains('[role="dialog"]', 'Undo: Add legitimate domains').and('contain', '2 deleted');
        cy.get('[data-testid="bulk-undo"]').should('not.exist');
      });

      it('takes back a long import in batches of 200', () => {
        const deleted = [];
        cy.intercept('POST', `${API}bulk_create/`, (req) => req.reply({ statusCode: 200, body: summaryOf(req) })).as('bulkCreate');
        cy.intercept('POST', `${API}bulk_delete/`, (req) => {
          deleted.push(req.body.ids);
          req.reply({ statusCode: 200, body: deletedOf(req) });
        }).as('bulkDelete');
        open();
        choose(many(450).join('\n'));
        cy.contains('button', 'Add 450 domains').click();
        cy.contains('[role="dialog"]', '450 created').find('[data-testid="bulk-undo"]').click();
        cy.get('[data-testid="bulk-undo-confirm"]').should('contain', 'Remove 450 items').click();
        cy.get('@bulkDelete.all').should('have.length', 3).then(() => {
          expect(deleted.map((ids) => ids.length)).to.deep.equal([200, 200, 50]);
          expect(deleted.flat()).to.have.length(450);
        });
        cy.contains('[role="dialog"]', '450 deleted');
      });

      it('has nothing to undo after a preview', () => {
        cy.intercept('POST', `${API}bulk_create/`, (req) => req.reply({ statusCode: 200, body: summaryOf(req) })).as('bulkCreate');
        open();
        cy.contains('label', 'Add several, one per line').click();
        cy.get('textarea[name="domain_name"]').type('a.com\nb.com');
        cy.contains('button', 'Preview').click();
        cy.contains('[role="dialog"]', 'Preview only');
        cy.get('[data-testid="bulk-undo"]').should('not.exist');
      });

      it('stops a long import after the batch in progress, and keeps what is done', () => {
        const bodies = [];
        cy.intercept('POST', `${API}bulk_create/`, (req) => {
          bodies.push(req.body);
          req.reply({ statusCode: 200, delay: 700, body: summaryOf(req) });
        }).as('bulkCreate');
        open();
        choose(many(450).join('\n'));
        cy.contains('button', 'Add 450 domains').click();
        cy.get('[data-testid="bulk-cancel"]').click().should('be.disabled');
        cy.contains('Stopping after this batch');
        cy.contains('[role="dialog"]', 'cancelled at 200 of 450').and('contain', '200 created');
        cy.get('@bulkCreate.all').should('have.length', 1);
        cy.get('[data-testid="bulk-undo"]').should('exist');
      });

      it('has no Cancel for a short list', () => {
        cy.intercept('POST', `${API}bulk_create/`, (req) => req.reply({ statusCode: 200, delay: 500, body: summaryOf(req) })).as('bulkCreate');
        open();
        cy.contains('label', 'Add several, one per line').click();
        cy.get('textarea[name="domain_name"]').type('a.com\nb.com');
        cy.contains('button', 'Add 2 domains').click();
        cy.get('[role="status"]').should('contain', 'Add legitimate domains');
        cy.get('[data-testid="bulk-cancel"]').should('not.exist');
      });
    });

    it('edits, exports and deletes from the drawer', () => {
      cy.intercept('PATCH', `${API}1/`, (req) => req.reply({ statusCode: 200, body: { ...DOMAINS[0], ...req.body } })).as('patch');
      cy.intercept('POST', `${API}misp/`, { statusCode: 200, body: { message: 'Exported', misp_event_uuid: 'x' } }).as('misp');
      cy.intercept('DELETE', `${API}1/`, { statusCode: 204 }).as('delete');
      cy.get('[data-testid="domain-row"]').first().click();

      cy.get('.MuiDrawer-paper').contains('button', 'Edit').click();
      cy.get('[role="dialog"] input[name="contact"]').clear().type('SOC');
      cy.get('[role="dialog"]').contains('button', 'Save').click();
      cy.wait('@patch').its('request.body').should('include', { contact: 'SOC', domain_name: 'watcher-company.com' });

      cy.get('.MuiDrawer-paper').contains('button', 'Export to MISP').click();
      cy.get('[role="dialog"]').contains('button', 'Update MISP event').click();
      cy.wait('@misp').its('request.body').should('deep.equal', { id: 1, event_uuid: '5f1c2d3e-0000-4000-8000-000000000001' });

      cy.get('.MuiDrawer-paper').contains('button', 'Delete').click();
      // The drawer is a dialog too: only the confirmation is meant.
      cy.get('[role="dialog"]:not(.MuiDrawer-paper)').contains('button', 'Delete').click();
      cy.wait('@delete');
      cy.get('.MuiDrawer-paper:visible').should('not.exist');
    });

    it('runs bulk actions on the selection', () => {
      cy.intercept('POST', `${API}bulk_update/`, { statusCode: 200, body: SUMMARY('updated', 2) }).as('bulkUpdate');
      cy.intercept('POST', `${API}bulk_delete/`, { statusCode: 200, body: SUMMARY('deleted', 2) }).as('bulkDelete');
      cy.get('input[aria-label="Select the legitimate domains of this page"]').check();
      cy.get('[role="region"][aria-label="Selection"]').should('contain', '2 selected').contains('button', 'Mark repurchased').click();
      cy.wait('@bulkUpdate').its('request.body').should('deep.equal', { ids: [1, 2], changes: { repurchased: true } });
      cy.contains('[role="dialog"]', '2 updated').contains('button', 'Close').click();
      cy.get('[role="region"][aria-label="Selection"]').should('not.exist');

      cy.get('input[aria-label="Select watcher-backup.fr"]').check();
      cy.get('[role="region"][aria-label="Selection"]').contains('button', 'Delete').click();
      cy.get('[role="dialog"]').contains('button', 'Delete 1').click();
      cy.wait('@bulkDelete').its('request.body').should('deep.equal', { ids: [2] });
    });

    it('shows the insights and links them to the list', () => {
      cy.contains('[role="tab"]', 'Insights').click();
      cy.location('hash').should('include', 'tab=insights');
      cy.get('[data-testid="upcoming-chart"] svg').should('exist');
      cy.contains('li', '.com').should('contain', '1');
      cy.get('button[aria-label^="Certificate: 1 expiring soon"]').click();
      cy.location('hash').should('include', 'ssl=expiring_soon').and('not.include', 'tab=');
    });
  });

  // A past date is Expired only when a registry confirmed it lately; otherwise it is Unconfirmed, and a domain without a
  // date says why. The API tells it (expiry_confirmed, expiry_source, expiry_check), these tests mock what it sends.
  describe('confirmation of the expiry date', () => {
    const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
    const row = (id, name, extra) => ({
      id, domain_name: name, ticket_id: '', contact: '', created_at: `${day(-5)}T10:00:00`, domain_created_at: null, expiry: null,
      ssl_expiry: null, repurchased: false, comments: '', misp_event_uuid: [], last_event: null, ...extra,
    });
    const ROWS = [
      row(11, 'confirmed-expired.com', { expiry: day(-3), expiry_confirmed: true, expiry_source: 'RDAP', expiry_check: 'ok', expiry_checked_at: ago(12) }),
      row(12, 'typed-by-hand.example', { expiry: day(-3), expiry_confirmed: false, expiry_source: 'manual', expiry_check: null, expiry_checked_at: null }),
      row(13, 'typed-by-hand.example', { expiry: day(-3), expiry_confirmed: false, expiry_source: 'manual', expiry_check: null, expiry_checked_at: null }),
      row(14, 'gone.example', { expiry_confirmed: false, expiry_check: 'not_registered', expiry_checked_at: ago(30) }),
      row(15, 'nodate.de', { expiry_confirmed: false, expiry_check: 'no_date', expiry_checked_at: ago(30) }),
      row(16, 'unsupported.io', { expiry_confirmed: false, expiry_check: 'unsupported', expiry_checked_at: null }),
      row(18, 'en.sub-example.com', { expiry_confirmed: false, expiry_check: 'subdomain', expiry_checked_at: null }),
      row(17, 'held.com', { expiry: day(100), expiry_confirmed: false, expiry_source: 'RDAP', expiry_check: 'contradicted', expiry_checked_at: ago(5) }),
    ];
    const inRow = (name) => cy.contains('[data-testid="domain-row"]', name);

    beforeEach(() => {
      mockApi();
      cy.intercept('GET', `${API}?*`, { statusCode: 200, body: { count: ROWS.length, next: null, previous: null, results: ROWS } }).as('list');
      cy.intercept('GET', `${API}statistics/`, { statusCode: 200, body: { ...STATS, total: 8, expired: 1, unconfirmed: 2, unverified: 5, notRegistered: 3 } }).as('stats');
      cy.intercept('GET', /\/api\/common\/legitimate_domains\/(1[1-8])\/$/, (req) => {
        req.reply({ statusCode: 200, body: ROWS.find((r) => r.id === Number(req.url.match(/(\d+)\/$/)[1])) });
      });
      visit();
      cy.get('[data-testid="domain-row"]', { timeout: 20000 }).should('have.length', ROWS.length);
    });

    it('shows a confirmed past date as Expired and one nobody confirmed as Unconfirmed', () => {
      inRow('confirmed-expired.com').find('[data-testid="expiry-expired"]').should('contain', 'Expired');
      inRow('typed-by-hand.example').find('[data-testid="expiry-unconfirmed"]').should('contain', 'Unconfirmed: expired');
      inRow('typed-by-hand.example').find('[data-testid="expiry-unconfirmed"]').should('exist');
      inRow('typed-by-hand.example').find('[data-testid="expiry-expired"]').should('not.exist');
    });

    it('shows a domain the registry does not know in red, with a card and a filter to find them', () => {
      inRow('gone.example').find('[data-testid="expiry-not-registered"]').should('contain', 'Not registered');
      inRow('unsupported.io').find('[data-testid="expiry-not-registered"]').should('not.exist');
      cy.wait('@list');
      cy.contains('button', 'Not registered').should('contain', '3').click();
      cy.wait('@list').its('request.url').should('include', 'status=not_registered');
      cy.location('hash').should('include', 'status=not_registered');
    });

    it('offers Not registered for the domain expiry, and not for the certificate', () => {
      cy.get('[role="combobox"]').first().click();
      cy.contains('[role="option"]', 'Not registered').should('exist');
      cy.get('body').type('{esc}');
      cy.get('[role="combobox"]').eq(1).click();
      cy.contains('[role="option"]', 'Needs attention').should('exist');
      cy.contains('[role="option"]', 'Not registered').should('not.exist');
    });

    it('explains what Unconfirmed means', () => {
      inRow('typed-by-hand.example').find('[data-testid="expiry-unconfirmed"]').trigger('mouseover');
      cy.contains('[role="tooltip"]', 'no registry has confirmed it lately');
    });

    it('says why a domain has no date', () => {
      inRow('gone.example').should('contain', 'Not registered');
      inRow('nodate.de').should('contain', 'The registry gives no date');
      inRow('unsupported.io').should('contain', 'No expiry date available for this extension');
      inRow('en.sub-example.com').should('contain', 'A subdomain: the registry only knows its main domain');
    });

    it('tells in the drawer where the date comes from and when it was checked', () => {
      inRow('confirmed-expired.com').click();
      cy.get('[data-testid="expiry-check"]', { timeout: 10000 }).invoke('text').should('match', /Date from the registry \(RDAP\), checked 1\d minutes ago\./);
      cy.get('button[aria-label="Close details"]').click();
      inRow('typed-by-hand.example').click();
      cy.get('[data-testid="expiry-check"]').should('contain', 'Date typed by hand, never checked.');
      cy.get('button[aria-label="Close details"]').click();
      inRow('typed-by-hand.example').click();
      cy.get('[data-testid="expiry-check"]').should('contain', 'Date typed by hand, never checked');
    });

    it('says when a registry gave an earlier date that waits for a second answer', () => {
      inRow('held.com').click();
      cy.get('[data-testid="expiry-check"]', { timeout: 10000 }).should('contain', 'A registry gave an earlier date');
    });

    it('lists the unconfirmed domains from the card', () => {
      cy.wait('@list');
      cy.contains('button', 'Unconfirmed').should('contain', '2').click();
      cy.wait('@list').its('request.url').should('include', 'status=unconfirmed');
      cy.location('hash').should('include', 'status=unconfirmed');
      cy.contains('button', 'Unconfirmed').should('have.attr', 'aria-pressed', 'true');
    });

    it('offers Unconfirmed and Not verified for the domain expiry, and not for the certificate', () => {
      cy.wait('@list'); // the request of the first display, so that the next wait is the one of the filter
      cy.get('[role="combobox"]').first().click();
      cy.contains('[role="option"]', 'Expired, unconfirmed').should('exist');
      cy.contains('[role="option"]', 'Not verified lately').click();
      cy.wait('@list').its('request.url').should('include', 'status=unverified');
      cy.get('[role="combobox"]').eq(1).click();
      cy.contains('[role="option"]', 'Needs attention').should('exist');
      cy.contains('[role="option"]', 'Expired, unconfirmed').should('not.exist');
      cy.contains('[role="option"]', 'Not verified lately').should('not.exist');
    });

    it('counts the unconfirmed domains in the insights, for the domain only', () => {
      cy.contains('[role="tab"]', 'Insights').click();
      cy.get('button[aria-label="Domain registration: 2 unconfirmed, show them"]').click();
      cy.location('hash').should('include', 'status=unconfirmed').and('not.include', 'tab=');
      cy.contains('[role="tab"]', 'Insights').click();
      cy.get('button[aria-label^="Certificate:"][aria-label*="unconfirmed"]').should('not.exist');
    });
  });

  describe('public view', () => {

    it('is read-only and hides the internal columns', () => {
      mockApi(null);
      cy.visit('/#/legitimate_domains');
      cy.get('[data-testid="domain-row"]', { timeout: 20000 }).should('have.length', 2);
      cy.contains('button', 'Add domains').should('not.exist');
      cy.get('input[type="checkbox"]').should('not.exist');
      cy.contains('th', 'Repurchased').should('not.exist');
      cy.get('[data-testid="domain-row"]').first().click();
      cy.get('.MuiDrawer-paper').within(() => {
        cy.contains('button', 'Edit').should('not.exist');
        cy.contains('History').should('not.exist');
      });
    });
  });
});
