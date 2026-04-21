// Phase 3 — Authentication tests for every role
import { test, expect } from '@playwright/test';
import { USERS, API_URL } from '../fixtures/test-data.js';
import { uiLogin, expectDashboardLoaded, logout } from '../fixtures/ui.js';

test.describe('Phase 3 — Authentication', () => {

  for (const role of ['patient', 'receptionist', 'doctor', 'lab', 'admin']) {
    test(`${role} login → dashboard renders`, async ({ page }) => {
      await uiLogin(page, role);
      await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
      await expectDashboardLoaded(page);

      // Verify the JWT lives in localStorage and is non-empty
      const token = await page.evaluate(() => localStorage.getItem('token'));
      expect(token, `JWT should be stored after login as ${role}`).toBeTruthy();
      expect(token.length).toBeGreaterThan(20);
    });
  }

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder(/you@example.com|9876543210/).fill(USERS.patient.identifier);
    await page.getByPlaceholder(/Enter password/i).fill('totallyWrongPassword!');
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();

    // Stay on /login (no redirect to /dashboard) — primary signal of failed login
    await page.waitForTimeout(2500);
    await expect(page).not.toHaveURL(/\/dashboard/);
    expect(page.url()).toMatch(/\/login/);

    // Token must NOT have been persisted
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeFalsy();
  });

  test('session persists across page reload', async ({ page }) => {
    await uiLogin(page, 'doctor');
    await expectDashboardLoaded(page);
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expectDashboardLoaded(page);
  });

  test('logout clears the session and redirects to /login', async ({ page }) => {
    await uiLogin(page, 'patient');
    await expectDashboardLoaded(page);
    await logout(page);
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeNull();
    await page.goto('/dashboard');
    // Either bounced to login or stuck behind a guard
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('API rejects requests without a token', async ({ request }) => {
    const r = await request.get(`${API_URL}/api/notifications`);
    expect([401, 403]).toContain(r.status());
  });

  test('API rejects requests with a tampered token', async ({ request }) => {
    const r = await request.get(`${API_URL}/api/notifications`, {
      headers: { Authorization: 'Bearer not-a-real-jwt-token' }
    });
    expect([401, 403]).toContain(r.status());
  });
});
