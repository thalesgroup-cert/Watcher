const { defineConfig } = require('cypress');

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
    }
  }
});
