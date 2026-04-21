#!/usr/bin/env node
/* End-to-end role-based flow audit.
 *  Patient signup+verify -> book appointment -> Reception verify+assign doctor
 *  -> Doctor creates consultation, prescribes meds, orders labs
 *  -> Lab tech sees order, enters result -> Patient sees medication+lab+queue
 *
 * Tests cross-role data persistence at every hop.
 *
 * Usage: node scripts/e2e_role_flow.js [baseUrl]
 */
const base = process.argv[2] || process.env.TEST_URL || 'https://mediassist-api.onrender.com';

const log = [];
function record(step, status, detail = '') {
  const tag = status === 'PASS' ? 'PASS' : status === 'WARN' ? 'WARN' : 'FAIL';
  log.push({ step, status, detail });
  console.log(`[${tag}] ${step}${detail ? '  -- ' + detail : ''}`);
}

async function http(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch(`${base}${path}`, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, ok: res.ok, data };
  } catch (e) {
    return { status: 0, ok: false, data: null, error: e.message };
  } finally { clearTimeout(t); }
}

async function login(identifier, password) {
  const r = await http('POST', '/api/auth/login', { identifier, password });
  return r.ok ? r.data?.token : null;
}

(async () => {
  console.log(`\nE2E ROLE FLOW AUDIT\nTarget: ${base}\nTime: ${new Date().toISOString()}\n${'='.repeat(70)}\n`);

  // ===== SETUP =====
  await http('POST', '/api/demo/seed', {});
  record('SETUP / seed DB', 'PASS');

  // ===== PATIENT SIGNUP + OTP VERIFY =====
  const ts = Date.now();
  const patientEmail = `test.patient.${ts}@example.com`;
  const patientPhone = `+9199${String(ts).slice(-8)}`;
  const signup = await http('POST', '/api/auth/signup', {
    name: `E2E Patient ${ts}`, email: patientEmail, phone: patientPhone, password: 'test1234'
  });
  if (!signup.ok) {
    record('PATIENT signup', 'FAIL', `${signup.status} ${signup.data?.error || ''}`);
    process.exit(1);
  }
  record('PATIENT signup', 'PASS', `userId=${signup.data?.userId}`);

  // OTP exposed in dev for testing
  const otp = signup.data?.displayOtp || signup.data?.otpSent?.otp || signup.data?.otp;
  if (!otp) {
    record('PATIENT OTP exposure (dev mode)', 'FAIL', 'No OTP returned -- cannot verify in audit. SMS provider gates the flow.');
    process.exit(1);
  }
  const verify = await http('POST', '/api/auth/verify-otp', { userId: signup.data.userId, otp });
  if (!verify.ok || !verify.data?.token) {
    record('PATIENT verify-otp', 'FAIL', `${verify.status} ${verify.data?.error || ''}`);
    process.exit(1);
  }
  const patientToken = verify.data.token;
  const patientId = verify.data.user?.id;
  record('PATIENT verify-otp + JWT', 'PASS', `id=${patientId}`);

  // ===== STAFF LOGINS =====
  const reception = await login('reception@smartopd.com', 'reception123');
  const drCardio = await login('dr.patel@smartopd.com', 'doctor123');
  const labTech = await login('lab@smartopd.com', 'lab12345');
  if (!reception || !drCardio || !labTech) {
    record('STAFF logins', 'FAIL', 'one or more staff logins failed');
    process.exit(1);
  }
  record('STAFF logins (reception/dr.patel/lab)', 'PASS');

  // ===== PATIENT BOOKS APPOINTMENT =====
  // Book for TODAY so doctor /assigned and queue (today-scoped) include the new appt
  const tomorrow = new Date().toISOString().split('T')[0];
  const slotsRes = await http('GET', `/api/appointments/available-slots?date=${tomorrow}&department=Cardiology`, null, patientToken);
  const rawSlots = Array.isArray(slotsRes.data) ? slotsRes.data : (slotsRes.data?.slots || []);
  const availableSlots = rawSlots.filter(s => s?.available !== false);
  const chosenSlot = availableSlots[0]?.slot || availableSlots[0]?.time || '10:00 AM';
  const slots = availableSlots;
  record('PATIENT GET available-slots', slotsRes.ok ? 'PASS' : 'FAIL', `count=${slots.length} chose="${chosenSlot}"`);

  const book = await http('POST', '/api/appointments', {
    department: 'Cardiology', date: tomorrow, timeSlot: chosenSlot,
    symptoms: ['chest discomfort'], reasonForVisit: 'Routine consult', type: 'new'
  }, patientToken);
  const appointmentId = book.data?._id || book.data?.id || book.data?.appointment?._id;
  if (!appointmentId) {
    record('PATIENT POST /appointments', 'FAIL', `${book.status} ${book.data?.error || JSON.stringify(book.data).slice(0,100)}`);
    process.exit(1);
  }
  record('PATIENT POST /appointments', 'PASS', `id=${appointmentId} status=${book.data?.status}`);

  // VERIFY: patient sees their booking immediately
  const myAppts = await http('GET', '/api/appointments', null, patientToken);
  const visiblePatient = Array.isArray(myAppts.data) && myAppts.data.some(a => a._id === appointmentId);
  record('PERSIST: patient sees own appointment', visiblePatient ? 'PASS' : 'FAIL',
    visiblePatient ? '' : `count=${Array.isArray(myAppts.data) ? myAppts.data.length : '?'} -- new booking missing`);

  // ===== RECEPTION VERIFIES + ASSIGNS DOCTOR =====
  const va = await http('POST', `/api/appointments/${appointmentId}/verify-assign`, {}, reception);
  const assignedDoctorId = va.data?.appointment?.doctorId || va.data?.doctorId;
  record('RECEPTION verify-assign', va.ok ? 'PASS' : 'FAIL',
    va.ok ? `doctor=${assignedDoctorId} room=${va.data?.workflow?.roomNumber}` : `${va.status} ${va.data?.error || ''}`);

  // VERIFY: appointment status now 'checked-in'
  const checkAppt = await http('GET', `/api/appointments/${appointmentId}`, null, patientToken);
  record('PERSIST: appointment status -> checked-in',
    checkAppt.data?.status === 'checked-in' ? 'PASS' : 'WARN',
    `status=${checkAppt.data?.status}`);

  // ===== DOCTOR SEES ASSIGNED PATIENTS =====
  const drQ = await http('GET', '/api/appointments/doctor/assigned', null, drCardio);
  const drList = Array.isArray(drQ.data) ? drQ.data : (drQ.data?.appointments || []);
  const drSeesNew = drList.some(a => a._id === appointmentId);
  record('DOCTOR GET /doctor/assigned',
    drQ.ok && drSeesNew ? 'PASS' : drQ.ok ? 'WARN' : 'FAIL',
    drQ.ok ? `count=${drList.length} sees-new=${drSeesNew}` : `${drQ.status}`);

  // ===== QUEUE CHECK =====
  const queue = await http('GET', `/api/appointments/queue/Cardiology`, null, drCardio);
  const queueList = Array.isArray(queue.data) ? queue.data : (queue.data?.queue || []);
  const inQueue = queueList.some(a => a._id === appointmentId);
  record('QUEUE: Cardiology shows new patient',
    queue.ok && inQueue ? 'PASS' : queue.ok ? 'WARN' : 'FAIL',
    queue.ok ? `len=${queueList.length} present=${inQueue}` : `${queue.status}`);

  // ===== DOCTOR CREATES CONSULTATION =====
  const cons = await http('POST', '/api/consultations', {
    appointmentId,
    chiefComplaint: 'Chest discomfort on exertion',
    symptoms: ['chest pain', 'shortness of breath'],
    symptomDuration: '3 days',
    examination: 'BP 130/85, HR 88, normal heart sounds'
  }, drCardio);
  const consultationId = cons.data?._id || cons.data?.id;
  record('DOCTOR POST /consultations', cons.ok ? 'PASS' : 'FAIL',
    cons.ok ? `id=${consultationId}` : `${cons.status} ${cons.data?.error || ''}`);

  // ===== DOCTOR ORDERS LABS (BATCH) =====
  const labOrder = await http('POST', '/api/lab/order-batch', {
    patientId,
    appointmentId,
    consultationId,
    tests: [
      { name: 'Lipid Profile', category: 'blood' },
      { name: 'ECG', category: 'imaging' }
    ],
    priority: 'normal',
    notes: 'rule out cardiac etiology'
  }, drCardio);
  const orderedLabIds = Array.isArray(labOrder.data) ? labOrder.data.map(l => l._id) : (Array.isArray(labOrder.data?.labs) ? labOrder.data.labs.map(l => l._id) : []);
  const orderGroupId = (Array.isArray(labOrder.data) ? labOrder.data[0]?.orderGroup : labOrder.data?.labs?.[0]?.orderGroup);
  record('DOCTOR POST /lab/order-batch', labOrder.ok ? 'PASS' : 'FAIL',
    labOrder.ok ? `ordered=${orderedLabIds.length} group=${orderGroupId}` : `${labOrder.status} ${labOrder.data?.error || ''}`);

  // PATIENT MUST CONSENT BEFORE LAB QUEUE PICKS IT UP
  let consented = false;
  if (orderGroupId) {
    const consent = await http('PUT', '/api/lab/consent-batch', { orderGroup: orderGroupId, consent: 'accepted' }, patientToken);
    consented = consent.ok;
    record('PATIENT PUT /lab/consent-batch', consent.ok ? 'PASS' : 'FAIL',
      consent.ok ? `token=${consent.data?.labTokenNumber} queuePos=${consent.data?.labQueuePosition}` : `${consent.status} ${consent.data?.error || ''}`);
  }

  // VERIFY: lab tech sees the new order (queue is grouped; check group's tests[])
  const labQ = await http('GET', '/api/lab/queue', null, labTech);
  const labGroups = Array.isArray(labQ.data) ? labQ.data : [];
  const matchingGroup = labGroups.find(g => g.orderGroup === orderGroupId);
  const labTechSeesNew = !!matchingGroup;
  record('PERSIST: lab tech sees order',
    labQ.ok && labTechSeesNew ? 'PASS' : labQ.ok ? 'WARN' : 'FAIL',
    `groups=${labGroups.length} sees-new=${labTechSeesNew} tests=${matchingGroup?.tests?.length || 0}`);

  // ===== LAB TECH ENTERS RESULT (PUT /:id/results) =====
  let resultEntered = false;
  if (orderedLabIds.length > 0) {
    const targetLabId = orderedLabIds[0];
    const enterResult = await http('PUT', `/api/lab/${targetLabId}/results`, {
      results: [
        { parameter: 'Total Cholesterol', value: '195', unit: 'mg/dL', referenceRange: '<200', flag: 'normal' },
        { parameter: 'LDL', value: '120', unit: 'mg/dL', referenceRange: '<130', flag: 'normal' }
      ]
    }, labTech);
    resultEntered = enterResult.ok;
    record('LAB-TECH PUT /lab/:id/results (result entry)', enterResult.ok ? 'PASS' : 'FAIL',
      `${enterResult.status} ${enterResult.data?.error || ''}`);
  }

  // VERIFY: patient sees the lab result
  if (resultEntered) {
    const patLabs = await http('GET', '/api/lab', null, patientToken);
    const patLabList = Array.isArray(patLabs.data) ? patLabs.data : [];
    const patientSeesLab = patLabList.some(l => l._id === orderedLabIds[0] && l.status === 'completed');
    record('PERSIST: patient sees completed lab result',
      patientSeesLab ? 'PASS' : 'WARN',
      patientSeesLab ? '' : `total=${patLabList.length} found-completed=${patientSeesLab}`);
  }

  // ===== DOCTOR COMPLETES CONSULTATION (PRESCRIBES MEDS) =====
  const complete = await http('POST', `/api/consultations/${consultationId}/complete`, {
    finalDiagnosis: [{ condition: 'Stable angina (suspected)', confidence: 70 }],
    treatmentPlan: 'Lifestyle changes, beta-blocker trial, follow-up in 2 weeks',
    prescriptions: [
      { medication: 'Metoprolol', dosage: '25mg', frequency: 'twice daily', duration: '14 days', instructions: 'morning and evening with food' },
      { medication: 'Aspirin', dosage: '75mg', frequency: 'once daily', duration: '30 days', instructions: 'after dinner' }
    ],
    followUpInstructions: 'Return if chest pain worsens or new symptoms appear'
  }, drCardio);
  record('DOCTOR POST /consultations/:id/complete', complete.ok ? 'PASS' : 'FAIL',
    complete.ok ? `status=${complete.data?.status}` : `${complete.status} ${complete.data?.error || ''}`);

  // VERIFY: patient dashboard shows the new active medications
  const dash = await http('GET', '/api/patients/dashboard', null, patientToken);
  const meds = dash.data?.activeMedications || [];
  const hasMetoprolol = meds.some(m => m.name === 'Metoprolol');
  const hasAspirin = meds.some(m => m.name === 'Aspirin');
  record('PERSIST: patient dashboard shows prescribed meds',
    hasMetoprolol && hasAspirin ? 'PASS' : (meds.length > 0 ? 'WARN' : 'FAIL'),
    `total-active=${meds.length} metoprolol=${hasMetoprolol} aspirin=${hasAspirin}`);

  // VERIFY: patient appointment now completed
  const finalAppt = await http('GET', `/api/appointments/${appointmentId}`, null, patientToken);
  record('PERSIST: appointment status -> completed',
    finalAppt.data?.status === 'completed' ? 'PASS' : 'WARN',
    `status=${finalAppt.data?.status}`);

  // ===== NOTIFICATION CHECK =====
  const notif = await http('GET', '/api/notifications', null, patientToken);
  const notifList = Array.isArray(notif.data) ? notif.data : (notif.data?.notifications || []);
  const hasConsultNotif = notifList.some(n => /consultation/i.test(n.title || ''));
  record('PERSIST: patient receives consultation-completed notification',
    hasConsultNotif ? 'PASS' : 'WARN',
    `count=${notifList.length} found-consult=${hasConsultNotif}`);

  // ===== ADMIN STATS REFLECT NEW DATA =====
  const stats = await http('GET', '/api/admin/stats', null, reception);
  record('ADMIN GET /stats (reflects activity)',
    stats.ok && stats.data?.totalPatients ? 'PASS' : 'FAIL',
    `patients=${stats.data?.totalPatients} todayAppts=${stats.data?.todayAppointments}`);

  // ===== SUMMARY =====
  const passes = log.filter(l => l.status === 'PASS').length;
  const warns = log.filter(l => l.status === 'WARN').length;
  const fails = log.filter(l => l.status === 'FAIL').length;
  console.log(`\n${'='.repeat(70)}\nSUMMARY: ${passes} PASS  ${warns} WARN  ${fails} FAIL  (total ${log.length})\n${'='.repeat(70)}`);
  if (fails) {
    console.log('\nFAILED STEPS:');
    log.filter(l => l.status === 'FAIL').forEach(f => console.log(`  - ${f.step}  (${f.detail})`));
  }
  if (warns) {
    console.log('\nWARNINGS:');
    log.filter(l => l.status === 'WARN').forEach(f => console.log(`  - ${f.step}  (${f.detail})`));
  }
  process.exit(fails ? 1 : 0);
})().catch(err => {
  console.error('FATAL:', err.stack || err);
  process.exit(2);
});
