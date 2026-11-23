// Pending actions: what Watcher prepared and waits for someone to approve. The list decides without opening anything: a cross
// to reject and a green button to approve, with the name of what it does. All API calls are mocked.
describe('Pending actions', () => {
  const USER = { id: 1, username: 'analyst', first_name: 'Ana', last_name: 'Lyst', email: '', is_superuser: true, is_staff: false, groups: [], permissions: [] };
  const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString().slice(0, 19);
  const ACTIONS = [
    { id: 1, action_type: 'udrp_transfer', action_type_label: 'UDRP - Transfer domain to Legitimate Domains', status: 'pending', title: 'UDRP Transfer: thales.com', description: 'The UDRP case was won.', metadata: { domain_name: 'thales.com' }, created_at: ago(30), resolved_at: null, resolved_by_username: null },
    { id: 2, action_type: 'connector_health_check', action_type_label: 'Connector - Health check failed', status: 'pending', title: 'TheHive is not answering', description: 'The last health check failed.', metadata: {}, created_at: ago(90), resolved_at: null, resolved_by_username: null },
  ];
  const LIST = '[data-testid="pending-actions"]';

  const open = () => {
    cy.get('button[aria-label="Pending actions"]', { timeout: 20000 }).click();
    cy.get(LIST).should('be.visible');
  };

  beforeEach(() => {
    cy.viewport(1440, 900);
    cy.on('uncaught:exception', () => false);
    cy.intercept('GET', '/api/**', { statusCode: 404, body: {} });
    cy.intercept('GET', '/api/auth/user', { statusCode: 200, body: USER });
    cy.intercept('GET', '/api/auth/profile', { statusCode: 200, body: { theme: 'darkly', preferences: { onboarding: { dismissed: true } }, avatar_color: null } });
    cy.intercept('GET', '/api/common/pending_actions/count/', { statusCode: 200, body: { count: 2 } });
    cy.intercept('GET', '/api/common/pending_actions/?*', { statusCode: 200, body: ACTIONS }).as('list');
    cy.intercept('GET', '/api/connectors/', { statusCode: 200, body: [] });
    cy.visit('/#/activity', { onBeforeLoad: (win) => win.localStorage.setItem('token', 'mock-token-pending') });
  });

  it('puts a cross and a green button at the right of each action, named after what approving does', () => {
    open();
    cy.get('[data-testid="pending-action"]').should('have.length', 2);
    cy.get('[data-testid="pending-action"]').eq(0).should('contain', 'UDRP Transfer: thales.com').within(() => {
      cy.get('button[aria-label="Reject: UDRP Transfer: thales.com"]').should('be.visible');
      cy.contains('button', 'Approve and transfer').should('be.visible').and('have.css', 'background-color').and('not.eq', 'rgba(0, 0, 0, 0)');
    });
    // A failed health check is only acknowledged: nothing is carried out
    cy.get('[data-testid="pending-action"]').eq(1).within(() => {
      cy.contains('button', 'Acknowledge').should('be.visible');
      cy.get('button[aria-label^="Reject"]').should('be.visible');
    });
  });

  it('names what approving does for a domain that is now available and for a lost legitimate domain', () => {
    const domain = (id, type, label, title, metadata) => ({ id, action_type: type, action_type_label: label, status: 'pending', title, description: 'The registry no longer knows it.', metadata, created_at: ago(5) });
    cy.intercept('GET', '/api/common/pending_actions/?*', {
      statusCode: 200,
      body: [
        domain(3, 'site_domain_available', 'Website Monitoring - Domain now available', 'Domain available: phish.com', { site_id: 4, domain_name: 'phish.com', legitimacy: 5, new_legitimacy: 6, last_registrar: 'Gandi' }),
        domain(4, 'legitimate_domain_lost', 'Legitimate Domains - Domain no longer registered', 'Domain lost: thales.fr', { domain_id: 9, domain_name: 'thales.fr', last_expiry: '2026-11-02' }),
      ],
    });
    open();
    cy.contains('[data-testid="pending-action"]', 'Domain available: phish.com').contains('button', 'Mark as available').should('be.visible');
    cy.contains('[data-testid="pending-action"]', 'Domain lost: thales.fr').contains('button', 'Move to monitoring').should('be.visible');
    // The details show what is useful and hide what only the server needs
    cy.contains('[data-testid="pending-action"]', 'Domain lost: thales.fr').find('.MuiListItemButton-root').click();
    cy.contains('Last expiry').should('be.visible');
    cy.contains('Domain id').should('not.exist');
  });

  it('keeps the buttons at the right of the row, after the title', () => {
    open();
    cy.get('[data-testid="pending-action"]').first().then(($row) => {
      const row = $row[0].getBoundingClientRect();
      const title = $row.find('.MuiListItemText-root')[0].getBoundingClientRect();
      const approve = [...$row.find('button')].find((b) => /Approve and transfer/.test(b.textContent)).getBoundingClientRect();
      expect(approve.left).to.be.greaterThan(title.left);
      expect(row.right - approve.right).to.be.lessThan(24);
    });
  });

  it('approves from the list without opening the details', () => {
    cy.intercept('POST', '/api/common/pending_actions/1/approve/', { statusCode: 200, body: { ...ACTIONS[0], status: 'approved' } }).as('approve');
    open();
    cy.contains('[data-testid="pending-action"] button', 'Approve and transfer').click();
    cy.wait('@approve');
    cy.contains('Action approved and carried out').should('be.visible');
    cy.contains('#pending-actions-title', 'Pending actions').should('exist');
  });

  it('rejects from the list with the cross', () => {
    cy.intercept('POST', '/api/common/pending_actions/2/reject/', { statusCode: 200, body: { ...ACTIONS[1], status: 'rejected' } }).as('reject');
    open();
    cy.get('button[aria-label="Reject: TheHive is not answering"]').click();
    cy.wait('@reject');
    cy.contains('Action rejected').should('be.visible');
  });

  describe('deciding several at once', () => {
    const LOST = Array.from({ length: 4 }, (_, i) => ({
      id: 10 + i, action_type: 'legitimate_domain_lost', action_type_label: 'Legitimate Domains - Domain no longer registered', status: 'pending',
      title: `Domain lost: lost-${i}.com`, description: 'The registry says it does not exist.', metadata: { domain_name: `lost-${i}.com` },
      created_at: ago(5), resolved_at: null, resolved_by_username: null,
    }));

    beforeEach(() => {
      cy.intercept('GET', '/api/common/pending_actions/?*', { statusCode: 200, body: [...ACTIONS, ...LOST] }).as('list6');
      cy.intercept('POST', '/api/common/pending_actions/resolve/', { statusCode: 200, body: { succeeded: 4, failed: [] } }).as('resolve');
      open();
    });

    it('ticks one, then all, and says how many are selected', () => {
      cy.get('[data-testid="pending-selection"]').should('contain', '6 waiting');
      cy.get('input[aria-label="Select: Domain lost: lost-0.com"]').check();
      cy.get('[data-testid="pending-selection"]').should('contain', '1 selected of 6');
      cy.get('input[aria-label="Select all the actions"]').check();
      cy.get('[data-testid="pending-selection"]').should('contain', '6 selected of 6');
      cy.get('input[aria-label="Select all the actions"]').uncheck();
      cy.get('[data-testid="pending-selection"]').should('contain', '6 waiting');
    });

    it('approves the ticked ones in one request, after a confirmation that names what is done', () => {
      LOST.forEach((a) => cy.get(`input[aria-label="Select: ${a.title}"]`).check());
      cy.contains('button', 'Move to monitoring 4').click();
      cy.get('[role="dialog"]').last().should('contain', 'Move 4 domains to Website Monitoring?').and('contain', 'lost-0.com, lost-1.com, lost-2.com and 1 more').and('contain', 'go under watch in Website Monitoring').and('not.contain', 'Domain lost:');
      cy.get('[role="dialog"]').last().contains('button', 'Move to monitoring 4').click();
      cy.wait('@resolve').its('request.body').should('deep.equal', { ids: [10, 11, 12, 13], decision: 'approve' });
      cy.get('[data-testid="pending-selection"]').should('not.contain', 'selected');
    });

    it('rejects the ticked ones in one request', () => {
      cy.get('input[aria-label="Select: Domain lost: lost-1.com"]').check();
      cy.get('input[aria-label="Select: Domain lost: lost-2.com"]').check();
      cy.contains('button', 'Reject 2').click();
      cy.get('[role="dialog"]').last().should('contain', 'Reject 2 actions?').and('contain', 'lost-1.com, lost-2.com stay in Legitimate Domains').and('contain', 'will not be proposed again');
      cy.get('[role="dialog"]').last().contains('button', 'Reject 2').click();
      cy.wait('@resolve').its('request.body').should('deep.equal', { ids: [11, 12], decision: 'reject' });
    });

    it('calls them Approve when the ticked ones are not all of the same kind', () => {
      cy.get('input[aria-label="Select: TheHive is not answering"]').check();
      cy.get('input[aria-label="Select: Domain lost: lost-0.com"]').check();
      cy.contains('button', 'Approve 2').should('be.visible');
    });
  });

  it('still opens the details when the title is clicked, with the same names on its buttons', () => {
    open();
    cy.contains('[data-testid="pending-action"]', 'UDRP Transfer: thales.com').find('.MuiListItemButton-root').click();
    cy.contains('#pending-actions-title', 'UDRP Transfer: thales.com');
    cy.contains('button', 'Approve and transfer').should('be.visible');
    cy.contains('button', 'Reject').should('be.visible');
  });

  it('shows the reason when the server refuses', () => {
    cy.intercept('POST', '/api/common/pending_actions/1/approve/', { statusCode: 400, body: { error: 'This action is no longer pending.' } });
    open();
    cy.contains('[data-testid="pending-action"] button', 'Approve and transfer').click();
    cy.contains('This action is no longer pending.').should('be.visible');
    cy.get('[data-testid="pending-action"]').should('have.length', 2);
  });
});
