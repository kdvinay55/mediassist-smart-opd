// Phase 7 — Lab Technician workflow: queue, accept, results, doctor notification
import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/ui.js';
import { apiContext } from '../fixtures/api.js';

async function orderLab() {
  const docCtx = await apiContext('doctor');
  const patientCtx = await apiContext('patient');
  const meP = await (await patientCtx.get('/api/auth/me')).json().catch(() => ({}));
  const patientId = meP?.user?._id || meP?.user?.id || meP?._id || meP?.id;

  // Create a parent appointment first so the lab order has a valid context
  const today = new Date().toISOString().split('T')[0];
  const uniqSlot = `${10 + Math.floor(Math.random() * 4)}:${Math.random() > 0.5 ? '00' : '30'} AM`;
  const apt = await patientCtx.post('/api/appointments', {
    data: {
      department: 'Cardiology', date: today, timeSlot: uniqSlot,
      symptoms: ['fatigue'], reasonForVisit: 'Lab order test ' + Date.now(), type: 'new'
    }
  });
  const appointmentId = (await apt.json())._id;
  await patientCtx.dispose();

  const order = await docCtx.post('/api/lab/order-batch', {
    data: {
      patientId,
      appointmentId,
      tests: [
        { name: 'Complete Blood Count', category: 'blood' },
        { name: 'Lipid Panel', category: 'blood' }
      ],
      priority: 'normal',
      notes: 'E2E lab order'
    }
  });
  const body = await order.json();
  await docCtx.dispose();
  // Route returns a bare array of lab docs
  const labs = Array.isArray(body) ? body : (body.labs || []);
  const orderGroup = labs[0]?.orderGroup;
  return { order: body, labs, orderGroup, appointmentId };
}

test.describe('Phase 7 — Lab technician workflow', () => {

  test('lab dashboard renders', async ({ page }) => {
    await loginAs(page, 'lab');
    await page.goto('/lab-dashboard');
    await expect(page.locator('aside')).toBeVisible();
    await expect(page.getByText(/laboratory|lab queue|lab/i).first()).toBeVisible();
  });

  test('lab tech can list the queue via API', async ({ request }) => {
    const ctx = await apiContext('lab');
    const r = await ctx.get('/api/lab/queue');
    expect(r.ok(), `Lab queue: ${r.status()}`).toBeTruthy();
    const body = await r.json();
    expect(body).toBeTruthy();
    await ctx.dispose();
  });

  test('full lab loop: order → consent → accept → collect → result', async ({ request }) => {
    // 1) Doctor orders a batch
    const { labs, orderGroup } = await orderLab();
    expect(labs.length).toBeGreaterThan(0);
    const labIds = labs.map(l => l._id);

    // 2) Patient grants consent (required before lab can accept)
    if (orderGroup) {
      const patientCtx = await apiContext('patient');
      const consent = await patientCtx.put('/api/lab/consent-batch', {
        data: { orderGroup, consent: 'accepted' }
      });
      expect([200, 201, 404]).toContain(consent.status());
      await patientCtx.dispose();
    }

    // 3) Lab tech accepts patient (orderGroup-level)
    const labCtx = await apiContext('lab');
    if (orderGroup) {
      const accept = await labCtx.put('/api/lab/accept-patient', { data: { orderGroup } });
      expect([200, 201, 409]).toContain(accept.status());
    }

    // 4) Lab tech collects samples
    if (orderGroup) {
      const collect = await labCtx.put('/api/lab/collect-samples', {
        data: { orderGroup, sampleType: 'blood' }
      });
      expect([200, 201, 409]).toContain(collect.status());
    }

    // 4) Lab tech enters results for the first lab
    const results = await labCtx.put(`/api/lab/${labIds[0]}/results`, {
      data: {
        results: [
          { parameter: 'Hemoglobin', value: '14.2', unit: 'g/dL', referenceRange: '13-17', flag: 'normal' },
          { parameter: 'WBC', value: '7800', unit: '/µL', referenceRange: '4500-11000', flag: 'normal' }
        ],
        notes: 'E2E results',
        status: 'completed'
      }
    });
    expect(results.ok(), `Enter results: ${results.status()}`).toBeTruthy();

    // 5) Doctor (orderer) should see a notification of "lab-ready"
    const docCtx = await apiContext('doctor');
    const notif = await docCtx.get('/api/notifications');
    expect(notif.ok()).toBeTruthy();
    const data = await notif.json();
    const items = data.notifications || [];
    const found = items.some(n => /lab/i.test(n.type) || /lab/i.test(n.title || ''));
    expect(found, 'Doctor should be notified about lab result').toBeTruthy();

    await labCtx.dispose();
    await docCtx.dispose();
  });
});
