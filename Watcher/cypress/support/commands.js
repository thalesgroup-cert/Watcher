// Global configuration and setup
Cypress.on('uncaught:exception', (err, runnable) => {
  // Prevent Cypress from failing on uncaught exceptions
  console.log('Uncaught exception:', err);
  return false;
});

// Authentication helper command
Cypress.Commands.add('authenticateWithTestUser', () => {
  const credentials = Cypress.env('testCredentials');
  
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
  
  cy.url().should('include', '#/').should('not.include', '/login');
  cy.get('.navbar').should('exist');
  
  cy.window().then((win) => {
    const token = win.localStorage.getItem('token') || win.sessionStorage.getItem('token');
    if (token) {
      cy.log('Token captured and saved');
      Cypress.env('authToken', token);
    }
    
    const authData = {
      token: token || 'mock-token-123456789',
      user: win.localStorage.getItem('user') || win.sessionStorage.getItem('user'),
      isAuthenticated: true
    };
    
    Cypress.env('authData', authData);
  });
  
  cy.log('Authentication completed');
});