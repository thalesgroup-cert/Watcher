// Connectors > Notifications tab, fully mocked: the list, the switches, the drawer, the choice of fields, the preview.
describe('Connectors - Notifications tab', () => {
  const USER = {
    id: 1, username: 'admin', first_name: 'Ada', last_name: 'Admin', email: 'admin@watcher.local',
    is_superuser: true, is_staff: true, groups: [], permissions: [],
  };

  const connector = (id, status = 'configured', health = 'healthy') => ({ id, status, health });

  const leak = ({ slack = false, fields = ['keyword_name', 'url'] } = {}) => ({
    id: 'data_leak',
    label: 'Data leak alert',
    module: 'data_leak',
    channels: {
      slack: {
        enabled: slack,
        fields,
        available: [
          { id: 'keyword_name', label: 'Keyword', required: false },
          { id: 'url', label: 'Source', required: true },
        ],
        connector: connector('slack'),
      },
      email: { enabled: true, fields: [], available: [], connector: connector('smtp', 'partial') },
    },
  });

  const weekly = {
    id: 'threats_watcher_weeklysummary',
    label: 'Weekly threat summary',
    module: 'threats_watcher',
    channels: {
      slack: { enabled: false, fields: [], available: [], connector: connector('slack') },
    },
  };

  const PREVIEW = { kind: 'text', content: '*[DATA LEAK - ALERT #42]*\n\n*• Source:* https://pastebin.com/abc123' };

  beforeEach(() => {
    cy.viewport(1440, 900);
    cy.on('uncaught:exception', () => false);
    cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: USER });
    cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: '', preferences: {}, avatar_color: '#2196f3' } });
    cy.intercept('GET', '/api/connectors/', { statusCode: 200, body: [] });
    cy.intercept('GET', '/api/connectors/notifications/', { statusCode: 200, body: [weekly, leak()] }).as('list');
    cy.intercept('POST', '/api/connectors/notifications/data_leak/slack/preview/', { statusCode: 200, body: PREVIEW }).as('preview');
    cy.intercept('POST', '/api/connectors/notifications/data_leak/email/preview/', {
      statusCode: 200,
      body: { kind: 'html', title: '[ALERT #42] Data Leak', content: '<html><body>Data leak</body></html>' },
    }).as('emailPreview');
  });

  const visitTab = (path = '/#/connectors?tab=notifications') =>
    cy.visit(path, { onBeforeLoad: (win) => win.localStorage.setItem('token', 'mock-token-notifications') });

  it('lists the notifications by module with a switch per channel', () => {
    visitTab();
    cy.contains('tr', 'Data Leak', { timeout: 20000 }).should('be.visible');
    cy.contains('tr', 'Threats Watcher').should('be.visible');
    cy.get('input[aria-label="Data leak alert on Slack"]').should('not.be.checked');
    cy.get('input[aria-label="Data leak alert on Email"]').should('be.checked');
    // The weekly summary has no Citadel, TheHive or email message here: nothing to switch.
    cy.contains('tr', 'Weekly threat summary').find('input[type="checkbox"]').should('have.length', 1);
  });

  it('switches a channel on from the list', () => {
    cy.intercept('PATCH', '/api/connectors/notifications/data_leak/slack/', { statusCode: 200, body: leak({ slack: true }) }).as('toggle');
    visitTab();
    cy.get('input[aria-label="Data leak alert on Slack"]', { timeout: 20000 }).check();
    cy.wait('@toggle').its('request.body').should('deep.equal', { enabled: true });
    cy.get('input[aria-label="Data leak alert on Slack"]').should('be.checked');
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

  it('shows the email preview in a sandboxed frame, without field choice', () => {
    visitTab('/#/connectors?tab=notifications&ntype=data_leak&nchannel=email');
    cy.get('[role="complementary"]', { timeout: 20000 }).within(() => {
      cy.contains('The layout of the email is fixed').should('be.visible');
      cy.contains('[role="tab"]', 'Slack').should('exist');
      cy.get('input[type="checkbox"]').should('have.length', 1); // only the switch
      cy.get('iframe[title="Message preview"]').should('have.attr', 'sandbox', '');
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
