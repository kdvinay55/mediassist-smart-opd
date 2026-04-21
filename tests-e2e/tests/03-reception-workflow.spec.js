// Phase 5 — Receptionist workflow: queue, verify-assign, search, doctor picker
import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/ui.js';
import { apiContext } from '../fixtures/api.js';
import { USERS } from '../fixtures/test-data.js';

function uniqSlot(base = 9) {
  // Random HH:MM to avoid slot collisions across re-runs
  const hour = base + Math.floor(Math.random() * 3);
  const min = Math.floor(Math.random() * 60);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour > 12 ? hour - 12 : hour;
  return `${String(h12).padStart(2, '0')}:${String(min).padStart(2, '0')} ${ampm}`;
}

function futureDate(daysAhead = 0) {
  // Pseudo-random future date within next 180 days to avoid collisions from prior test runs
  const d = new Date();
  const offset = daysAhead || (1 + Math.floor(Math.random() * 180));
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

test.describe('Phase 5 — Receptionist workflow', () => {

  test('reception dashboard renders the queue', async ({ page }) => {
    await loginAs(page, 'receptionist');
    await page.goto('/reception');
    await expect(page.getByRole('heading', { name: /reception/i })).toBeVisible();
    await expect(page.getByText(/awaiting check-?in|in queue|in consultation|completed/i).first()).toBeVisible();
  });

  test('reception search filters appointments', async ({ page }) => {
    await loginAs(page, 'receptionist');
    await page.goto('/reception');
    const search = page.getByPlaceholder(/search/i).first();
    await search.fill('zzzzz_no_match_zzzzz');
    await expect(page.getByText(/no appointments found/i)).toBeVisible({ timeout: 10_000 });
  });

  test('reception can verify+assign with auto-assign (load-balanced)', async ({ request }) => {
    const patientCtx = await apiContext('patient');
    const book = await patientCtx.post('/api/appointments', {
      data: {
        department: 'Cardiology', date: futureDate(), timeSlot: uniqSlot(9),
        symptoms: ['chest pain'], reasonForVisit: 'Reception auto-assign test ' + Date.now(), type: 'new'
      }
    });
    expect(book.ok(), `Book: ${book.status()} ${await book.text().catch(()=> '')}`).toBeTruthy();
    const apptId = (await book.json())._id;
    await patientCtx.dispose();

    const recCtx = await apiContext('receptionist');
    const va = await recCtx.post(`/api/appointments/${apptId}/verify-assign`, { data: {} });
    expect(va.ok(), `verify-assign auto: ${va.status()}`).toBeTruthy();
    const body = await va.json();
    expect(body.assignedDoctor?.name).toBeTruthy();
    expect(body.roomNumber).toBeGreaterThanOrEqual(101);
    expect(body.assignmentMode).toBe('auto');
    await recCtx.dispose();
  });

  test('reception can verify+assign with a manually chosen doctor', async ({ request }) => {
    // Find the Cardiology doctor's id
    const recCtx = await apiContext('receptionist');
    const docList = await recCtx.get('/api/admin/users?role=doctor&department=Cardiology');
    expect(docList.ok()).toBeTruthy();
    const doctors = await docList.json();
    const drPatel = doctors.find(d => d.email === USERS.doctor.identifier);
    expect(drPatel, 'Dr. Patel must be in seed').toBeTruthy();

    const patientCtx = await apiContext('patient');
    const book = await patientCtx.post('/api/appointments', {
      data: {
        department: 'Cardiology', date: futureDate(), timeSlot: uniqSlot(13),
        symptoms: ['palpitations'], reasonForVisit: 'Reception manual-assign test ' + Date.now(), type: 'new'
      }
    });
    expect(book.ok(), `Book: ${book.status()}`).toBeTruthy();
    const apptId = (await book.json())._id;
    await patientCtx.dispose();

    const va = await recCtx.post(`/api/appointments/${apptId}/verify-assign`, {
      data: { doctorId: drPatel._id }
    });
    expect(va.ok(), `verify-assign manual: ${va.status()}`).toBeTruthy();
    const body = await va.json();
    expect(body.assignedDoctor.name).toBe(drPatel.name);
    expect(body.assignmentMode).toBe('manual');
    await recCtx.dispose();
  });

  test('reception cannot assign a doctor from a different department', async ({ request }) => {
    const recCtx = await apiContext('receptionist');
    const docList = await recCtx.get('/api/admin/users?role=doctor&department=Cardiology');
    const cardio = (await docList.json())[0];
    expect(cardio).toBeTruthy();

    const patientCtx = await apiContext('patient');
    const book = await patientCtx.post('/api/appointments', {
      data: {
        department: 'Orthopedics', date: futureDate(), timeSlot: uniqSlot(14),
        symptoms: ['knee pain'], reasonForVisit: 'Cross-dept negative test ' + Date.now(), type: 'new'
      }
    });
    const apptId = (await book.json())._id;
    await patientCtx.dispose();

    const va = await recCtx.post(`/api/appointments/${apptId}/verify-assign`, {
      data: { doctorId: cardio._id }
    });
    expect(va.status(), 'Should reject mismatched department').toBe(400);
    await recCtx.dispose();
  });

  test('UI: reception sees the doctor picker dropdown', async ({ page }) => {
    // Seed a fresh scheduled appointment first
    const patientCtx = await apiContext('patient');
    const today = new Date().toISOString().split('T')[0];
    const tag = 'UI doctor picker test ' + Date.now();
    await patientCtx.post('/api/appointments', {
      data: {
        department: 'Cardiology', date: today, timeSlot: uniqSlot(15),
        symptoms: ['fatigue'], reasonForVisit: tag, type: 'new'
      }
    });
    await patientCtx.dispose();

    await loginAs(page, 'receptionist');
    await page.goto('/reception');
    // Click the first 'Choose doctor (optional)' toggle button that appears
    const toggle = page.getByRole('button', { name: /Choose doctor \(optional\)/i }).first();
    await toggle.waitFor({ state: 'visible', timeout: 15_000 });
    await toggle.click();
    // The doctor picker is a native <select>; its first option is the Auto-assign placeholder.
    await expect(page.locator('option', { hasText: /Auto-assign/i }).first()).toBeAttached({ timeout: 10_000 });
  });
});
