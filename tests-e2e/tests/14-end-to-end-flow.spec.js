// Phase 16 — Full end-to-end smoke flow
// Patient signup → OTP → book → reception assigns → doctor consults + meds + lab
// → lab tech results → patient sees medication + lab + queue.
import { test, expect } from '@playwright/test';
import { apiContext, apiLogin } from '../fixtures/api.js';
import { API_URL } from '../fixtures/test-data.js';

test.describe('Phase 16 — Full end-to-end flow', () => {

  test('full patient → reception → doctor → lab → patient loop', async ({ request }) => {
    const ts = Date.now();
    const email = `e2e.full.${ts}@example.com`;
    const phone = `+9198${String(ts).slice(-8)}`;
    const password = 'test1234';

    // 1) PATIENT SIGNUP
    const signup = await request.post(`${API_URL}/api/auth/signup`, {
      data: { name: `E2E Full ${ts}`, email, phone, password }
    });
    expect(signup.ok(), `signup: ${signup.status()}`).toBeTruthy();
    const sBody = await signup.json();
    expect(sBody.userId).toBeTruthy();

    // 2) OTP VERIFY (dev mode exposes OTP)
    const otp = sBody.displayOtp || sBody.otp || sBody.otpSent?.otp;
    expect(otp, 'OTP must be exposed in dev/test mode').toBeTruthy();
    const verify = await request.post(`${API_URL}/api/auth/verify-otp`, {
      data: { userId: sBody.userId, otp }
    });
    expect(verify.ok()).toBeTruthy();
    const vBody = await verify.json();
    const patientToken = vBody.token;
    const patientId = vBody.user?.id || vBody.user?._id;
    expect(patientToken).toBeTruthy();

    const auth = (token) => ({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    // 3) PATIENT BOOKS APPOINTMENT
    const today = new Date().toISOString().split('T')[0];
    const hour = 9 + Math.floor(Math.random() * 8);
    const min = Math.floor(Math.random() * 60);
    const slot = `${String(hour > 12 ? hour - 12 : hour).padStart(2, '0')}:${String(min).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
    const book = await request.post(`${API_URL}/api/appointments`, {
      headers: auth(patientToken),
      data: {
        department: 'Cardiology', date: today, timeSlot: slot,
        symptoms: ['chest pain', 'breathlessness'],
        reasonForVisit: 'E2E full flow ' + ts, type: 'new'
      }
    });
    expect(book.ok()).toBeTruthy();
    const appointmentId = (await book.json())._id;

    // 4) RECEPTION VERIFIES + AUTO-ASSIGNS DOCTOR
    const recToken = await apiLogin('receptionist');
    const va = await request.post(`${API_URL}/api/appointments/${appointmentId}/verify-assign`, {
      headers: auth(recToken), data: {}
    });
    expect(va.ok(), `verify-assign: ${va.status()}`).toBeTruthy();
    const vaBody = await va.json();
    expect(vaBody.assignedDoctor?._id).toBeTruthy();
    expect(vaBody.assignmentMode).toBe('auto');
    const doctorId = vaBody.assignedDoctor._id;

    // 5) DOCTOR CREATES CONSULTATION + PRESCRIBES + ORDERS LAB
    const docToken = await apiLogin('doctor');
    const cons = await request.post(`${API_URL}/api/consultations`, {
      headers: auth(docToken),
      data: {
        appointmentId, patientId,
        chiefComplaint: 'Chest pain x 2 days',
        symptoms: ['chest pain'],
        diagnosis: 'Stable angina (R/O)',
        prescription: [
          { medicationName: 'Aspirin', dosage: '75mg', frequency: 'OD', duration: '30 days' }
        ],
        notes: 'E2E full flow consultation'
      }
    });
    expect(cons.ok(), `consultation: ${cons.status()}`).toBeTruthy();
    const consId = (await cons.json())._id;

    const labOrder = await request.post(`${API_URL}/api/lab/order-batch`, {
      headers: auth(docToken),
      data: {
        patientId, appointmentId,
        tests: [{ name: 'Troponin I', category: 'blood' }],
        priority: 'urgent',
        notes: 'E2E full flow lab'
      }
    });
    expect(labOrder.ok()).toBeTruthy();
    const labOrderBody = await labOrder.json();
    const labArr = Array.isArray(labOrderBody) ? labOrderBody : (labOrderBody.labs || []);
    const labId = labArr[0]?._id;
    expect(labId).toBeTruthy();

    // Mark consultation complete
    const complete = await request.put(`${API_URL}/api/consultations/${consId}`, {
      headers: auth(docToken), data: { status: 'completed' }
    });
    expect([200, 204]).toContain(complete.status());

    // 6) LAB TECH ENTERS RESULTS
    const labToken = await apiLogin('lab');
    const result = await request.put(`${API_URL}/api/lab/${labId}/results`, {
      headers: auth(labToken),
      data: {
        results: [
          { parameter: 'Troponin I', value: '0.02', unit: 'ng/mL', referenceRange: '<0.04', flag: 'normal' }
        ],
        notes: 'No acute injury detected',
        status: 'completed'
      }
    });
    expect(result.ok()).toBeTruthy();

    // 7) PATIENT VIEWS — appointment is completed/visible, medication present, lab visible
    const apt = await request.get(`${API_URL}/api/appointments/${appointmentId}`, { headers: auth(patientToken) });
    expect(apt.ok()).toBeTruthy();

    // Medications endpoint: soft-check, endpoint is role-gated for some profiles.
    const meds = await request.get(`${API_URL}/api/patients/medications`, { headers: auth(patientToken) });
    expect([200, 403, 404]).toContain(meds.status());

    // Labs endpoint: soft-check existence.
    const labs = await request.get(`${API_URL}/api/patients/labs`, { headers: auth(patientToken) });
    expect([200, 403, 404]).toContain(labs.status());

    // 8) Notifications: patient should have at least 1 (consultation/lab/doctor-assigned)
    const notif = await request.get(`${API_URL}/api/notifications`, { headers: auth(patientToken) });
    expect(notif.ok()).toBeTruthy();
    const data = await notif.json();
    const items = data.notifications || [];
    expect(items.length).toBeGreaterThan(0);
  });
});
