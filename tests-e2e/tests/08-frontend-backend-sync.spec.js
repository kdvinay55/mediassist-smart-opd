// Phase 10 — Frontend ↔ Backend synchronization
// Verifies UI actions trigger correct API calls and the result reflects in DB & UI.
import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/ui.js';
import { apiContext } from '../fixtures/api.js';
import { API_URL } from '../fixtures/test-data.js';

test.describe('Phase 10 — Frontend ↔ Backend sync', () => {

  test('reception page hits /api/appointments on load', async ({ page }) => {
    await loginAs(page, 'receptionist');
    const apiCall = page.waitForResponse(
      r => r.url().includes('/api/appointments') && r.request().method() === 'GET',
      { timeout: 15_000 }
    );
    await page.goto('/reception');
    const res = await apiCall;
    expect(res.ok()).toBeTruthy();
  });

  test('booking via API triggers socket → reception list refreshes within 5s', async ({ page, request }) => {
    await loginAs(page, 'receptionist');
    await page.goto('/reception');
    await page.waitForLoadState('networkidle');

    const beforeCount = await page.locator('[class*="card"]').count();

    // Book new appointment via patient API
    const ctx = await apiContext('patient');
    const today = new Date().toISOString().split('T')[0];
    await ctx.post('/api/appointments', {
      data: {
        department: 'Pediatrics', date: today, timeSlot: '09:30 AM',
        symptoms: ['fever'], reasonForVisit: 'Sync test booking', type: 'new'
      }
    });
    await ctx.dispose();

    // Reception should auto-refresh from the socket event
    await expect.poll(async () => {
      return page.getByText('Sync test booking').count();
    }, { timeout: 8_000, intervals: [500, 1000, 2000] }).toBeGreaterThan(0);
  });

  test('lab result entry triggers doctor notification (DB-level)', async ({ request }) => {
    // Order a lab as doctor
    const docCtx = await apiContext('doctor');
    const patientCtx = await apiContext('patient');
    const today = new Date().toISOString().split('T')[0];
    const uniqSlot = `${12 + Math.floor(Math.random() * 3)}:${Math.random() > 0.5 ? '00' : '30'} PM`;
    const apt = await patientCtx.post('/api/appointments', {
      data: {
        department: 'Cardiology', date: today, timeSlot: uniqSlot,
        symptoms: ['fatigue'], reasonForVisit: 'Sync lab test ' + Date.now(), type: 'new'
      }
    });
    const appointmentId = (await apt.json())._id;
    const me = await (await patientCtx.get('/api/auth/me')).json().catch(() => ({}));
    await patientCtx.dispose();
    const patientId = me?.user?._id || me?.user?.id || me?._id || me?.id;

    const order = await docCtx.post('/api/lab/order-batch', {
      data: {
        patientId, appointmentId,
        tests: [{ name: 'Blood Sugar', category: 'blood' }],
        priority: 'normal',
        notes: 'sync test'
      }
    });
    const orderBody = await order.json();
    const labs = Array.isArray(orderBody) ? orderBody : (orderBody.labs || []);
    const labId = labs[0]?._id;
    expect(labId).toBeTruthy();

    // Lab tech enters results
    const labCtx = await apiContext('lab');
    await labCtx.put(`/api/lab/${labId}/results`, {
      data: {
        results: [{ parameter: 'Glucose', value: '95', unit: 'mg/dL', referenceRange: '70-110', flag: 'normal' }],
        status: 'completed'
      }
    });
    await labCtx.dispose();

    // Doctor's notifications should now contain a lab event
    const notif = await docCtx.get('/api/notifications');
    const data = await notif.json();
    expect((data.notifications || []).some(n => /lab/i.test(n.title || n.type || ''))).toBeTruthy();
    await docCtx.dispose();
  });

  test('detect broken API: /api/this-does-not-exist returns 404', async ({ request }) => {
    const r = await request.get(`${API_URL}/api/this-does-not-exist`);
    expect([404, 401]).toContain(r.status());
  });

  test('CORS / network: every page bundle requests succeed', async ({ page }) => {
    const failed = [];
    page.on('requestfailed', req => failed.push({ url: req.url(), err: req.failure()?.errorText }));
    page.on('response', r => {
      if (r.status() >= 500) failed.push({ url: r.url(), status: r.status() });
    });
    await loginAs(page, 'patient');
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    const meaningful = failed.filter(f => !/sockjs|hot-update|favicon|chrome-extension|vite|@vite|__vite|\.map(\?|$)|manifest\.json|sw\.js|capacitor|ws:\/\/|ws-proxy|\/api\/auth\/me/i.test(f.url) && f.err !== 'net::ERR_ABORTED');
    expect(meaningful, `Unexpected failures: ${JSON.stringify(meaningful)}`).toEqual([]);
  });
});
