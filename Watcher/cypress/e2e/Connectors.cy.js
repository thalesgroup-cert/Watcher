// Connectors page: smoke test + screenshots (SHOT=<prefix> to name them, e.g. before / after), then the state lights
// (mocked).
const shot = (name) => cy.screenshot(`${Cypress.env('SHOT') || 'run'}-${name}`, { capture: 'viewport', overwrite: true });

describe('Connectors', () => {
    beforeEach(() => {
        const { username, password } = Cypress.env('testCredentials');
        cy.viewport(1440, 900);
        cy.visit('/#/login');
        cy.get('input[name="username"], input[type="text"]').first().type(username);
        cy.get('input[type="password"]').first().type(password, { log: false });
        cy.get('button[type="submit"]').first().click();
        cy.location('hash', { timeout: 15000 }).should('not.include', '/login');
    });

    it('lists connectors with KPI cards, filters and cards', () => {
        cy.visit('/#/connectors');
        cy.contains('Connectors', { timeout: 15000 }).should('be.visible');
        cy.contains('Configured').should('be.visible');
        cy.contains('button', /^(Edit|View)$/, { timeout: 15000 }).should('be.visible');
        shot('connectors');
    });

    it('opens the edit dialog and keeps it open when the save fails', () => {
        cy.visit('/#/connectors');
        cy.contains('button', 'Edit', { timeout: 15000 }).first().click();
        cy.contains(/^Edit /).should('be.visible');
        shot('connectors-edit');
    });

    it('tests a connector and shows the result on the card', () => {
        // The answer is held back a moment: a real test can end before the button is seen testing
        cy.intercept('POST', '/api/connectors/*/test/', { delay: 1500, statusCode: 200, body: { success: true, message: 'Connection OK' } }).as('testRun');
        cy.visit('/#/connectors');
        cy.contains('button', /^Test$/, { timeout: 15000 }).first().click();
        cy.contains(/Testing/).should('exist');
        shot('connectors-testing');
        cy.wait('@testRun');
        cy.contains('Connection OK').should('be.visible');
    });
});

describe('Connectors - the state lights', () => {
    const USER = { id: 1, username: 'admin', first_name: 'Ada', last_name: 'Admin', email: '', is_superuser: true, is_staff: true, groups: [], permissions: [] };
    const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
    const connector = (id, name, status, health) => ({ id, name, category: 'Notifications', description: '', version: '1.0', status, health, readonly: false, fields: [] });
    const CONNECTORS = [
        connector('slack', 'Slack', 'configured', { status: 'healthy', checked_at: ago(5), message: 'Connected' }),
        connector('misp', 'MISP', 'configured', { status: 'healthy', checked_at: ago(8), message: 'Connected' }),
        connector('thehive', 'TheHive', 'configured', { status: 'unhealthy', checked_at: ago(15), message: 'Connection refused' }),
        connector('smtp', 'SMTP', 'partial', null),
        connector('citadel', 'Citadel', 'configured', { status: 'unknown', checked_at: null, message: null }),
        connector('ldap', 'LDAP', 'disabled', null),
    ];

    beforeEach(() => {
        cy.viewport(1440, 900);
        cy.on('uncaught:exception', () => false);
        cy.intercept('GET', '/api/**', { statusCode: 200, body: { results: [], next: null, previous: null } });
        cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: USER });
        cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: 'darkly', preferences: {}, avatar_color: null } });
        cy.intercept('GET', '/api/connectors/', { statusCode: 200, body: CONNECTORS });
        cy.visit('/#/connectors', { onBeforeLoad: (win) => win.localStorage.setItem('token', 'mock-token-connectors') });
        cy.get('[data-testid="light-ok"]', { timeout: 20000 }).should('be.visible');
    });

    it('counts the connectors by light, and says what each light means', () => {
        cy.get('[data-testid="light-ok"]').should('contain', 'Working').and('contain', '2').and('contain', 'The last test passed.');
        cy.get('[data-testid="light-problem"]').should('contain', 'Problem').and('contain', '1').and('contain', 'open the connector to see why');
        cy.get('[data-testid="light-unfinished"]').should('contain', 'To finish').and('contain', '1');
        cy.get('[data-testid="light-untested"]').should('contain', 'Not tested').and('contain', '1').and('contain', 'press Test');
        cy.get('[data-testid="light-off"]').should('contain', 'Not set up').and('contain', '1');
    });

    it('shows one light on each card, with when it was checked', () => {
        cy.get('[data-light="ok"]').filter('.MuiCard-root').should('have.length', 2);
        cy.get('.MuiCard-root[data-light="problem"]').should('contain', 'TheHive').and('contain', 'Problem').and('contain', 'Checked 15 minutes ago');
        cy.get('.MuiCard-root[data-light="unfinished"]').should('contain', 'SMTP').and('contain', 'To finish');
        cy.get('.MuiCard-root[data-light="untested"]').should('contain', 'Citadel').and('contain', 'Never tested');
        cy.get('.MuiCard-root[data-light="off"]').should('contain', 'LDAP').and('contain', 'Not set up').and('not.contain', 'Never tested');
    });

    it('shows the reason of a problem when hovering its light', () => {
        cy.get('.MuiCard-root[data-light="problem"] [data-testid="connector-light"]').trigger('mouseover');
        cy.contains('Connection refused').should('be.visible');
    });

    it('lists only the connectors of a light when its card is clicked, and all of them when it is clicked again', () => {
        cy.get('[data-testid="light-problem"] button').click();
        cy.get('.MuiCard-root[data-light]').should('have.length', 1).first().should('contain', 'TheHive');
        cy.get('[data-testid="light-problem"] button').should('have.attr', 'aria-pressed', 'true').click();
        cy.get('.MuiCard-root[data-light]').should('have.length', 6);
    });
});

