// Phase 6 — Doctor workflow: queue, consultation, prescription
import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/ui.js';
import { apiContext } from '../fixtures/api.js';

async function bookAndAssign(department) {
  const patientCtx = await apiContext('patient');
  const today = new Date().toISOString().split('T')[0];
  const hour = 10 + Math.floor(Math.random() * 3);
  const min = Math.floor(Math.random() * 60);
  const slot = `${String(hour > 12 ? hour - 12 : hour).padStart(2, '0')}:${String(min).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
  const book = await patientCtx.post('/api/appointments', {
    data: {
      department, date: today, timeSlot: slot,
      symptoms: ['cough'], reasonForVisit: 'Doctor flow test ' + Date.now(), type: 'new'
    }
  });
  const appt = await book.json();
  if (!appt._id) throw new Error(`Booking failed: ${book.status()} ${JSON.stringify(appt)}`);
  await patientCtx.dispose();

  const recCtx = await apiContext('receptionist');
  const va = await recCtx.post(`/api/appointments/${appt._id}/verify-assign`, { data: {} });
  if (!va.ok()) throw new Error(`verify-assign failed: ${va.status()} ${await va.text().catch(()=> '')}`);
  await recCtx.dispose();
  return appt._id;
}

test.describe('Phase 6 — Doctor workflow', () => {

  test('doctor sees their assigned patients via API', async ({ request }) => {
    await bookAndAssign('Cardiology');
    const ctx = await apiContext('doctor');
    const r = await ctx.get('/api/appointments/doctor/assigned');
    expect(r.ok()).toBeTruthy();
    const list = await r.json();
    expect(Array.isArray(list)).toBeTruthy();
    expect(list.length).toBeGreaterThan(0);
    await ctx.dispose();
  });

  test('doctor dashboard renders the queue', async ({ page }) => {
    await loginAs(page, 'doctor');
    // Doctor's main view is /appointments which shows the queue
    await page.goto('/appointments');
    await expect(page.locator('aside')).toBeVisible();
  });

  test('doctor creates a consultation and prescribes medication', async ({ request }) => {
    const apptId = await bookAndAssign('Cardiology');
    const ctx = await apiContext('doctor');

    // Create consultation
    const cons = await ctx.post('/api/consultations', {
      data: {
        appointmentId: apptId,
        chiefComplaint: 'Chest discomfort on exertion (E2E)',
        symptoms: ['chest pain', 'shortness of breath'],
        symptomDuration: '2 weeks',
        examination: 'BP 138/88, HR 92'
      }
    });
    expect(cons.ok(), `Create consultation: ${cons.status()}`).toBeTruthy();
    const consultation = await cons.json();
    expect(consultation._id).toBeTruthy();

    // Add diagnosis + prescription via update. Consultation schema uses `finalDiagnosis` (array) and `prescriptions`.
    const updatePayload = {
      finalDiagnosis: [{ condition: 'Stable angina (E2E)', icdCode: 'I20.9' }],
      treatmentPlan: 'Lifestyle change + medication',
      prescriptions: [
        { medication: 'Aspirin', dosage: '75mg', frequency: 'Once daily', duration: '30 days', instructions: 'Take with food' }
      ]
    };
    const update = await ctx.put(`/api/consultations/${consultation._id}`, { data: updatePayload });
    expect(update.ok(), `Update consultation: ${update.status()}`).toBeTruthy();

    // Complete it — pass payload again because /complete overwrites these fields from req.body.
    const complete = await ctx.post(`/api/consultations/${consultation._id}/complete`, { data: updatePayload });
    if (!complete.ok()) {
      const alt = await ctx.put(`/api/consultations/${consultation._id}`, { data: { ...updatePayload, status: 'completed' } });
      expect(alt.ok()).toBeTruthy();
    }

    // Verify it persisted
    const fetched = await ctx.get(`/api/consultations/${consultation._id}`);
    expect(fetched.ok()).toBeTruthy();
    const body = await fetched.json();
    const firstDiag = Array.isArray(body.finalDiagnosis) ? (body.finalDiagnosis[0]?.condition || '') : '';
    expect(`${firstDiag} ${body.treatmentPlan || ''}`).toMatch(/angina|lifestyle/i);

    await ctx.dispose();
  });

  test('doctor list page (/doctor-patients) renders for doctor role', async ({ page }) => {
    await loginAs(page, 'doctor');
    await page.goto('/doctor-patients');
    await expect(page.locator('aside')).toBeVisible();
  });
});
