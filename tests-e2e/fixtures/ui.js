// UI helpers — login, navigation, common waits.
import { expect } from '@playwright/test';
import { USERS, API_URL } from './test-data.js';
import { apiLogin } from './api.js';

/**
 * Fast login by injecting a real JWT into localStorage. Avoids hitting the
 * login form on every test (saves ~1.5s per test). The app reads `auth-token`
 * + `auth-user` keys (see client/src/context/AuthContext.jsx).
 */
export async function loginAs(page, role) {
  const user = USERS[role];
  const token = await apiLogin(role);

  // First load any URL on the origin so localStorage is writable
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({
      id: user.id || 'tester',
      name: user.name,
      role: user.role,
      department: user.department || '',
      email: user.identifier.includes('@') ? user.identifier : '',
      phone: user.identifier.includes('@') ? '' : user.identifier
    }));
  }, { token, user });
  await page.goto('/dashboard');
}

/** UI-driven login (used by the auth tests themselves). */
export async function uiLogin(page, role) {
  const user = USERS[role];
  await page.goto('/login');
  await page.getByPlaceholder(/you@example.com|9876543210/).fill(user.identifier);
  await page.getByPlaceholder(/Enter password/i).fill(user.password);
  await page.getByRole('button', { name: /sign in|log in|login/i }).click();
}

/** Wait for the AppLayout to render — confirms post-login bootstrap completed. */
export async function expectDashboardLoaded(page) {
  await expect(page.locator('aside')).toBeVisible({ timeout: 15_000 });
}

export async function logout(page) {
  await page.evaluate(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  });
  await page.goto('/login');
}

/** Resolve VITE_API_URL inside the page so XHR calls go to the right host. */
export async function setRuntimeApi(page) {
  await page.addInitScript((apiUrl) => {
    window.__TEST_API_URL__ = apiUrl;
  }, API_URL);
}