describe('Connectors - scheduled jobs', () => {
    const USER = { id: 1, username: 'admin', first_name: 'Ada', last_name: 'Admin', email: '', is_superuser: true, is_staff: true, groups: [], permissions: [] };
    const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
    const inMinutes = (minutes) => new Date(Date.now() + minutes * 60_000).toISOString();
    const recent = (durations, failedLast = false) =>
        durations.map((duration, i) => ({ started_at: ago((durations.length - i) * 30), duration, failed: failedLast && i === durations.length - 1 }));
    const JOBS = [
        {
            key: 'threats_watcher.main_watch', module: 'Threats Watcher', label: 'Main watch (RSS feeds, words, keywords)', schedule: 'every 30 minutes',
            next_run: inMinutes(12), running: false, running_since: null, reported: true, tracked: true,
            last: { started_at: ago(18), finished_at: ago(3), duration: 426, failed: false, error: '', counts: { feeds: 217, keyword_matches: 12 } },
            average_duration: 380, recent: recent([300, 350, 420, 426]),
        },
        {
            key: 'data_leak.main_data_leak', module: 'Data Leak', label: 'Fetch searx & pastebin', schedule: 'every 5 minutes',
            next_run: inMinutes(2), running: true, running_since: ago(4), reported: true, tracked: true,
            last: { started_at: ago(9), finished_at: ago(2), duration: 426, failed: false, error: '', counts: { keywords: 422, pastebin_unavailable: 1, overran: 1 } },
            average_duration: 300, recent: recent([280, 290, 426]),
        },
        {
            key: 'cyber_watch.fetch_latest_cves', module: 'Cyber Watch', label: 'Fetch latest CVEs', schedule: 'every 30 minutes',
            next_run: inMinutes(20), running: false, running_since: null, reported: true, tracked: true,
            last: { started_at: ago(40), finished_at: ago(39), duration: 3, failed: true, error: 'ConnectionError: cve.circl.lu unreachable', counts: {} },
            average_duration: 4, recent: recent([4, 5, 3], true),
        },
        {
            key: 'threats_watcher.cleanup', module: 'Threats Watcher', label: 'Cleanup', schedule: 'every day at 08:00',
            next_run: inMinutes(60 * 20), running: false, running_since: null, reported: false, tracked: false, last: null, average_duration: null, recent: [],
        },
    ];

    beforeEach(() => {
        cy.viewport(1440, 900);
        cy.on('uncaught:exception', () => false);
        cy.intercept('GET', '/api/**', { statusCode: 200, body: { results: [], next: null, previous: null } });
        cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: USER });
        cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: 'darkly', preferences: {}, avatar_color: null } });
        cy.intercept('GET', '/api/connectors/', { statusCode: 200, body: [] });
        cy.intercept('GET', '/api/common/scheduled_jobs/', { statusCode: 200, body: { jobs: JOBS } }).as('jobs');
        cy.visit('/#/connectors?tab=jobs', { onBeforeLoad: (win) => win.localStorage.setItem('token', 'mock-token-jobs') });
        cy.get('[data-testid="job-row"]', { timeout: 20000 }).should('have.length', 4);
    });

    it('is a tab of the connectors, kept in the URL', () => {
        cy.contains('[role="tab"]', 'Scheduled jobs').should('have.attr', 'aria-selected', 'true');
        cy.location('hash').should('include', 'tab=jobs');
    });

    it('counts the jobs that are running, failed or overran', () => {
        cy.get('[data-testid="jobs-summary"]').should('contain', '4 scheduled jobs').and('contain', '1 running').and('contain', '1 failed on the last pass').and('contain', '1 overran');
    });

    it('says when each job ran, how long it took, what it did and when it runs next', () => {
        cy.get('[data-key="threats_watcher.main_watch"]').within(() => {
            cy.contains('Main watch (RSS feeds, words, keywords)');
            cy.contains('Threats Watcher');
            cy.contains('every 30 minutes');
            cy.contains('7 min 6 s');
            cy.contains('average 6 min 20 s');
            cy.contains('feeds 217 - keyword matches 12');
            cy.contains('in 12 minutes');
            cy.get('[data-testid="job-trend"]').should('exist');
            cy.get('[data-testid="job-running"]').should('not.exist');
        });
    });

    it('flags a job that is running, one that failed and one that overran its cycle', () => {
        cy.get('[data-key="data_leak.main_data_leak"]').within(() => {
            cy.get('[data-testid="job-running"]').should('contain', 'Running');
            cy.get('[data-testid="job-overran"]').should('contain', 'Overran its cycle');
            cy.contains('Since');
            cy.contains('keywords 422 - pastebin unavailable 1 - overran 1');
        });
        cy.get('[data-key="cyber_watch.fetch_latest_cves"]').within(() => {
            cy.get('[data-testid="job-failed"]').should('contain', 'Failed');
        });
    });

    it('tells a job that has not run yet from one that keeps no summary', () => {
        cy.intercept('GET', '/api/common/scheduled_jobs/', {
            statusCode: 200,
            body: { jobs: [{ ...JOBS[0], key: 'x.new', label: 'A new job', reported: false, last: null, average_duration: null, recent: [] }, JOBS[3]] },
        });
        cy.reload();
        cy.get('[data-key="x.new"]').should('contain', 'No pass yet');
        cy.get('[data-key="threats_watcher.cleanup"]').should('contain', 'No summary kept');
    });

    it('says when a job keeps no summary', () => {
        cy.get('[data-key="threats_watcher.cleanup"]').should('contain', 'No summary kept').and('contain', 'every day at 08:00');
    });
});

