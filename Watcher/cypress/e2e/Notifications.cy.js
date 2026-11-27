// Connectors > Notifications tab, fully mocked: the list and its pills, the filters, the drawer, the choice of fields, the preview.
describe('Connectors - Notifications tab', () => {
  const USER = {
    id: 1, username: 'admin', first_name: 'Ada', last_name: 'Admin', email: 'admin@watcher.local',
    is_superuser: true, is_staff: true, groups: [], permissions: [],
  };

  const connector = (id, status = 'configured', health = 'healthy') => ({ id, status, health });
  // What every channel carries besides its switch and its fields: the message written by hand (none here), the one of the
  // catalogue and what a message can read
  const MESSAGE = { template: null, default_template: null, title: null, default_title: null, variables: [] };

  const leak = ({ slack = false, fields = ['keyword_name', 'url'] } = {}) => ({
    id: 'data_leak',
    label: 'Data leak alert',
    module: 'data_leak',
    channels: {
      slack: {
        ...MESSAGE,
        enabled: slack,
        fields,
        available: [
          { id: 'keyword_name', label: 'Keyword', required: false },
          { id: 'url', label: 'Source', required: true },
        ],
        connector: connector('slack'),
      },
      email: { ...MESSAGE, enabled: true, fields: [], available: [], connector: connector('smtp', 'partial') },
    },
  });

  const weekly = {
    id: 'threats_watcher_weeklysummary',
    label: 'Weekly threat summary',
    module: 'threats_watcher',
    channels: {
      slack: { ...MESSAGE, enabled: false, fields: [], available: [], connector: connector('slack') },
    },
  };

  const expiring = {
    id: 'legitimate_domain_expiring',
    label: 'Legitimate domain close to expiry',
    module: 'legitimate_domains',
    channels: {
      slack: { ...MESSAGE, enabled: false, fields: [], available: [], connector: connector('slack') },
    },
  };

  const PREVIEW = { kind: 'text', format: 'slack', content: '*[DATA LEAK - ALERT #42]*\n\n*• Source:* https://pastebin.com/abc123' };

  beforeEach(() => {
    cy.viewport(1440, 900);
    cy.on('uncaught:exception', () => false);
    cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: USER });
    cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: '', preferences: {}, avatar_color: '#2196f3' } });
    cy.intercept('GET', '/api/connectors/', { statusCode: 200, body: [] });
    cy.intercept('GET', '/api/connectors/notifications/', { statusCode: 200, body: [weekly, leak(), expiring] }).as('list');
    cy.intercept('POST', '/api/connectors/notifications/data_leak/slack/preview/', { statusCode: 200, body: PREVIEW }).as('preview');
    cy.intercept('POST', '/api/connectors/notifications/data_leak/email/preview/', {
      statusCode: 200,
      body: { kind: 'html', format: 'html', title: '[ALERT #42] Data Leak', content: '<html><body>Data leak</body></html>' },
    }).as('emailPreview');
  });

  const visitTab = (path = '/#/connectors?tab=notifications') =>
    cy.visit(path, { onBeforeLoad: (win) => win.document.cookie = 'session_active=1' });

  const pill = (label) => cy.get(`[role="switch"][aria-label="${label}"]`);

  it('lists the notifications by module with a pill per channel, green when it is sent', () => {
    visitTab();
    cy.contains('tr', 'Data Leak', { timeout: 20000 }).should('be.visible');
    cy.contains('tr', 'Threats Watcher').should('be.visible');
    // Its own group, with its notifications off until switched on
    cy.contains('tr', 'Legitimate Domains').should('be.visible');
    pill('Legitimate domain close to expiry on Slack').should('have.attr', 'aria-checked', 'false').and('contain', 'Off');
    pill('Data leak alert on Slack').should('have.attr', 'aria-checked', 'false');
    pill('Data leak alert on Email').should('have.attr', 'aria-checked', 'true').and('contain', 'On');
    // The weekly summary has no Citadel, TheHive or email message here: nothing to switch.
    cy.contains('tr', 'Weekly threat summary').find('[role="switch"]').should('have.length', 1);
  });

  it('counts the active notifications of each module and folds a module away', () => {
    visitTab();
    cy.get('[data-testid="module-count-data_leak"]', { timeout: 20000 }).should('contain', '1/1 active');
    cy.get('[data-testid="module-count-threats_watcher"]').should('contain', '0/1 active');
    cy.contains('tr', 'Data leak alert').should('be.visible');
    cy.contains('tr', 'Data Leak').click();
    cy.contains('tr', 'Data leak alert').should('not.exist');
    cy.get('[data-testid="module-count-data_leak"]').should('contain', '1/1 active');
    cy.contains('button', 'Collapse all').click();
    cy.contains('tr', 'Weekly threat summary').should('not.exist');
    cy.contains('button', 'Expand all').click();
    cy.contains('tr', 'Weekly threat summary').should('be.visible');
  });

  it('searches the notifications and keeps only the active ones on demand', () => {
    visitTab();
    cy.contains('tr', 'Data leak alert', { timeout: 20000 }).should('be.visible');
    cy.get('input[aria-label="Search a notification"]').type('weekly');
    cy.contains('tr', 'Weekly threat summary').should('be.visible');
    cy.contains('tr', 'Data leak alert').should('not.exist');
    cy.location('hash').should('include', 'nq=weekly');
    cy.get('input[aria-label="Search a notification"]').clear().type('zzz');
    cy.contains('No notification matches.').should('be.visible');
    cy.get('input[aria-label="Search a notification"]').clear();
    // Only what is sent somewhere: the data leak alert (its email is on), not the two that are off everywhere
    cy.contains('[role="button"]', 'Active only').click();
    cy.contains('tr', 'Data leak alert').should('be.visible');
    cy.contains('tr', 'Weekly threat summary').should('not.exist');
    cy.contains('tr', 'Legitimate domain close to expiry').should('not.exist');
    cy.location('hash').should('include', 'nactive=1');
  });

  it('shows the state of every channel in its column header', () => {
    visitTab();
    cy.get('[data-testid="channel-state-slack"]', { timeout: 20000 }).should('be.visible');
    cy.get('[data-testid="channel-state-email"]').should('be.visible');
    // Nothing in this mock uses Citadel or TheHive
    cy.get('[data-testid="channel-state-citadel"]').trigger('mouseover');
    cy.contains('no notification uses it').should('be.visible');
  });

  it('switches a channel on from the list', () => {
    cy.intercept('PATCH', '/api/connectors/notifications/data_leak/slack/', { statusCode: 200, body: leak({ slack: true }) }).as('toggle');
    visitTab();
    cy.contains('tr', 'Data leak alert', { timeout: 20000 }).should('be.visible');
    pill('Data leak alert on Slack').click();
    cy.wait('@toggle').its('request.body').should('deep.equal', { enabled: true });
    pill('Data leak alert on Slack').should('have.attr', 'aria-checked', 'true');
  });

  it('warns when a switched-on channel has no working connector', () => {
    visitTab();
    cy.contains('tr', 'Data leak alert', { timeout: 20000 }).find('[aria-label$="is not configured. Set it up on the Connectors tab."]').should('exist');
  });

  it('opens a notification, previews it and saves the chosen fields', () => {
    cy.intercept('PATCH', '/api/connectors/notifications/data_leak/slack/', { statusCode: 200, body: leak({ fields: ['url'] }) }).as('save');
    visitTab();
    cy.contains('button', 'Data leak alert', { timeout: 20000 }).click();
    cy.location('hash').should('include', 'ntype=data_leak');
    cy.get('[role="complementary"]').within(() => {
      cy.contains('h2', 'Data leak alert').should('be.visible');
      cy.wait('@preview');
      cy.contains('https://pastebin.com/abc123').should('exist');
      cy.contains('label', 'Source').find('input').should('be.disabled').and('be.checked');
      cy.contains('button', 'Save').should('be.disabled');
      cy.contains('label', 'Keyword').find('input').uncheck();
    });
    cy.wait('@preview').its('request.body').should('deep.equal', { fields: ['url'] });
    cy.get('[role="complementary"]').contains('button', 'Save').click();
    cy.wait('@save').its('request.body').should('deep.equal', { fields: ['url'] });
  });

  it('sends a test of the message to Slack, says how it went, and offers none on e-mail', () => {
    cy.intercept('POST', '/api/connectors/notifications/data_leak/slack/test/', { statusCode: 200, body: { success: true, message: 'Test sent to Slack.' } }).as('sentTest');
    visitTab();
    cy.contains('button', 'Data leak alert', { timeout: 20000 }).click();
    cy.get('[role="complementary"]').within(() => {
      cy.wait('@preview');
      cy.contains('button', 'Send a test to Slack').click();
    });
    cy.wait('@sentTest');
    cy.contains('Test sent to Slack.').should('be.visible');
    // A failure is said too
    cy.intercept('POST', '/api/connectors/notifications/data_leak/slack/test/', { statusCode: 200, body: { success: false, message: 'The test was not sent to Slack: 429.' } }).as('refused');
    cy.get('[role="complementary"]').contains('button', 'Send a test to Slack').click();
    cy.wait('@refused');
    cy.contains('The test was not sent to Slack: 429.').should('be.visible');
  });

  it('has no test on the e-mail channel', () => {
    visitTab('/#/connectors?tab=notifications&ntype=data_leak&nchannel=email');
    cy.get('[role="complementary"]', { timeout: 20000 }).contains('The layout of the email is fixed').should('be.visible');
    cy.get('[role="complementary"]').contains('button', /Send a test/).should('not.exist');
  });

  it('shows the email preview in a sandboxed frame, without field choice', () => {
    visitTab('/#/connectors?tab=notifications&ntype=data_leak&nchannel=email');
    cy.get('[role="complementary"]', { timeout: 20000 }).within(() => {
      cy.contains('The layout of the email is fixed').should('be.visible');
      cy.contains('[role="tab"]', 'Slack').should('exist');
      cy.get('input[type="checkbox"]').should('have.length', 1); // only the switch
      cy.get('iframe[title="Message preview"]').should('have.attr', 'sandbox', 'allow-same-origin');
      cy.contains('[ALERT #42] Data Leak').should('be.visible');
    });
  });

  it('keeps the tab and the open notification in the URL', () => {
    visitTab('/#/connectors?tab=notifications&ntype=data_leak&nchannel=slack');
    cy.get('[role="complementary"]', { timeout: 20000 }).contains('h2', 'Data leak alert').should('be.visible');
    cy.get('[role="complementary"]').find('button[aria-label="Close details"]').click();
    cy.location('hash').should('not.include', 'ntype=');
    cy.location('hash').should('include', 'tab=notifications');
  });
});
