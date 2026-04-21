// Phase 14 — Role-based access control (RBAC)
import { test, expect } from '@playwright/test';
import { apiContext } from '../fixtures/api.js';
import { loginAs } from '../fixtures/ui.js';

// Endpoints that MUST reject a patient
const STAFF_ENDPOINTS = [
  '/api/admin/users',
  '/api/admin/stats',
  '/api/admin/feedback'
];

test.describe('Phase 14 — Role-based access control', () => {

  test('patient cannot call admin-only endpoints', async () => {
    const ctx = await apiContext('patient');
    for (const ep of STAFF_ENDPOINTS) {
      const r = await ctx.get(ep);
      expect([401, 403, 404], `${ep} should reject patient (got ${r.status()})`).toContain(r.status());
    }
    await ctx.dispose();
  });

  test('patient cannot verify-assign appointments', async () => {
    const ctx = await apiContext('patient');
    const r = await ctx.post('/api/appointments/000000000000000000000000/verify-assign', { data: {} });
    expect([401, 403]).toContain(r.status());
    await ctx.dispose();
  });

  test('doctor cannot create users (admin only)', async () => {
    const ctx = await apiContext('doctor');
    const r = await ctx.put('/api/admin/users/000000000000000000000000', {
      data: { isActive: false }
    });
    expect([401, 403, 404]).toContain(r.status());
    await ctx.dispose();
  });

  test('doctor cannot accept-patient on lab orders (admin role only)', async () => {
    const ctx = await apiContext('doctor');
    const r = await ctx.put('/api/lab/accept-patient', { data: { orderGroup: 'fake' } });
    expect([401, 403]).toContain(r.status());
    await ctx.dispose();
  });

  test('lab tech cannot create consultations (doctor only)', async () => {
    const ctx = await apiContext('lab');
    const r = await ctx.post('/api/consultations', {
      data: { appointmentId: '000000000000000000000000', chiefComplaint: 'x' }
    });
    expect([401, 403, 404]).toContain(r.status());
    await ctx.dispose();
  });

  test('UI: patient navigating to /reception is blocked via API (no admin data leaks)', async ({ page }) => {
    await loginAs(page, 'patient');
    // Capture every /api/* response while loading /reception
    const apiStatuses = [];
    page.on('response', async (r) => {
      const u = r.url();
      if (/\/api\/(admin|workflow)/i.test(u) && !/auth|notifications/.test(u)) {
        apiStatuses.push({ url: u, status: r.status() });
      }
    });
    await page.goto('/reception');
    await page.waitForLoadState('networkidle');
    // Admin-only APIs must reject the patient token (no 200s leaking data)
    const leaked = apiStatuses.filter(s => s.status === 200);
    expect(leaked, `Patient should not receive 200 from admin APIs: ${JSON.stringify(leaked)}`).toEqual([]);
  });
});