describe('Connectors - every connector on one page', () => {
    const USER = { id: 1, username: 'admin', first_name: 'Ada', last_name: 'Admin', email: '', is_superuser: true, is_staff: true, groups: [], permissions: [] };
    const connectors = (count) =>
        Array.from({ length: count }, (_, i) => ({
            id: `connector_${i}`, name: `Connector ${String(i + 1).padStart(2, '0')}`, category: 'Notifications', description: '', version: '1.0',
            status: 'configured', health: null, readonly: false, fields: [],
        }));

    const open = (count) => {
        cy.viewport(1440, 900);
        cy.on('uncaught:exception', () => false);
        cy.intercept('GET', '/api/**', { statusCode: 200, body: { results: [], next: null, previous: null } });
        cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: USER });
        cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: 'darkly', preferences: {}, avatar_color: null } });
        cy.intercept('GET', '/api/connectors/', { statusCode: 200, body: connectors(count) });
        cy.visit('/#/connectors', { onBeforeLoad: (win) => win.localStorage.setItem('token', 'mock-token-connectors') });
        cy.contains('Showing', { timeout: 20000 });
    };

    it('shows the sixteen connectors of an instance together, with no page to turn', () => {
        open(16);
        cy.contains('Showing 1 to 16 of 16 entries').should('be.visible');
        cy.get('[data-testid="connector-light"]').should('have.length', 16);
        cy.get('.MuiPagination-root').should('not.exist');
    });

    it('only turns pages when there are more than twenty-five', () => {
        open(30);
        cy.contains('Showing 1 to 25 of 30 entries').should('be.visible');
        cy.get('[data-testid="connector-light"]').should('have.length', 25);
        cy.get('.MuiPagination-root').contains('button', '2').click();
        cy.contains('Showing 26 to 30 of 30 entries').should('be.visible');
        cy.get('[data-testid="connector-light"]').should('have.length', 5);
    });
});
