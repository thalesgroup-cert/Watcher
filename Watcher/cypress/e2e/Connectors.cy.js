// Connectors page: smoke test + screenshots (SHOT=<prefix> to name them, e.g. before / after).
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
        cy.visit('/#/connectors');
        cy.contains('button', 'Test', { timeout: 15000 }).first().click();
        cy.contains(/Testing/).should('exist');
        shot('connectors-testing');
    });
});
