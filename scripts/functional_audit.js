#!/usr/bin/env node
/* Live functional audit of the deployed Smart OPD backend.
   Usage: node scripts/functional_audit.js [baseUrl]
*/
const base = process.argv[2] || process.env.TEST_URL || 'https://mediassist-api.onrender.com';

const results = { pass: [], fail: [], degraded: [] };

async function http(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
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

function record(method, path, status, note = '') {
  const tag = `${method} ${path}`;
  if (status === 'pass') results.pass.push({ tag, note });
  else if (status === 'degraded') results.degraded.push({ tag, note });
  else results.fail.push({ tag, note });
  const sym = status === 'pass' ? 'PASS' : status === 'degraded' ? 'WARN' : 'FAIL';
  console.log(`[${sym}] ${tag}${note ? '  -- ' + note : ''}`);
}

async function login(identifier, password) {
  const r = await http('POST', '/api/auth/login', { identifier, password });
  return r.ok ? r.data?.token : null;
}

(async () => {
  console.log(`\nTarget: ${base}\nTime: ${new Date().toISOString()}\n${'='.repeat(70)}`);

  // 1) Wake + health
  let h = await http('GET', '/api/health');
  record('GET', '/api/health', h.ok ? 'pass' : 'fail', h.error || `status=${h.status}`);

  let hd = await http('GET', '/api/health/diag');
  record('GET', '/api/health/diag', hd.ok ? 'pass' : 'fail',
    hd.ok ? `demoMode=${hd.data?.demoMode} db=${hd.data?.checks?.database || hd.data?.assistantRuntime?.startup?.checks?.database}` : `status=${hd.status}`);

  // 2) Seed
  const seed = await http('POST', '/api/demo/seed', {});
  record('POST', '/api/demo/seed', seed.ok ? 'pass' : 'fail', seed.error || `status=${seed.status}`);

  // 3) Logins
  const reception = await login('reception@smartopd.com', 'reception123');
  record('POST', '/api/auth/login (reception)', reception ? 'pass' : 'fail');

  const drCardio = await login('dr.patel@smartopd.com', 'doctor123');
  record('POST', '/api/auth/login (dr.patel)', drCardio ? 'pass' : 'fail');

  const drGen = await login('dr.sharma@smartopd.com', 'doctor123');
  record('POST', '/api/auth/login (dr.sharma)', drGen ? 'pass' : 'fail');

  const lab = await login('lab@smartopd.com', 'lab12345');
  record('POST', '/api/auth/login (lab)', lab ? 'pass' : 'fail');

  // 4) Patient register + login (uses /signup, not /register)
  const testEmail = `test.${Date.now()}@example.com`;
  const testPhone = `+9199${Date.now().toString().slice(-8)}`;
  const reg = await http('POST', '/api/auth/signup', {
    name: 'Audit Patient', email: testEmail, phone: testPhone,
    password: 'test1234'
  });
  record('POST', '/api/auth/signup', reg.ok ? 'pass' : 'fail',
    reg.ok ? `requiresVerification=${reg.data?.requiresVerification}` : `status=${reg.status} ${reg.data?.error || ''}`);

  // Patient signup requires OTP verification before login. Skip patient flow if no OTP exposed.
  let patient = null;
  if (reg.ok && reg.data?.otpSent?.otp) {
    const verify = await http('POST', '/api/auth/verify-otp', {
      userId: reg.data.userId, otp: reg.data.otpSent.otp
    });
    if (verify.ok) patient = verify.data?.token || await login(testEmail, 'test1234');
  }
  record('POST', '/api/auth/login (new patient)', patient ? 'pass' : 'degraded',
    patient ? '' : 'patient OTP verification not auto-completable in audit');

  // 5) Auth /me (uses correct nested path)
  if (reception) {
    const me = await http('GET', '/api/auth/me', null, reception);
    const role = me.data?.user?.role;
    record('GET', '/api/auth/me', me.ok && role ? 'pass' : (me.ok ? 'degraded' : 'fail'),
      me.ok ? `role=${role}` : `status=${me.status}`);
  }

  // 6) Admin
  if (reception) {
    const stats = await http('GET', '/api/admin/stats', null, reception);
    record('GET', '/api/admin/stats', stats.ok ? 'pass' : 'fail', stats.ok ? `keys=${Object.keys(stats.data || {}).join(',').slice(0, 80)}` : `status=${stats.status}`);

    const users = await http('GET', '/api/admin/users', null, reception);
    record('GET', '/api/admin/users', users.ok ? 'pass' : 'fail', users.ok ? `count=${Array.isArray(users.data) ? users.data.length : (users.data?.users?.length ?? '?')}` : `status=${users.status}`);
  }

  // 7) Appointments
  if (drCardio) {
    const appts = await http('GET', '/api/appointments', null, drCardio);
    record('GET', '/api/appointments (doctor)', appts.ok ? 'pass' : 'fail', appts.ok ? `count=${Array.isArray(appts.data) ? appts.data.length : '?'}` : `status=${appts.status}`);
  }

  if (patient) {
    const myAppts = await http('GET', '/api/appointments', null, patient);
    record('GET', '/api/appointments (patient)', myAppts.ok ? 'pass' : 'fail', `status=${myAppts.status}`);

    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const slots = await http('GET', `/api/appointments/available-slots?date=${tomorrow}&department=Cardiology`, null, patient);
    record('GET', '/api/appointments/available-slots', slots.ok ? 'pass' : 'fail', slots.ok ? `slots=${Array.isArray(slots.data) ? slots.data.length : (slots.data?.slots?.length ?? '?')}` : `status=${slots.status}`);

    const book = await http('POST', '/api/appointments', {
      department: 'Cardiology', date: tomorrow, timeSlot: '10:00 AM',
      symptoms: 'audit test'
    }, patient);
    record('POST', '/api/appointments', book.ok ? 'pass' : 'fail', book.ok ? `id=${book.data?._id || book.data?.id || book.data?.appointment?._id}` : `status=${book.status} ${book.data?.message || ''}`);

    if (book.ok) {
      const verify = await http('GET', '/api/appointments', null, patient);
      const found = Array.isArray(verify.data) && verify.data.some(a => a.symptoms === 'audit test');
      record('PERSIST', 'appointment after POST', found ? 'pass' : 'degraded', found ? '' : 'POST returned ok but appointment not visible in GET');
    }
  }

  // 8) Patient dashboard / profile
  if (patient) {
    const dash = await http('GET', '/api/patients/dashboard', null, patient);
    record('GET', '/api/patients/dashboard', dash.ok ? 'pass' : 'fail', `status=${dash.status}`);

    const profile = await http('GET', '/api/patients/profile', null, patient);
    record('GET', '/api/patients/profile', profile.ok ? 'pass' : (profile.status === 404 ? 'degraded' : 'fail'), `status=${profile.status}`);
  }

  // 9) Notifications
  if (patient) {
    const n = await http('GET', '/api/notifications', null, patient);
    record('GET', '/api/notifications', n.ok ? 'pass' : 'fail', `status=${n.status}`);

    const unread = await http('GET', '/api/notifications?unreadOnly=true', null, patient);
    record('GET', '/api/notifications?unreadOnly=true', unread.ok ? 'pass' : 'fail',
      unread.ok ? `unread=${unread.data?.unread ?? unread.data?.count ?? '?'}` : `status=${unread.status}`);
  }

  // 10) Lab — actual paths are /api/lab (list) and /api/lab/queue (lab tech)
  if (lab) {
    const queue = await http('GET', '/api/lab/queue', null, lab);
    record('GET', '/api/lab/queue', queue.ok ? 'pass' : 'fail', `status=${queue.status}`);

    const all = await http('GET', '/api/lab', null, lab);
    record('GET', '/api/lab', all.ok ? 'pass' : 'fail', `status=${all.status}`);
  }

  // 11) Consultations — list endpoint doesn't exist, only POST/GET by id. Use existing seeded appointment.
  if (drCardio) {
    const appts = await http('GET', '/api/appointments', null, drCardio);
    const apptId = Array.isArray(appts.data) && appts.data[0]?._id;
    if (apptId) {
      const cons = await http('POST', '/api/consultations', { appointmentId: apptId, chiefComplaint: 'audit', symptoms: ['test'] }, drCardio);
      record('POST', '/api/consultations', cons.ok ? 'pass' : 'fail', `status=${cons.status}`);
    }
  }

  // 12) Wellness / medications
  if (patient) {
    const wellness = await http('GET', '/api/wellness', null, patient);
    record('GET', '/api/wellness', wellness.ok ? 'pass' : (wellness.status === 404 ? 'degraded' : 'fail'), `status=${wellness.status}`);
  }

  // 13) Assistant — test as DOCTOR (we have token), verify it's NOT in demo mode
  const aiToken = drCardio || reception || patient;
  if (aiToken) {
    const ah = await http('GET', '/api/assistant/health', null, aiToken);
    const mode = ah.data?.runtime?.mode || ah.data?.mode;
    record('GET', '/api/assistant/health', ah.ok ? (mode === 'active' ? 'pass' : 'degraded') : 'fail',
      ah.ok ? `mode=${mode} demoMode=${ah.data?.demoMode || ah.data?.runtime?.demoMode}` : `status=${ah.status}`);

    const cmd = await http('POST', '/api/assistant/command', {
      text: 'show my appointments', language: 'en'
    }, aiToken);
    const cmdReply = cmd.data?.response || cmd.data?.reply || '';
    record('POST', '/api/assistant/command (logic)', cmd.ok && cmdReply ? 'pass' : (cmd.ok ? 'degraded' : 'fail'),
      cmd.ok ? `intent=${cmd.data?.intent} chars=${cmdReply.length} response="${cmdReply.slice(0, 60)}"` : `status=${cmd.status}`);

    const med = await http('POST', '/api/assistant/command', {
      text: 'I have a mild fever and headache', language: 'en'
    }, aiToken);
    const medReply = med.data?.response || med.data?.reply || '';
    record('POST', '/api/assistant/command (medical)', med.ok && medReply.length > 50 ? 'pass' : (med.ok ? 'degraded' : 'fail'),
      med.ok ? `intent=${med.data?.intent} chars=${medReply.length} response="${medReply.slice(0, 100)}"` : `status=${med.status}`);
  }

  // 14) Workflow
  if (drCardio) {
    const wf = await http('GET', '/api/workflow', null, drCardio);
    record('GET', '/api/workflow', wf.ok ? 'pass' : (wf.status === 404 ? 'degraded' : 'fail'), `status=${wf.status}`);
  }

  // 15) Vitals kiosk
  if (patient) {
    const vk = await http('GET', '/api/vitals-kiosk/status', null, patient);
    record('GET', '/api/vitals-kiosk/status', vk.ok ? 'pass' : (vk.status === 404 ? 'degraded' : 'fail'), `status=${vk.status}`);
  }

  // ===== SUMMARY =====
  console.log(`\n${'='.repeat(70)}\nSUMMARY: ${results.pass.length} PASS  ${results.degraded.length} WARN  ${results.fail.length} FAIL\n${'='.repeat(70)}`);
  if (results.fail.length) {
    console.log('\nFAILED:');
    results.fail.forEach(f => console.log(`  - ${f.tag}  ${f.note ? '(' + f.note + ')' : ''}`));
  }
  if (results.degraded.length) {
    console.log('\nDEGRADED:');
    results.degraded.forEach(f => console.log(`  - ${f.tag}  ${f.note ? '(' + f.note + ')' : ''}`));
  }
  process.exit(results.fail.length ? 1 : 0);
})();
