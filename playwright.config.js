// Configuration des tests de bout en bout (Playwright).
// Seul le dossier tests/e2e est concerné : les tests unitaires (*.test.js) tournent avec node --test.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.js',
  // En intégration continue : un test.only oublié fait échouer, rapport HTML conservé
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:8000',
    // Service worker bloqué par défaut : son cache servirait les fichiers à la place du
    // serveur (et de page.route). Seuls les tests hors ligne l'autorisent (hors-ligne.spec.js,
    // critère 6 de criteres-mvp.spec.js), sur leur propre serveur (tests/e2e/outils/serveur.js).
    serviceWorkers: 'block',
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
