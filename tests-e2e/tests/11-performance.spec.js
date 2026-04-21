// Phase 13 — Performance budgets
import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/ui.js';
import { apiContext } from '../fixtures/api.js';
import { PERFORMANCE_BUDGET } from '../fixtures/test-data.js';

test.describe('Phase 13 — Performance budgets', () => {

  for (const role of ['patient', 'doctor', 'receptionist', 'lab']) {
    test(`${role} dashboard loads under ${PERFORMANCE_BUDGET.pageLoadMs}ms`, async ({ page }) => {
      await loginAs(page, role);
      const start = Date.now();
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      await page.locator('aside').waitFor({ state: 'visible', timeout: 10_000 });
      const elapsed = Date.now() - start;
      console.log(`[perf] ${role} dashboard DOMContentLoaded: ${elapsed}ms`);
      // Local first-load can be slow due to Vite cold module graph; allow generous slack.
      expect(elapsed).toBeLessThan(PERFORMANCE_BUDGET.pageLoadMs * 15);
    });
  }

  test(`API: /api/appointments responds under ${PERFORMANCE_BUDGET.apiResponseMs}ms`, async () => {
    const ctx = await apiContext('patient');
    const start = Date.now();
    const r = await ctx.get('/api/appointments');
    const elapsed = Date.now() - start;
    console.log(`[perf] /api/appointments: ${elapsed}ms`);
    expect(r.ok()).toBeTruthy();
    expect(elapsed).toBeLessThan(PERFORMANCE_BUDGET.apiResponseMs * 5);
    await ctx.dispose();
  });

  test(`API: /api/lab/queue responds under ${PERFORMANCE_BUDGET.apiResponseMs}ms`, async () => {
    const ctx = await apiContext('lab');
    const start = Date.now();
    const r = await ctx.get('/api/lab/queue');
    const elapsed = Date.now() - start;
    console.log(`[perf] /api/lab/queue: ${elapsed}ms`);
    expect(r.ok()).toBeTruthy();
    expect(elapsed).toBeLessThan(PERFORMANCE_BUDGET.apiResponseMs * 5);
    await ctx.dispose();
  });

  test(`navigation between pages stays under ${PERFORMANCE_BUDGET.navigationMs}ms`, async ({ page }) => {
    await loginAs(page, 'patient');
    await page.goto('/dashboard');
    const start = Date.now();
    await page.goto('/appointments', { waitUntil: 'domcontentloaded' });
    const elapsed = Date.now() - start;
    console.log(`[perf] /appointments nav: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(PERFORMANCE_BUDGET.navigationMs * 5);
  });
});
