// Phase 15 — Visual regression (snapshots)
// First run creates baselines; subsequent runs diff against them.
import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/ui.js';

const SNAP_OPTS = {
  maxDiffPixelRatio: 0.04,
  // viewport-only (not fullPage) keeps the screenshot size deterministic across runs
  // even when the number of appointments/records grows.
  animations: 'disabled',
  clip: { x: 0, y: 0, width: 1280, height: 720 }
};

test.describe('Phase 15 — Visual regression', () => {

  test('login page snapshot', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('login.png', SNAP_OPTS);
  });

  for (const role of ['patient', 'doctor', 'receptionist', 'lab']) {
    test(`${role} dashboard snapshot`, async ({ page }) => {
      await loginAs(page, role);
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      // Mask volatile widgets (timestamps, live notification counters, charts)
      const masks = [
        page.locator('[class*="time"], [class*="clock"], time'),
        page.locator('[class*="badge"]')
      ];
      await expect(page).toHaveScreenshot(`dashboard-${role}.png`, { ...SNAP_OPTS, mask: masks });
    });
  }
});
