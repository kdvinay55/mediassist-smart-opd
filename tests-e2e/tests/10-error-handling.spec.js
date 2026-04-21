// Phase 12 — Error handling
import { test, expect } from '@playwright/test';
import { apiContext } from '../fixtures/api.js';
import { API_URL } from '../fixtures/test-data.js';

test.describe('Phase 12 — Error handling', () => {

  test('login with empty body returns 400', async ({ request }) => {
    const r = await request.post(`${API_URL}/api/auth/login`, { data: {} });
    expect(r.status()).toBe(400);
    const body = await r.json();
    expect(body.error || body.message).toBeTruthy();
  });

  test('booking an invalid appointment returns clear error', async () => {
    const ctx = await apiContext('patient');
    const r = await ctx.post('/api/appointments', {
      data: { department: '' /* missing date+slot */ }
    });
    expect([400, 422]).toContain(r.status());
    const body = await r.json();
    expect(body.error || body.message).toBeTruthy();
    await ctx.dispose();
  });

  test('verify-assign on non-existent appointment returns 404', async () => {
    const ctx = await apiContext('receptionist');
    const r = await ctx.post('/api/appointments/000000000000000000000000/verify-assign', { data: {} });
    expect([404, 400]).toContain(r.status());
    await ctx.dispose();
  });

  test('verify-assign with bogus doctorId returns 400', async () => {
    // Need a real scheduled appointment — use unique future date + random slot to avoid collisions
    const patientCtx = await apiContext('patient');
    const d = new Date(); d.setDate(d.getDate() + 30 + Math.floor(Math.random() * 150));
    const date = d.toISOString().split('T')[0];
    const hour = 9 + Math.floor(Math.random() * 8);
    const min = Math.floor(Math.random() * 60);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour > 12 ? hour - 12 : hour;
    const timeSlot = `${String(h12).padStart(2, '0')}:${String(min).padStart(2, '0')} ${ampm}`;
    const apt = await patientCtx.post('/api/appointments', {
      data: {
        department: 'Cardiology', date, timeSlot,
        symptoms: ['chest pain'], reasonForVisit: 'Bogus doctor test ' + Date.now(), type: 'new'
      }
    });
    expect(apt.ok(), `Book: ${apt.status()} ${await apt.text().catch(()=>'')}`).toBeTruthy();
    const id = (await apt.json())._id;
    expect(id, 'appointment id must exist').toBeTruthy();
    await patientCtx.dispose();

    const recCtx = await apiContext('receptionist');
    const r = await recCtx.post(`/api/appointments/${id}/verify-assign`, {
      data: { doctorId: '000000000000000000000000' }
    });
    expect(r.status()).toBe(400);
    await recCtx.dispose();
  });

  test('protected route returns 401 without token', async ({ request }) => {
    const r = await request.get(`${API_URL}/api/patients/dashboard`);
    expect([401, 403]).toContain(r.status());
  });

  test('UI: invalid login shows error or keeps user on /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder(/you@example.com|9876543210/).fill('nobody@nowhere.com');
    await page.getByPlaceholder(/Enter password/i).fill('wrongpass');
    await page.getByRole('button', { name: /sign in|log in|login/i }).first().click();
    // Either a visible error message appears or we stay on /login (no token stored)
    await page.waitForTimeout(2500);
    const stillOnLogin = /\/login/.test(page.url());
    const errVisible = await page.getByText(/invalid|incorrect|wrong|failed|error|credentials/i).first().isVisible().catch(() => false);
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(stillOnLogin || errVisible, 'Should stay on /login or show error').toBeTruthy();
    expect(token, 'No token should be stored').toBeFalsy();
  });
});
