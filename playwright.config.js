// Configuration des tests de bout en bout (Playwright).
// Seul le dossier tests/e2e est concerné : les tests unitaires (*.test.js) tournent avec node --test.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.js',
  use: {
    baseURL: 'http://localhost:8000',
  },
  // Sert l'application avant les tests (réutilise un serveur déjà lancé en local).
  webServer: {
    command: 'npm run serve',
    url: 'http://localhost:8000',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});
