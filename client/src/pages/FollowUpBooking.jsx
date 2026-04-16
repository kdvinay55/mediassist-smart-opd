import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, Plus, Loader2, CheckCircle } from 'lucide-react';
import api from '../lib/api';

export default function FollowUpBooking() {
  const [followUps, setFollowUps] = useState([]);
  const [consultations, setConsultations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: '', department: 'General Medicine', timeSlot: '10:00', reason: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get('/appointments', { params: { type: 'follow-up' } });
        setFollowUps(Array.isArray(data) ? data : data.appointments || []);
      } catch { /* ignore */ }
      try {
        const { data } = await api.get('/consultations');
        const c = Array.isArray(data) ? data : data.consultations || [];
        setConsultations(c.filter(x => x.followUpDate && !x._followUpBooked));
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, []);

  const bookFollowUp = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/appointments', {
        date: form.date, department: form.department, timeSlot: form.timeSlot,
        type: 'follow-up', reasonForVisit: form.reason, symptoms: []
      });
      setShowForm(false);
      // Reload
      const { data } = await api.get('/appointments', { params: { type: 'follow-up' } });
      setFollowUps(Array.isArray(data) ? data : data.appointments || []);
    } catch { /* ignore */ }
    setSubmitting(false);
  };

  const autoBook = async (consultationId) => {
    try {
      await api.post(`/workflow/follow-up/${consultationId}`);
      const { data } = await api.get('/appointments', { params: { type: 'follow-up' } });
      setFollowUps(Array.isArray(data) ? data : data.appointments || []);
      setConsultations(prev => prev.filter(c => c._id !== consultationId));
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Follow-up Appointments</h1>
          <p className="text-gray-500 mt-1">Schedule and manage follow-up visits</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Book Follow-up
        </button>
      </div>

      {/* Suggested follow-ups from consultations */}
      {consultations.length > 0 && (
        <div className="card p-5 border-l-4 border-amber-400">
          <h3 className="font-semibold text-amber-800 mb-3">Recommended Follow-ups</h3>
          {consultations.map(c => (
            <div key={c._id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div>
                <div className="text-sm font-medium">{c.chiefComplaint || 'Consultation'}</div>
                <div className="text-xs text-gray-500">Suggested: {new Date(c.followUpDate).toLocaleDateString()}</div>
              </div>
              <button onClick={() => autoBook(c._id)} className="btn-primary text-xs px-3 py-1.5">Auto-Book</button>
            </div>
          ))}
        </div>
      )}

      {/* Booking Form */}
      {showForm && (
        <motion.form initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          onSubmit={bookFollowUp} className="card p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" required value={form.date} min={new Date().toISOString().split('T')[0]}
                onChange={e => setForm({ ...form, date: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className="input-field">
                {['General Medicine', 'Cardiology', 'Orthopedics', 'Pediatrics', 'Dermatology', 'ENT', 'Ophthalmology', 'Neurology'].map(d => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time Slot</label>
              <select value={form.timeSlot} onChange={e => setForm({ ...form, timeSlot: e.target.value })} className="input-field">
                {['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00'].map(t => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
                className="input-field" placeholder="Follow-up reason" />
            </div>
          </div>
          <button type="submit" disabled={submitting} className="btn-primary flex items-center gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />} Book
          </button>
        </motion.form>
      )}

      {/* Follow-up List */}
      <div className="space-y-3">
        {followUps.map((appt, i) => (
          <motion.div key={appt._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                appt.status === 'completed' ? 'bg-green-100' : 'bg-primary-100'
              }`}>
                {appt.status === 'completed' ? <CheckCircle className="w-5 h-5 text-green-600" /> : <Calendar className="w-5 h-5 text-primary-600" />}
              </div>
              <div>
                <div className="font-medium text-gray-900 text-sm">{appt.department}</div>
                <div className="text-xs text-gray-500 flex items-center gap-2">
                  <Calendar className="w-3 h-3" />{new Date(appt.date).toLocaleDateString()}
                  {appt.timeSlot && <><Clock className="w-3 h-3 ml-1" />{appt.timeSlot}</>}
                </div>
                {appt.reasonForVisit && <div className="text-xs text-gray-400 mt-0.5">{appt.reasonForVisit}</div>}
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              appt.status === 'completed' ? 'bg-green-100 text-green-700' :
              appt.status === 'cancelled' ? 'bg-red-100 text-red-700' :
              'bg-blue-100 text-blue-700'
            }`}>{appt.status}</span>
          </motion.div>
        ))}
        {followUps.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-400">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>No follow-up appointments</p>
          </div>
        )}
      </div>
    </div>
  );
}
