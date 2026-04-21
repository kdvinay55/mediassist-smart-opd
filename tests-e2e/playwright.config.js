// playwright.config.js — MediAssist E2E suite
// Boots both server (port 5000) and client (port 5173) for local runs.
// Set BASE_URL / API_URL env vars to point at a different deployment.
import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const API_URL = process.env.API_URL || 'http://localhost:5000';
const SKIP_WEBSERVER = process.env.SKIP_WEBSERVER === '1';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: false,           // workflow tests have shared seeded state
  workers: process.env.CI ? 1 : 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000, toHaveScreenshot: { maxDiffPixelRatio: 0.04 } },

  // Create missing snapshots on first run instead of failing.
  updateSnapshots: 'missing',

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }]
  ],

  globalSetup: path.resolve(__dirname, './global-setup.js'),

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'Accept': 'application/json, */*' }
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'chromium-tablet',
      testMatch: /07-ui-validation\.spec\.js/,
      use: { ...devices['iPad Pro 11'], browserName: 'chromium', defaultBrowserType: 'chromium' }
    },
    {
      name: 'chromium-mobile',
      testMatch: /07-ui-validation\.spec\.js/,
      use: { ...devices['Pixel 7'], browserName: 'chromium', defaultBrowserType: 'chromium' }
    },
    // Cross-browser smoke: only auth, error-handling, RBAC and AI API specs.
    // Visual regression is Chromium-only by design (snapshots are pixel-stable per browser).
    {
      name: 'firefox-smoke',
      testMatch: /(01-auth|06-ai-assistant|10-error-handling|12-access-control)\.spec\.js/,
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit-smoke',
      testMatch: /(01-auth|06-ai-assistant|10-error-handling|12-access-control)\.spec\.js/,
      use: { ...devices['Desktop Safari'] }
    }
  ],

  webServer: SKIP_WEBSERVER ? undefined : [
    {
      command: 'npm run dev',
      cwd: path.resolve(repoRoot, 'server'),
      url: `${API_URL}/api/health`,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { NODE_ENV: 'development', PORT: '5000' }
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      cwd: path.resolve(repoRoot, 'client'),
      url: BASE_URL,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe'
    }
  ]
});
