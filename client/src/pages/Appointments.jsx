import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDate, getStatusColor } from '../lib/utils';
import { Calendar, Clock, Plus, X, Search, MapPin, Stethoscope, Navigation, Activity, FlaskConical, CheckCircle, AlertTriangle, Loader2, QrCode } from 'lucide-react';

const DEPARTMENTS = ['General Medicine', 'Cardiology', 'Orthopedics', 'Dermatology', 'ENT', 'Pediatrics', 'Ophthalmology', 'Gynecology', 'Neurology', 'Urology'];

// Lazy-loads the kiosk QR PNG (auth required) and shows it inline.
function KioskQr({ appointmentId }) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (src || loading) return;
    setLoading(true); setErr(null);
    try {
      const res = await api.get(`/appointments/${appointmentId}/qr`, { responseType: 'blob' });
      setSrc(URL.createObjectURL(res.data));
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to load QR');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3">
      <button type="button" onClick={toggle} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition">
        <QrCode className="w-3.5 h-3.5" />
        {open ? 'Hide kiosk QR' : 'Show kiosk QR'}
      </button>
      {open && (
        <div className="mt-2 p-3 bg-white border border-gray-200 rounded-xl inline-block">
          {loading && <div className="flex items-center gap-2 text-gray-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
          {err && <p className="text-red-600 text-sm">{err}</p>}
          {src && (
            <>
              <img src={src} alt="Vitals kiosk QR" className="w-48 h-48" />
              <p className="text-xs text-gray-500 mt-2 max-w-xs">Scan this at the vitals kiosk. The machine will read your sensors and send the data automatically.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Appointments() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    department: '',
    timeSlot: '',
    type: 'new',
    reasonForVisit: '',
    symptoms: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const fetchAppointments = async () => {
    try {
      const res = await api.get('/appointments');
      setAppointments(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAppointments(); }, []);

  // Fetch available slots when date or department changes
  useEffect(() => {
    if (form.date && form.department) {
      setSlotsLoading(true);
      api.get(`/appointments/available-slots?date=${form.date}&department=${encodeURIComponent(form.department)}`)
        .then(res => setAvailableSlots(res.data.slots || []))
        .catch(() => setAvailableSlots([]))
        .finally(() => setSlotsLoading(false));
    } else {
      setAvailableSlots([]);
    }
    setForm(f => ({ ...f, timeSlot: '' }));
  }, [form.date, form.department]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/appointments', {
        ...form,
        symptoms: form.symptoms ? form.symptoms.split(',').map(s => s.trim()) : []
      });
      setShowForm(false);
      setForm({ date: new Date().toISOString().split('T')[0], department: '', timeSlot: '', type: 'new', reasonForVisit: '', symptoms: '' });
      fetchAppointments();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to book');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await api.put(`/appointments/${id}/status`, { status });
      fetchAppointments();
    } catch (err) {
      alert('Failed to update status');
    }
  };

  // Helper to determine which action buttons to show for patient
  const getPatientActions = (apt) => {
    const actions = [];
    if (apt.status === 'scheduled') {
      actions.push({ label: 'Cancel', type: 'danger', action: () => handleStatusChange(apt._id, 'cancelled') });
    }
    if (apt.status === 'checked-in' && apt.doctorId) {
      actions.push({ label: 'Navigate to Clinic', type: 'navigate', link: `/navigate/${apt._id}` });
      actions.push({ label: 'Record Vitals', type: 'primary', link: `/vitals-kiosk/${apt._id}` });
    }
    if (apt.status === 'in-queue' || apt.status === 'vitals-done') {
      actions.push({ label: 'View Queue', type: 'secondary', link: '/queue' });
    }
    return actions;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-3 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
          <p className="text-gray-500">{user?.role === 'patient' ? 'Book and track your appointments' : 'Manage patient appointments'}</p>
        </div>
        {user?.role === 'patient' && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2">
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? 'Cancel' : 'Book Appointment'}
          </button>
        )}
      </div>

      {/* Booking Form */}
      <AnimatePresence>
      {showForm && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Book New Appointment</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input-field" min={new Date().toISOString().split('T')[0]} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <select required value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className="input-field">
                <option value="">Select Department</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">Available Time Slots</label>
                <span className="text-xs text-gray-400">All times in IST</span>
              </div>
              {slotsLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Checking availability...
                </div>
              ) : !form.date || !form.department ? (
                <p className="text-sm text-gray-400 py-2">Select a date and department to see available slots</p>
              ) : availableSlots.length === 0 ? (
                <p className="text-sm text-red-500 py-2">No slots configured for this date. Try another date.</p>
              ) : availableSlots.filter(s => s.available).length === 0 ? (
                <p className="text-sm text-amber-600 py-2">All slots for this date are booked or have already passed. Please pick another date.</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {availableSlots.map(({ slot, available }) => (
                      <button
                        key={slot}
                        type="button"
                        disabled={!available}
                        onClick={() => setForm({ ...form, timeSlot: slot })}
                        title={!available ? 'Slot already booked or in the past (IST)' : `Book ${slot} IST`}
                        className={`py-2 px-3 rounded-xl text-sm font-medium border transition-all ${
                          !available
                            ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed line-through'
                            : form.timeSlot === slot
                              ? 'bg-primary-50 border-primary-500 text-primary-700 ring-2 ring-primary-200'
                              : 'bg-white border-gray-200 text-gray-700 hover:border-primary-300 hover:bg-primary-50/50'
                        }`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {availableSlots.filter(s => s.available).length} of {availableSlots.length} slots open
                    {form.timeSlot && <span className="ml-2 text-primary-600 font-medium">· Selected: {form.timeSlot} IST</span>}
                  </p>
                </>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Visit Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="input-field">
                <option value="new">New Visit</option>
                <option value="follow-up">Follow-up</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Symptoms (comma separated)</label>
              <input type="text" value={form.symptoms} onChange={e => setForm({ ...form, symptoms: e.target.value })} className="input-field" placeholder="e.g., headache, fever, cough" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Visit</label>
              <input type="text" value={form.reasonForVisit} onChange={e => setForm({ ...form, reasonForVisit: e.target.value })} className="input-field" placeholder="Briefly describe why you need to visit" />
            </div>
            <div className="md:col-span-2">
              <button type="submit" disabled={submitting || !form.timeSlot} className="btn-primary disabled:opacity-50">
                {submitting ? 'Booking...' : 'Confirm Appointment'}
              </button>
            </div>
          </form>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Appointment List */}
      {appointments.length === 0 ? (
        <div className="card text-center py-12">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No appointments yet</p>
          {user?.role === 'patient' && <p className="text-gray-300 text-sm mt-1">Book your first appointment to get started</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map(apt => (
            <motion.div key={apt._id} whileHover={{ y: -1 }} className="card">
              <div className="flex flex-col sm:flex-row items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 font-bold shrink-0">
                  #{apt.tokenNumber || '-'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-semibold text-gray-900">{apt.department}</p>
                    <span className={`badge ${getStatusColor(apt.status)}`}>{apt.status}</span>
                    {apt.priority === 'urgent' && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Urgent
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                    <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDate(apt.date)}</span>
                    {apt.timeSlot && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{apt.timeSlot}</span>}
                  </div>
                  {apt.reasonForVisit && <p className="text-sm text-gray-400 mt-1">{apt.reasonForVisit}</p>}

                  {/* Doctor Assignment Banner */}
                  {apt.doctorId && (
                    <div className="mt-3 p-3 bg-green-50 rounded-xl border border-green-100">
                      <div className="flex items-center gap-2 text-green-800">
                        <Stethoscope className="w-4 h-4" />
                        <span className="font-medium">{apt.doctorId.name}</span>
                        {apt.doctorId.specialization && <span className="text-green-600 text-sm">({apt.doctorId.specialization})</span>}
                      </div>
                      {apt.status === 'checked-in' && (
                        <p className="text-green-600 text-xs mt-1">Your appointment has been confirmed. Please proceed for vitals check.</p>
                      )}
                    </div>
                  )}

                  {/* Completed Consultation Summary */}
                  {apt.status === 'completed' && (
                    <div className="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100 space-y-2">
                      <div className="flex items-center gap-2 text-emerald-800">
                        <CheckCircle className="w-4 h-4" />
                        <span className="font-medium text-sm">Consultation Completed</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link to="/medications" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition">
                          💊 View Prescriptions
                        </Link>
                        <Link to="/lab-results" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 transition">
                          <FlaskConical className="w-3 h-3" /> Lab Results
                        </Link>
                        <Link to="/medication-reminders" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 transition">
                          ⏰ Medication Reminders
                        </Link>
                        <Link to="/follow-ups" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition">
                          📅 Follow-ups
                        </Link>
                      </div>
                    </div>
                  )}

                  {/* Patient action buttons */}
                  {user?.role === 'patient' && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {getPatientActions(apt).map((action, i) => (
                        action.link ? (
                          <Link key={i} to={action.link} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                            action.type === 'navigate' ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' :
                            action.type === 'primary' ? 'bg-primary-50 text-primary-700 hover:bg-primary-100' :
                            'bg-gray-50 text-gray-700 hover:bg-gray-100'
                          }`}>
                            {action.type === 'navigate' && <Navigation className="w-3.5 h-3.5" />}
                            {action.type === 'primary' && <Activity className="w-3.5 h-3.5" />}
                            {action.label}
                          </Link>
                        ) : (
                          <button key={i} onClick={action.action} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                            action.type === 'danger' ? 'text-red-500 hover:bg-red-50' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                          }`}>{action.label}</button>
                        )
                      ))}
                    </div>
                  )}

                  {/* Kiosk QR for upcoming patient appointments */}
                  {user?.role === 'patient' && ['scheduled', 'checked-in', 'in-queue'].includes(apt.status) && (
                    <KioskQr appointmentId={apt._id} />
                  )}

                  {/* Staff action buttons */}
                  {user?.role !== 'patient' && apt.status !== 'completed' && apt.status !== 'cancelled' && (
                    <div className="flex gap-2 mt-3">
                      {apt.status === 'scheduled' && <button onClick={() => handleStatusChange(apt._id, 'checked-in')} className="btn-secondary text-sm !px-3 !py-1.5">Check In</button>}
                      {apt.status === 'checked-in' && <button onClick={() => handleStatusChange(apt._id, 'in-queue')} className="btn-secondary text-sm !px-3 !py-1.5">Add to Queue</button>}
                      {apt.status === 'vitals-done' && <button onClick={() => handleStatusChange(apt._id, 'in-consultation')} className="btn-primary text-sm !px-3 !py-1.5">Start Consultation</button>}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
