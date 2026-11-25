// Global configuration and setup
Cypress.on('uncaught:exception', (err, runnable) => {
  // Prevent Cypress from failing on uncaught exceptions
  console.log('Uncaught exception:', err);
  return false;
});

// Authentication helper command
Cypress.Commands.add('authenticateWithTestUser', () => {
  const credentials = Cypress.expose('testCredentials');
  
  cy.log('Performing authentication with test user...');
  cy.visit('/#/login');
  
  cy.get('input[type="text"], input[name="username"]', { timeout: 10000 })
    .should('be.visible')
    .should('not.be.disabled')
    .type(credentials.username);
  
  cy.get('input[type="password"], input[name="password"]')
    .should('be.visible')
    .should('not.be.disabled')
    .type(credentials.password);
  
  cy.get('button[type="submit"], button:contains("Login")')
    .should('not.be.disabled')
    .click();
  
  cy.url({ timeout: 15000 }).should('include', '#/').and('not.include', '/login');
  cy.get('header.MuiAppBar-root', { timeout: 15000 }).should('exist');
  
  cy.log('Authentication completed');
});