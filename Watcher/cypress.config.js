const { defineConfig } = require('cypress');
const createBundler = require('@bahmutov/cypress-esbuild-preprocessor');

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://127.0.0.1:8000',

    env: {
      testCredentials: {
        username: 'Watcher',
        password: 'Watcher',
        email: 'cypress@watcher.com',
        firstName: 'Watcher'
      }
    },

    setupNodeEvents(on, config) {
      on('file:preprocessor', createBundler());

      on('before:browser:launch', (browser = {}, launchOptions) => {
        if (browser.family === 'chromium') {
          launchOptions.args.push('--enable-unsafe-swiftshader');
          launchOptions.args.push('--ignore-gpu-blocklist');
        }
        return launchOptions;
      });

      return config;
    }
  }
});
