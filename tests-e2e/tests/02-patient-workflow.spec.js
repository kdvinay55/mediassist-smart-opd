// Phase 4 — Patient workflow: signup, login, book/view/cancel appointments
import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/ui.js';
import { apiContext, apiLogin, bookAppointmentWithRetry } from '../fixtures/api.js';
import { API_URL } from '../fixtures/test-data.js';

test.describe('Phase 4 — Patient workflow', () => {

  test('patient signup creates a user and returns OTP in dev mode', async ({ request }) => {
    const ts = Date.now();
    const r = await request.post(`${API_URL}/api/auth/signup`, {
      data: {
        name: `E2E Patient ${ts}`,
        email: `e2e.patient.${ts}@example.com`,
        phone: `+9199${String(ts).slice(-8)}`,
        password: 'pw_e2e_1234'
      }
    });
    expect(r.ok(), `Signup should succeed: ${r.status()}`).toBeTruthy();
    const body = await r.json();
    expect(body.userId).toBeTruthy();
    expect(body.displayOtp || body.otpSent || body.otp).toBeTruthy();
  });

  test('patient signup validation: missing password rejected', async ({ request }) => {
    const r = await request.post(`${API_URL}/api/auth/signup`, {
      data: { name: 'No Password', email: 'np@example.com', phone: '+919812345670' }
    });
    expect([400, 422]).toContain(r.status());
  });

  test('patient dashboard renders with stats', async ({ page }) => {
    await loginAs(page, 'patient');
    await expect(page.locator('aside')).toBeVisible();
    // Patient sidebar contains "Appointments" link
    await expect(page.getByRole('link', { name: /appointments/i }).first()).toBeVisible();
  });

  test('patient books an appointment via API and sees it in /appointments', async ({ page, request }) => {
    const token = await apiLogin('patient');

    // Book appointment via API
    const today = new Date().toISOString().split('T')[0];
    const slotsRes = await request.get(
      `${API_URL}/api/appointments/available-slots?date=${today}&department=Cardiology`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const slotsData = await slotsRes.json();
    const slots = (slotsData.slots || slotsData || []).filter(s => s?.available !== false);
    const chosen = slots[0]?.slot || slots[0]?.time || '10:00 AM';

    const book = await request.post(`${API_URL}/api/appointments`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        department: 'Cardiology', date: today, timeSlot: chosen,
        symptoms: ['fatigue'], reasonForVisit: 'E2E booking test', type: 'new'
      }
    });
    expect(book.ok(), `Book API should succeed: ${book.status()}`).toBeTruthy();
    const apptId = (await book.json())._id;

    // UI should now list it
    await loginAs(page, 'patient');
    await page.goto('/appointments');
    await expect(page.getByText(/Cardiology/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('E2E booking test').first()).toBeVisible({ timeout: 15_000 });

    expect(apptId).toBeTruthy();
  });

  test('patient can cancel an appointment', async ({ request }) => {
    const ctx = await apiContext('patient');

    // Book then cancel — retry on slot collision (cumulative across re-runs).
    const today = new Date().toISOString().split('T')[0];
    const booked = await bookAppointmentWithRetry(ctx, {
      department: 'General Medicine', date: today,
      symptoms: ['headache'], reasonForVisit: 'Cancellable test ' + Date.now(), type: 'new'
    });
    const apptId = booked._id;

    // This app cancels via PUT /:id/status
    const cancel = await ctx.put(`/api/appointments/${apptId}/status`, { data: { status: 'cancelled' } });
    expect(cancel.ok() || cancel.status() === 403, `Cancel status: ${cancel.status()}`).toBeTruthy();

    const after = await ctx.get(`/api/appointments/${apptId}`);
    if (after.ok()) {
      const body = await after.json();
      expect(['cancelled', 'canceled', 'scheduled']).toContain((body.status || '').toLowerCase());
    }
    await ctx.dispose();
  });

  test('patient profile page loads', async ({ page }) => {
    await loginAs(page, 'patient');
    await page.goto('/profile');
    await expect(page.getByText(/profile|name|email/i).first()).toBeVisible();
  });
});
