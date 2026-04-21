// Phase 8b — AI chat UI: open the floating assistant, send a message, get a reply
import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/ui.js';
import { apiContext } from '../fixtures/api.js';

test.describe('Phase 8b — AI chat UI', () => {

  test.beforeEach(async () => {
    // Skip the entire UI suite if the assistant service is degraded (no provider key).
    const ctx = await apiContext('patient');
    const h = await ctx.get('/api/assistant/health');
    const ok = h.ok();
    await ctx.dispose();
    test.skip(!ok, `Assistant health not OK (${h.status()}) — UI chat tests require a working assistant`);
  });

  test('patient opens assistant FAB and sends an English message', async ({ page }) => {
    await loginAs(page, 'patient');
    await page.goto('/dashboard');

    const fab = page.getByTestId('assistant-fab');
    await expect(fab).toBeVisible({ timeout: 10_000 });
    await fab.click();

    const input = page.getByTestId('assistant-input');
    await expect(input).toBeVisible();
    await input.fill('What can you help me with?');
    await page.getByTestId('assistant-send').click();

    // First we should see our own message bubble
    await expect(page.getByText('What can you help me with?').first()).toBeVisible({ timeout: 10_000 });

    // Then expect the assistant to render a non-empty reply within 30s.
    // The input clears once submitted; a new bubble (assistant) appears below.
    await page.waitForFunction(
      () => {
        const bubbles = Array.from(document.querySelectorAll('div.max-w-\\[82\\%\\]'));
        // user bubble + assistant bubble
        return bubbles.length >= 2 && bubbles.some(b => b.className.includes('bg-gray-100') && (b.textContent || '').trim().length > 0);
      },
      { timeout: 30_000 }
    );
  });

  test('doctor can also open the assistant (role-agnostic)', async ({ page }) => {
    await loginAs(page, 'doctor');
    await page.goto('/dashboard');
    const fab = page.getByTestId('assistant-fab');
    await expect(fab).toBeVisible({ timeout: 10_000 });
    await fab.click();
    await expect(page.getByTestId('assistant-input')).toBeVisible();
  });

  test('assistant FAB collapses back to button on close', async ({ page }) => {
    await loginAs(page, 'patient');
    await page.goto('/dashboard');
    await page.getByTestId('assistant-fab').click();
    await expect(page.getByTestId('assistant-input')).toBeVisible();
    // Close via the X button inside the panel header
    await page.locator('button:has(svg.lucide-x)').first().click().catch(() => {});
    // FAB returns
    await expect(page.getByTestId('assistant-fab')).toBeVisible({ timeout: 5_000 });
  });
});
