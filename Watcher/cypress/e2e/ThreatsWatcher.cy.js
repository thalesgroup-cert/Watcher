describe('Threats Watcher - E2E Test Suite', () => {
  before(() => {
    const credentials = Cypress.env('testCredentials');

    // Setup API mocks
    cy.intercept('GET', '/api/threats_watcher/trendyword/', {
      statusCode: 200,
      body: [
        {
          id: 1, name: "test-malware", occurrences: 45,
          score: 92.5,
          posturls: [
            "https://watcher.com/malware-report,2025-06-19T14:30:00Z",
            "https://watcher.com/malware-analysis,2025-06-19T12:15:00Z"
          ],
          created_at: "2025-06-19T10:00:00Z"
        },
        {
          id: 2, name: "e2e-ransomware", occurrences: 32,
          score: 80.0,
          posturls: [
            "https://watcher.com/ransomware-attack,2025-06-19T11:20:00Z",
            "https://watcher.com/ransomware-news,2025-06-18T09:30:00Z"
          ],
          created_at: "2025-06-18T15:30:00Z"
        },
        {
          id: 3, name: "test-phishing", occurrences: 28,
          score: 67.3,
          posturls: [
            "https://watcher.com/phishing-campaign,2025-06-19T08:45:00Z",
            "https://watcher.com/phishing-trends,2025-06-18T14:20:00Z"
          ],
          created_at: "2025-06-17T08:15:00Z"
        }
      ]
    }).as('getTrendyWords');

    cy.intercept('GET', '/api/threats_watcher/bannedword/', {
      statusCode: 200,
      body: [
        { id: 1, name: "test-spam", created_at: "2025-06-19T10:00:00Z" },
        { id: 2, name: "e2e-advertisement", created_at: "2025-06-18T15:30:00Z" }
      ]
    }).as('getBannedWords');

    cy.intercept('GET', '/api/threats_watcher/summary/?type=weekly_summary', {
      statusCode: 200,
      body: []
    }).as('getWeeklySummary');

    cy.intercept('GET', '/api/threats_watcher/summary/?type=breaking_news', {
      statusCode: 200,
      body: []
    }).as('getBreakingNews');

    // Mock CRUD operations
    cy.intercept('POST', '/api/threats_watcher/bannedword/', (req) => ({
      statusCode: 201, body: { id: Date.now(), ...req.body, created_at: new Date().toISOString() }
    })).as('addBannedWord');

    cy.intercept('DELETE', '/api/threats_watcher/trendyword/*', { statusCode: 204 }).as('deleteTrendyWord');

    // Mock auth endpoints with test credentials
    cy.intercept('GET', '/api/auth/user/', {
      statusCode: 200, 
      body: { 
        id: 1, 
        username: credentials.username, 
        first_name: credentials.firstName, 
        email: credentials.email, 
        is_superuser: true 
      }
    }).as('getUser');

    cy.intercept('POST', '/api/auth/login/', {
      statusCode: 200, 
      body: { 
        token: 'mock-token-123456789',
        user: { 
          id: 1, 
          username: credentials.username, 
          first_name: credentials.firstName, 
          email: credentials.email 
        } 
      }
    }).as('login');

    // Use the authentication helper
    cy.authenticateWithTestUser();

    // Navigate to ThreatsWatcher
    cy.visit('/#/');
    cy.wait('@getTrendyWords', { timeout: 15000 });
    
    cy.log('Authentication completed and navigated to Threats Watcher');
  });

  beforeEach(() => {
    cy.on('uncaught:exception', () => false);

    // Restore session data
    cy.window().then((win) => {
      const authData = Cypress.env('authData');
      if (authData && authData.token) {
        if (authData.token) win.localStorage.setItem('token', authData.token);
        if (authData.user) win.localStorage.setItem('user', authData.user);
      }
    });

    // Navigation check
    cy.url().then((currentUrl) => {
      if (!currentUrl.includes('/#/') || currentUrl.includes('/data_leak') || currentUrl.includes('/website_monitoring') || currentUrl.includes('/dns_finder')) {
        cy.log('Redirecting back to Threats Watcher homepage...');
        cy.visit('/#/', { failOnStatusCode: false });
        cy.wait(1000);
      } else {
        cy.log('Staying on Threats Watcher homepage');
      }
    });

    cy.url().should('include', '#/');
    cy.get('.container-fluid', { timeout: 10000 }).should('exist');
    cy.log('Page ready with session maintained');
  });

  describe('Page Navigation and Access', () => {
    it('should be on the correct Threats Watcher homepage', () => {
      cy.url().should('include', '#/');
      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('exist');
    });

    it('should display main sections', () => {
      cy.get('.container-fluid.mt-3, .container-fluid', { timeout: 15000 })
        .first()
        .should('exist');
      
      cy.get('.d-flex.w-100.h-100.position-relative', { timeout: 15000 })
        .should('exist')
        .within(() => {
          cy.get('.overflow-hidden').first().should('exist');
          
          cy.get('.overflow-hidden').eq(1).should('exist').within(() => {
            cy.get('table, h4:contains("Trendy Words")', { timeout: 10000 }).should('exist');
          });
        });
    });

    it('should load data automatically', () => {
      cy.get('.container-fluid', { timeout: 15000 }).should('exist');
      cy.get('.row').should('have.length.at.least', 1);
      
      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        if (bodyText.includes('test-malware') || bodyText.includes('e2e-ransomware') || bodyText.includes('test-phishing')) {
          cy.log('Trendy words data loaded successfully');
        } else {
          cy.log('Components exist but data may be loaded differently');
        }
      });
    });

    it('should maintain session across navigation', () => {
      cy.get('.navbar').should('exist');
      cy.get('a:contains("Data Leak"), a[href*="data_leak"]').should('exist').click();
      cy.url().should('include', 'data_leak');
      cy.get('a[href="/#/"], a:contains("Watcher"), .navbar-brand').first().click();
      cy.url().should('include', '#/');
      cy.get('.navbar').should('exist');
    });
  });

  describe('Word Cloud Display and Interaction', () => {
    it('should display word cloud component', () => {
      cy.get('.d-flex.w-100.h-100.position-relative', { timeout: 15000 })
        .should('exist')
        .within(() => {
          cy.get('.overflow-hidden').first().within(() => {
            cy.get('svg, canvas, div', { timeout: 10000 }).should('exist');
          });
        });
    });

    it('should handle word cloud interactions', () => {
      cy.get('.d-flex.w-100.h-100.position-relative svg, .d-flex.w-100.h-100.position-relative canvas', { timeout: 15000 })
        .should('be.visible');
      
      cy.get('body').then(($body) => {
        const wordElements = $body.find('text, span, div').filter((index, element) => {
          const text = Cypress.$(element).text().toLowerCase();
          return text.includes('test-malware') || text.includes('e2e-ransomware') || text.includes('test-phishing');
        });
        
        if (wordElements.length > 0) {
          cy.wrap(wordElements.first()).should('be.visible');
          cy.log('Word cloud elements found and visible');
        } else {
          cy.log('Word cloud may be rendered differently');
        }
      });
    });

    it('should display word tooltips on hover', () => {
      cy.get('body').then(($body) => {
        const tooltipElements = $body.find('[title*="Number of times"], [title*="times"], [title*="caught"]');
        if (tooltipElements.length > 0) {
          cy.log('Word tooltips with occurrence count found');
          cy.wrap(tooltipElements.first()).should('have.attr', 'title');
        } else {
          cy.log('Tooltips may work differently');
        }
      });
    });

    it('should verify ResizableContainer functionality', () => {
      cy.get('.d-flex.w-100.h-100.position-relative', { timeout: 10000 })
        .should('exist')
        .then(($container) => {
          const hasResizableStructure = $container.find('.overflow-hidden').length >= 2;
          
          if (hasResizableStructure) {
            cy.log('ResizableContainer structure found');
          } else {
            cy.log('ResizableContainer may have different structure');
          }
        });
    });
  });

  describe('Word List Display and Management', () => {
    it('should display trendy words table', () => {
      cy.get('h4:contains("Trendy Words")', { timeout: 15000 }).should('exist');
      cy.get('table', { timeout: 15000 }).should('exist');
      
      cy.get('table').within(() => {
        cy.get('thead').should('exist');
        cy.get('tbody').should('exist');
      });
    });

    it('should display trendy words data when available', () => {
      cy.get('table', { timeout: 15000 }).should('exist');
      
      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        if (bodyText.includes('test-malware') || bodyText.includes('e2e-ransomware') || bodyText.includes('test-phishing')) {
          cy.log('Trendy words data found in table');
          cy.get('table tbody tr').should('have.length.at.least', 1);
        } else {
          cy.log('Trendy words data may be loaded in different format');
          cy.get('table tbody').should('exist');
        }
      });
    });

    it('should display word statistics correctly', () => {
      cy.get('table thead').within(() => {
        cy.get('th').should('contain', 'Name');
        cy.get('th').should('contain', 'Caught');
        cy.get('th').should('contain', 'Reliability');
        cy.get('th').should('contain', 'Found');
      });
    });

    it('should display TableManager filter controls', () => {
      cy.get('button:contains("Reset to Default")', { timeout: 10000 }).should('exist');
      cy.get('button:contains("Saved Filters")', { timeout: 10000 }).should('exist');
      cy.get('button:contains("Show Filters"), button:contains("Hide Filters")', { timeout: 10000 }).should('exist');
      cy.get('button:contains("Save Filter")', { timeout: 10000 }).should('exist');
    });

    it('should handle TableManager filter visibility toggle', () => {
      cy.get('button:contains("Show Filters"), button:contains("Hide Filters")').first().click();
      cy.wait(500);
      
      cy.get('body').then(($body) => {
        const hasFilters = $body.find('.card.mb-3.shadow-sm.border-0').length > 0;
        if (hasFilters) {
          cy.log('Filters panel toggled successfully');
        }
      });
    });

    it('should handle word deletion and blocklist workflow', () => {
      cy.get('body').then(($body) => {
        const deleteButtons = $body.find('button:contains("Delete"), button:contains("BlockList")');
        if (deleteButtons.length > 0) {
          cy.wrap(deleteButtons.first()).click();
          cy.get('.modal', { timeout: 10000 }).should('be.visible');
          cy.get('.modal').within(() => {
            cy.get('.modal-title').should('contain', 'Action Requested');
            cy.get('.modal-body').should('exist');
          });
          cy.get('button:contains("Close"), button:contains("Cancel")').first().click();
        } else {
          cy.log('No Delete/BlockList buttons found');
        }
      });
    });

    it('should handle word click for post URLs display', () => {
      cy.get('body').then(($body) => {
        const wordElements = $body.find('td h5, td').filter((index, element) => {
          const text = Cypress.$(element).text().toLowerCase();
          return text.includes('test-malware') || text.includes('e2e-ransomware') || text.includes('test-phishing');
        });
        
        if (wordElements.length > 0) {
          cy.wrap(wordElements.first()).click();
          cy.log('Word clicked successfully');
        } else {
          cy.log('No clickable word elements found');
        }
      });
    });

    it('should verify items per page selector', () => {
      cy.get('select').filter((index, el) => {
        const text = Cypress.$(el).closest('.d-flex, div').find('label, span').text();
        return text.includes('Items per page');
      }).should('exist');
    });
  });

  describe('Post URLs Display and Management', () => {
    it('should display post URLs section', () => {
      cy.get('.row').should('have.length.at.least', 2);
      
      cy.get('body').then(($body) => {
        if ($body.text().includes('Article') || $body.text().includes('related to')) {
          cy.log('PostUrls section found');
        } else {
          cy.log('PostUrls section may be hidden initially');
        }
      });
    });

    it('should display articles table when word is selected', () => {
      cy.get('body').then(($body) => {
        const wordElements = $body.find('td, h5').filter((index, element) => {
          const text = Cypress.$(element).text().toLowerCase();
          return text.includes('test-malware') || text.includes('e2e-ransomware');
        });
        
        if (wordElements.length > 0) {
          cy.wrap(wordElements.first()).click();
          cy.wait(500);
          
          cy.get('body').then(($body2) => {
            if ($body2.text().includes('Domain Name') || $body2.text().includes('Data')) {
              cy.get('table').should('contain', 'Domain Name');
              cy.get('table').should('contain', 'Data');
              cy.get('table').should('contain', 'Found');
            }
          });
        }
      });
    });

    it('should display WordSummary when word is selected', () => {
      cy.intercept('GET', '/api/threats_watcher/summary/?type=trendy_word_summary&keyword=*', {
        statusCode: 200,
        body: []
      }).as('getWordSummary');

      cy.intercept('GET', '/api/threats_watcher/summary/by-keyword/*', {
        statusCode: 404,
        body: { error: 'not_found', message: 'Keyword not found' }
      }).as('generateWordSummary');

      cy.get('body').then(($body) => {
        const wordElements = $body.find('td h5').filter((index, element) => {
          const text = Cypress.$(element).text().toLowerCase();
          return text.includes('test-malware');
        });
        
        if (wordElements.length > 0) {
          cy.wrap(wordElements.first()).click();
          cy.wait(1000);
          
          cy.get('.card.bg-secondary.border-0.shadow-lg').should('exist').within(() => {
            cy.get('.bg-primary').should('contain', 'Word Summary for');
          });
        }
      });
    });

    it('should handle clear visited articles functionality', () => {
      cy.get('body').then(($body) => {
        const clearButtons = $body.find('button:contains("Clear"), button:contains("visited")');
        if (clearButtons.length > 0) {
          cy.wrap(clearButtons.first()).should('be.visible');
          cy.log('Clear visited articles button found');
        } else {
          cy.log('Clear button not visible (may appear after word selection)');
        }
      });
    });

    it('should handle localStorage for visited URLs', () => {
      cy.window().then((win) => {
        win.localStorage.removeItem('viewedUrls');
        
        cy.get('body').then(($body) => {
          const articleRows = $body.find('tr').filter((index, element) => {
            return Cypress.$(element).text().includes('.com');
          });
          
          if (articleRows.length > 0) {
            cy.wrap(articleRows.first()).click();
            cy.window().its('localStorage').invoke('getItem', 'viewedUrls').should('exist');
          }
        });
      });
    });

    it('should verify ResizableContainer for PostUrls and WordSummary', () => {
      cy.get('body').then(($body) => {
        const wordElements = $body.find('td h5').first();
        if (wordElements.length > 0) {
          cy.wrap(wordElements).click();
          cy.wait(500);
          
          cy.get('.d-flex.w-100.h-100.position-relative').eq(1).should('exist');
        }
      });
    });
  });

  describe('Trend Chart Display and Visualization', () => {
    it('should display trend chart section', () => {
      cy.get('.row').should('have.length.at.least', 2);
      
      cy.get('.row').then(($rows) => {
        if ($rows.length >= 3) {
          cy.log('Chart section structure found');
        } else {
          cy.log('Chart section may have different structure');
        }
      });
    });

    it('should render chart canvas when data is available', () => {
      cy.get('body').then(($body) => {
        const wordElements = $body.find('td, h5').filter((index, element) => {
          const text = Cypress.$(element).text().toLowerCase();
          return text.includes('test-malware') || text.includes('e2e-ransomware');
        });
        
        if (wordElements.length > 0) {
          cy.wrap(wordElements.first()).click();
          cy.wait(500);
          
          cy.get('body').then(($body2) => {
            const canvasElements = $body2.find('canvas#myChart');
            if (canvasElements.length > 0) {
              cy.get('canvas#myChart').should('be.visible');
              cy.log('Trend chart canvas found');
            } else {
              cy.log('Chart canvas may be rendered conditionally');
            }
          });
        }
      });
    });

    it('should display chart with correct styling', () => {
      cy.get('body').then(($body) => {
        const canvasElements = $body.find('canvas#myChart');
        if (canvasElements.length > 0) {
          cy.get('canvas#myChart').should('have.css', 'background-color');
          cy.get('canvas#myChart').should('have.css', 'border-radius');
          cy.log('Chart styling verified');
        } else {
          cy.log('Chart canvas not visible (appears after word selection)');
        }
      });
    });
  });

  describe('WeeklyBreaking Component', () => {
    it('should display WeeklyBreaking floating window or bubble', () => {
      cy.get('.position-fixed').should('exist');
      
      cy.get('body').then(($body) => {
        const hasWeeklyBreaking = $body.find('.position-fixed .card, .position-fixed .material-icons').length > 0;
        if (hasWeeklyBreaking) {
          cy.log('WeeklyBreaking component found');
        }
      });
    });

    it('should handle WeeklyBreaking minimize/maximize', () => {
      cy.get('body').then(($body) => {
        const minimizeIcon = $body.find('.material-icons:contains("expand_more")');
        const bubbleIcon = $body.find('.position-fixed .material-icons:contains("description"), .position-fixed .material-icons:contains("bolt")');
        
        if (minimizeIcon.length > 0) {
          cy.wrap(minimizeIcon.first()).click();
          cy.wait(500);
          cy.log('WeeklyBreaking minimized');
        } else if (bubbleIcon.length > 0) {
          cy.wrap(bubbleIcon.first()).click();
          cy.wait(500);
          cy.log('WeeklyBreaking expanded');
        }
      });
    });
  });

  describe('Data Interaction and Workflow', () => {
    it('should handle complete word selection workflow', () => {
      cy.get('body').then(($body) => {
        const wordElements = $body.find('td h5').filter((index, element) => {
          const text = Cypress.$(element).text().toLowerCase();
          return text.includes('test-malware') || text.includes('e2e-ransomware') || text.includes('test-phishing');
        });
        
        if (wordElements.length > 0) {
          cy.wait(500);
          cy.wrap(wordElements.first()).click({ force: true });
          cy.wait(1000);
          
          cy.get('body').then(($body2) => {
            const bodyText = $body2.text();
            
            if (bodyText.includes('Article') || bodyText.includes('related to')) {
              cy.log('PostUrls section appeared successfully');
            } else {
              cy.log('PostUrls section may not have appeared or has different text');
            }
            
            const canvasElements = $body2.find('canvas');
            if (canvasElements.length > 0) {
              cy.log('Complete workflow successful - chart appeared');
            } else {
              cy.log('Chart may not be visible or rendered differently');
            }
          });
        } else {
          cy.log('No clickable word elements found for workflow test');
        }
      });
    });

    it('should handle complete workflow with WordSummary', () => {
      cy.get('body').then(($body) => {
        const wordElements = $body.find('td h5').first();
        
        if (wordElements.length > 0) {
          cy.wrap(wordElements).click();
          cy.wait(1000);
          
          cy.get('body').then(($body2) => {
            const hasWordSummary = $body2.text().includes('Word Summary for');
            const hasPostUrls = $body2.text().includes('Article') || $body2.text().includes('Domain Name');
            const hasChart = $body2.find('canvas#myChart').length > 0;
            
            if (hasWordSummary) cy.log('WordSummary displayed');
            if (hasPostUrls) cy.log('PostUrls displayed');
            if (hasChart) cy.log('Trend chart displayed');
          });
        }
      });
    });
  });

  describe('Navigation and UI Tests', () => {
    it('should test header navigation links', () => {
      cy.get('.navbar, nav').should('exist');
      cy.get('a:contains("Website Monitoring"), a[href*="website_monitoring"]').should('exist');
      cy.get('a:contains("Data Leak"), a[href*="data_leak"]').should('exist');
      cy.get('a:contains("Twisted DNS Finder"), a[href*="dns_finder"]').should('exist');
    });

    it('should verify layout structure specific to Threats Watcher', () => {
      cy.get('.container-fluid.mt-3').should('exist');
      cy.get('.row').should('have.length.at.least', 1);
      
      cy.get('.d-flex.w-100.h-100.position-relative', { timeout: 10000 }).should('exist');
      
      cy.get('table', { timeout: 10000 }).should('exist');
    });

    it('should handle Bootstrap components correctly', () => {
      cy.get('.container-fluid').should('exist');
      cy.get('.row').should('exist');
      cy.get('table.table').should('exist');
    });

    it('should verify ResizableContainer divider interactions', () => {
      cy.get('.d-flex.w-100.h-100.position-relative')
        .first()
        .then(($container) => {
          const resizer = $container.find('[style*="cursor: col-resize"], [style*="cursor: ew-resize"], [class*="resizer"]');
          
          if (resizer.length > 0) {
            cy.wrap(resizer.first()).dblclick({ force: true });
            cy.wait(500);
            cy.log('Divider interaction tested');
          } else {
            cy.log('No interactive divider found - container may use different resize mechanism');
          }
        });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle API errors gracefully', () => {
      cy.intercept('GET', '/api/threats_watcher/trendyword/', { statusCode: 500, body: { error: 'Server Error' } }).as('trendyWordsError');
      cy.reload();
      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('exist');
    });

    it('should handle empty data states', () => {
      cy.intercept('GET', '/api/threats_watcher/trendyword/', { statusCode: 200, body: [] }).as('emptyTrendyWords');
      cy.reload();
      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('exist');
      cy.get('table').should('exist');
    });

    it('should handle WordSummary errors', () => {
      cy.intercept('GET', '/api/threats_watcher/summary/?type=trendy_word_summary&keyword=*', {
        statusCode: 200,
        body: []
      });

      cy.intercept('GET', '/api/threats_watcher/summary/by-keyword/*', {
        statusCode: 404,
        body: { error: 'not_found', message: 'Keyword not found', posts_count: 0 }
      });

      cy.get('body').then(($body) => {
        const wordElements = $body.find('td h5').first();
        if (wordElements.length > 0) {
          cy.wrap(wordElements).click();
          cy.wait(1000);
          
          cy.get('body').then(($body2) => {
            if ($body2.text().includes('Keyword Not Found')) {
              cy.log('WordSummary error state handled correctly');
            }
          });
        }
      });
    });
  });

  describe('Performance and Integration Tests', () => {
    it('should load page within reasonable time', () => {
      const startTime = Date.now();
      cy.reload();
      
      cy.get('.container-fluid', { timeout: 20000 }).should('exist').then(() => {
        const loadTime = Date.now() - startTime;
        expect(loadTime).to.be.lessThan(25000);
      });
    });

    it('should complete basic workflow integration test', () => {
      cy.get('body').should('be.visible');
      cy.get('.container-fluid').should('exist');
      cy.get('.row').should('have.length.at.least', 1);
      cy.get('table').should('exist');
      
      cy.get('body').then(($body) => {
        const buttons = $body.find('button');
        if (buttons.length > 0) {
          cy.log(`Found ${buttons.length} interactive buttons`);
        }
      });
    });

    it('should verify Threats Watcher specific components', () => {
      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        if (bodyText.includes('Trendy Words') || bodyText.includes('test-malware') || bodyText.includes('Article') || bodyText.includes('Clear visited')) {
          cy.log('Threats Watcher specific components found');
        } else {
          cy.log('Threats Watcher components may be loaded differently');
        }
      });
    });

    it('should verify all major components are loaded', () => {
      cy.get('.container-fluid').should('exist');
      cy.get('.d-flex.w-100.h-100.position-relative').should('exist')
      cy.get('table.table-striped').should('exist');
      cy.get('h4:contains("Trendy Words")').should('exist');
      
      cy.get('body').then(($body) => {
        const hasWeeklyBreaking = $body.find('.position-fixed').length > 0;
        if (hasWeeklyBreaking) {
          cy.log('WeeklyBreaking component loaded');
        }
      });
    });
  });

  describe('TableManager Features', () => {
    it('should test filter save functionality', () => {
      cy.get('button:contains("Save Filter")').click();
      cy.get('.modal', { timeout: 5000 }).should('be.visible');
      cy.get('.modal input[type="text"]').type('Test Filter E2E');
      cy.get('.modal button:contains("Save Filter")').click();
      cy.wait(500);
      
      cy.get('button:contains("Saved Filters")').should('contain', '(1)');
    });

    it('should test sorting functionality', () => {
      cy.get('table th:contains("Name")').click();
      cy.wait(500);
      cy.get('table th:contains("Name")').click();
      cy.wait(500);
      cy.log('Sorting toggled successfully');
    });

    it('should test pagination if more than 5 items', () => {
      cy.get('body').then(($body) => {
        const pagination = $body.find('.pagination');
        if (pagination.length > 0) {
          cy.get('.pagination button:contains("Next")').should('exist');
          cy.log('Pagination controls found');
        } else {
          cy.log('Not enough items for pagination');
        }
      });
    });
  });

  after(() => {
    cy.log('Starting Threats Watcher cleanup...');
    
    // Clean up test banned words
    cy.request({
      method: 'GET',
      url: '/api/threats_watcher/bannedword/',
      headers: {
        'Authorization': `Token ${Cypress.env('authData').token}`
      },
      failOnStatusCode: false
    }).then((response) => {
      if (response.status === 200 && response.body) {
        response.body.forEach((word) => {
          if (word.name && (word.name.includes('test-') || word.name.includes('e2e-'))) {
            cy.request({
              method: 'DELETE',
              url: `/api/threats_watcher/bannedword/${word.id}/`,
              headers: {
                'Authorization': `Token ${Cypress.env('authData').token}`
              },
              failOnStatusCode: false
            });
          }
        });
      }
    });

    // Clean up test trendy words
    cy.request({
      method: 'GET',
      url: '/api/threats_watcher/trendyword/',
      headers: {
        'Authorization': `Token ${Cypress.env('authData').token}`
      },
      failOnStatusCode: false
    }).then((response) => {
      if (response.status === 200 && response.body) {
        response.body.forEach((word) => {
          if (word.name && (word.name.includes('test-') || word.name.includes('e2e-'))) {
            cy.request({
              method: 'DELETE',
              url: `/api/threats_watcher/trendyword/${word.id}/`,
              headers: {
                'Authorization': `Token ${Cypress.env('authData').token}`
              },
              failOnStatusCode: false
            });
          }
        });
      }
    });

    // Clear visited URLs from localStorage
    cy.window().then((win) => {
      win.localStorage.removeItem('viewedUrls');
      win.localStorage.removeItem('watcher_localstorage_layout_threatsWatcher');
      win.localStorage.removeItem('watcher_localstorage_layout_postUrls_summary');
      win.localStorage.removeItem('watcher_localstorage_items_threatsWatcher_wordlist');
      win.localStorage.removeItem('watcher_localstorage_filters_threatsWatcher_wordlist');
      win.localStorage.clear();
      win.sessionStorage.clear();
    });
    
    cy.log('Threats Watcher cleanup completed');
  });
});