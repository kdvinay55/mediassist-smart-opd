import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserCheck, Users, Clock, Search, CheckCircle, AlertTriangle,
  Loader2, Stethoscope, MapPin, Phone, Mail, CalendarDays, Filter, RefreshCw,
  ChevronDown, Heart, Pill, FileText, Activity
} from 'lucide-react';
import api from '../lib/api';
import useSocket from '../lib/useSocket';

const statusColors = {
  'scheduled': 'bg-gray-100 text-gray-700',
  'checked-in': 'bg-blue-100 text-blue-700',
  'in-queue': 'bg-yellow-100 text-yellow-700',
  'vitals-done': 'bg-green-100 text-green-700',
  'in-consultation': 'bg-purple-100 text-purple-700',
  'completed': 'bg-emerald-100 text-emerald-700',
  'cancelled': 'bg-red-100 text-red-700',
};

export default function ReceptionDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [verifying, setVerifying] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [expandedPatient, setExpandedPatient] = useState(null);
  const [patientProfile, setPatientProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [doctorsByDept, setDoctorsByDept] = useState({}); // { 'Cardiology': [{_id,name,specialization}] }
  const [doctorChoice, setDoctorChoice] = useState({}); // { [appointmentId]: doctorId | '' }
  const [showPicker, setShowPicker] = useState({}); // { [appointmentId]: boolean }

  useEffect(() => { loadAppointments(); }, []);

  // Real-time refresh whenever a new appointment is booked or a patient is verified
  useSocket({
    reception: true,
    events: {
      'reception-queue-update': () => loadAppointments(),
      'new-appointment': () => loadAppointments(),
      'queue-update': () => loadAppointments()
    }
  });

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await api.get(`/appointments?date=${today}`);
      setAppointments(data);
    } catch (err) {
      console.error('Failed to load appointments:', err);
    }
    setLoading(false);
  };

  const loadDoctorsForDept = async (department) => {
    if (!department || doctorsByDept[department]) return;
    try {
      const { data } = await api.get(`/admin/users?role=doctor&department=${encodeURIComponent(department)}&isActive=true`);
      setDoctorsByDept(prev => ({ ...prev, [department]: data || [] }));
    } catch (err) {
      console.error('Failed to load doctors for', department, err);
      setDoctorsByDept(prev => ({ ...prev, [department]: [] }));
    }
  };

  const togglePicker = (appointmentId, department) => {
    const next = !showPicker[appointmentId];
    setShowPicker(prev => ({ ...prev, [appointmentId]: next }));
    if (next) loadDoctorsForDept(department);
  };

  const verifyAndAssign = async (appointmentId) => {
    setVerifying(appointmentId);
    setVerifyResult(null);
    try {
      const chosen = doctorChoice[appointmentId];
      const body = chosen ? { doctorId: chosen } : {};
      const { data } = await api.post(`/appointments/${appointmentId}/verify-assign`, body);
      setVerifyResult({ id: appointmentId, success: true, message: data.message, doctor: data.assignedDoctor, room: data.roomNumber, mode: data.assignmentMode });
      setShowPicker(prev => ({ ...prev, [appointmentId]: false }));
      await loadAppointments();
    } catch (err) {
      setVerifyResult({ id: appointmentId, success: false, message: err.response?.data?.error || 'Verification failed' });
    }
    setVerifying(null);
  };

  const togglePatientProfile = async (appointmentId) => {
    if (expandedPatient === appointmentId) {
      setExpandedPatient(null);
      setPatientProfile(null);
      return;
    }
    setExpandedPatient(appointmentId);
    setProfileLoading(true);
    try {
      const { data } = await api.get(`/appointments/${appointmentId}/patient-profile`);
      setPatientProfile(data);
    } catch {
      setPatientProfile(null);
    }
    setProfileLoading(false);
  };

  const filtered = appointments.filter(apt => {
    if (filter !== 'all' && apt.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        apt.patientId?.name?.toLowerCase().includes(q) ||
        apt.department?.toLowerCase().includes(q) ||
        apt.patientId?.phone?.includes(q) ||
        apt.patientId?.email?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const scheduled = appointments.filter(a => a.status === 'scheduled');
  const checkedIn = appointments.filter(a => ['checked-in', 'in-queue', 'vitals-done'].includes(a.status));
  const inConsult = appointments.filter(a => a.status === 'in-consultation');
  const done = appointments.filter(a => a.status === 'completed');

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UserCheck className="w-7 h-7 text-primary-500" /> Reception Desk
          </h1>
          <p className="text-gray-500 mt-1">Verify patients, assign doctors, manage queue</p>
        </div>
        <button onClick={loadAppointments} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <motion.div whileHover={{ y: -2 }} className="card p-4 flex items-center gap-3 cursor-pointer" onClick={() => setFilter('scheduled')}>
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{scheduled.length}</p>
            <p className="text-xs text-gray-500">Awaiting Check-in</p>
          </div>
        </motion.div>
        <motion.div whileHover={{ y: -2 }} className="card p-4 flex items-center gap-3 cursor-pointer" onClick={() => setFilter('in-queue')}>
          <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center">
            <Clock className="w-5 h-5 text-yellow-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{checkedIn.length}</p>
            <p className="text-xs text-gray-500">In Queue</p>
          </div>
        </motion.div>
        <motion.div whileHover={{ y: -2 }} className="card p-4 flex items-center gap-3 cursor-pointer" onClick={() => setFilter('in-consultation')}>
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <Stethoscope className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{inConsult.length}</p>
            <p className="text-xs text-gray-500">In Consultation</p>
          </div>
        </motion.div>
        <motion.div whileHover={{ y: -2 }} className="card p-4 flex items-center gap-3 cursor-pointer" onClick={() => setFilter('completed')}>
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{done.length}</p>
            <p className="text-xs text-gray-500">Completed</p>
          </div>
        </motion.div>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-10"
            placeholder="Search by patient name, phone, email, or department..."
          />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {['all', 'scheduled', 'in-queue', 'in-consultation', 'completed'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition capitalize ${
                filter === f ? 'bg-white shadow text-primary-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f === 'all' ? 'All' : f.replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Appointments List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="card text-center py-16">
            <Users className="w-14 h-14 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-lg">No appointments found</p>
            <p className="text-gray-300 text-sm mt-1">{filter !== 'all' ? 'Try changing the filter' : 'No patients scheduled for today'}</p>
          </div>
        ) : (
          filtered.map(apt => (
            <motion.div
              key={apt._id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card p-5"
            >
              <div className="flex items-start gap-4">
                {/* Token / Avatar */}
                <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center text-primary-600 font-bold text-lg shrink-0">
                  {apt.tokenNumber ? `#${apt.tokenNumber}` : '—'}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Patient Info */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{apt.patientId?.name || 'Unknown Patient'}</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[apt.status] || 'bg-gray-100'}`}>
                      {apt.status}
                    </span>
                    {apt.priority === 'urgent' && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Urgent
                      </span>
                    )}
                    {apt.priority === 'emergency' && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500 text-white flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Emergency
                      </span>
                    )}
                  </div>

                  {/* Contact */}
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                    {apt.patientId?.phone && (
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {apt.patientId.phone}</span>
                    )}
                    {apt.patientId?.email && (
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {apt.patientId.email}</span>
                    )}
                  </div>

                  {/* Department + Reason */}
                  <div className="flex items-center gap-3 mt-2 text-sm">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">{apt.department}</span>
                    {apt.timeSlot && <span className="text-gray-400 text-xs">{apt.timeSlot}</span>}
                  </div>
                  {apt.reasonForVisit && (
                    <p className="text-sm text-gray-600 mt-1">{apt.reasonForVisit}</p>
                  )}
                  {apt.symptoms?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {apt.symptoms.map((s, i) => (
                        <span key={i} className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded text-xs">{s}</span>
                      ))}
                    </div>
                  )}

                  {/* View Patient Profile Button */}
                  <button
                    onClick={() => togglePatientProfile(apt._id)}
                    className="mt-2 flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {expandedPatient === apt._id ? 'Hide' : 'View'} Patient History
                    <ChevronDown className={`w-3 h-3 transition ${expandedPatient === apt._id ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Expanded Patient Profile */}
                  <AnimatePresence>
                    {expandedPatient === apt._id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 rounded-xl border border-gray-100 bg-gray-50 overflow-hidden"
                      >
                        {profileLoading ? (
                          <div className="p-4 flex items-center gap-2 text-sm text-gray-400">
                            <Loader2 className="w-4 h-4 animate-spin" /> Loading patient profile...
                          </div>
                        ) : patientProfile ? (
                          <div className="p-4 space-y-3 text-sm">
                            {/* Basic Info */}
                            {patientProfile.profile && (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {patientProfile.profile.dateOfBirth && (
                                  <div className="bg-white rounded-lg p-2">
                                    <p className="text-[10px] text-gray-400 uppercase">Age</p>
                                    <p className="font-medium text-gray-800">{Math.floor((new Date() - new Date(patientProfile.profile.dateOfBirth)) / 31557600000)} yrs</p>
                                  </div>
                                )}
                                {patientProfile.profile.gender && (
                                  <div className="bg-white rounded-lg p-2">
                                    <p className="text-[10px] text-gray-400 uppercase">Gender</p>
                                    <p className="font-medium text-gray-800 capitalize">{patientProfile.profile.gender}</p>
                                  </div>
                                )}
                                {patientProfile.profile.bloodGroup && (
                                  <div className="bg-white rounded-lg p-2">
                                    <p className="text-[10px] text-gray-400 uppercase">Blood Group</p>
                                    <p className="font-medium text-red-600">{patientProfile.profile.bloodGroup}</p>
                                  </div>
                                )}
                                {patientProfile.profile.emergencyContact?.name && (
                                  <div className="bg-white rounded-lg p-2">
                                    <p className="text-[10px] text-gray-400 uppercase">Emergency Contact</p>
                                    <p className="font-medium text-gray-800">{patientProfile.profile.emergencyContact.name} ({patientProfile.profile.emergencyContact.relation})</p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Allergies & Conditions */}
                            <div className="flex flex-wrap gap-3">
                              {patientProfile.profile?.allergies?.length > 0 && (
                                <div>
                                  <p className="text-[10px] text-gray-400 uppercase mb-1">Allergies</p>
                                  <div className="flex gap-1 flex-wrap">
                                    {patientProfile.profile.allergies.map((a, i) => (
                                      <span key={i} className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-xs font-medium">{a}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {patientProfile.profile?.chronicConditions?.length > 0 && (
                                <div>
                                  <p className="text-[10px] text-gray-400 uppercase mb-1">Chronic Conditions</p>
                                  <div className="flex gap-1 flex-wrap">
                                    {patientProfile.profile.chronicConditions.map((c, i) => (
                                      <span key={i} className="px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded text-xs font-medium">{c}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {patientProfile.profile?.currentMedications?.length > 0 && (
                                <div>
                                  <p className="text-[10px] text-gray-400 uppercase mb-1">Current Medications</p>
                                  <div className="flex gap-1 flex-wrap">
                                    {patientProfile.profile.currentMedications.map((m, i) => (
                                      <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">{m}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Medical History */}
                            {patientProfile.profile?.medicalHistory?.length > 0 && (
                              <div>
                                <p className="text-[10px] text-gray-400 uppercase mb-1">Medical History</p>
                                <div className="space-y-1">
                                  {patientProfile.profile.medicalHistory.map((h, i) => (
                                    <div key={i} className="bg-white rounded-lg p-2 flex items-center justify-between">
                                      <span className="text-gray-800">{h.condition}</span>
                                      <span className={`text-xs px-2 py-0.5 rounded ${h.status === 'ongoing' ? 'bg-yellow-50 text-yellow-700' : 'bg-green-50 text-green-700'}`}>{h.status}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Last Vitals */}
                            {patientProfile.lastVitals && (
                              <div>
                                <p className="text-[10px] text-gray-400 uppercase mb-1">Last Recorded Vitals</p>
                                <div className="flex flex-wrap gap-2">
                                  {patientProfile.lastVitals.bloodPressure && (
                                    <span className="bg-white rounded-lg px-2 py-1 text-xs"><strong>BP:</strong> {patientProfile.lastVitals.bloodPressure.systolic}/{patientProfile.lastVitals.bloodPressure.diastolic}</span>
                                  )}
                                  {patientProfile.lastVitals.heartRate && <span className="bg-white rounded-lg px-2 py-1 text-xs"><strong>HR:</strong> {patientProfile.lastVitals.heartRate} bpm</span>}
                                  {patientProfile.lastVitals.temperature && <span className="bg-white rounded-lg px-2 py-1 text-xs"><strong>Temp:</strong> {patientProfile.lastVitals.temperature}°F</span>}
                                  {patientProfile.lastVitals.oxygenSaturation && <span className="bg-white rounded-lg px-2 py-1 text-xs"><strong>O2:</strong> {patientProfile.lastVitals.oxygenSaturation}%</span>}
                                </div>
                              </div>
                            )}

                            {/* Past Visits */}
                            {patientProfile.pastAppointments?.length > 0 && (
                              <div>
                                <p className="text-[10px] text-gray-400 uppercase mb-1">Recent Visits</p>
                                <div className="space-y-1">
                                  {patientProfile.pastAppointments.map((pa, i) => (
                                    <div key={i} className="bg-white rounded-lg p-2 text-xs flex items-center gap-2">
                                      <span className="text-gray-400">{new Date(pa.date).toLocaleDateString()}</span>
                                      <span className="text-gray-800 font-medium">{pa.department}</span>
                                      {pa.reasonForVisit && <span className="text-gray-500">- {pa.reasonForVisit}</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {!patientProfile.profile && !patientProfile.lastVitals && patientProfile.pastAppointments?.length === 0 && (
                              <p className="text-gray-400 text-xs">No previous records found. This appears to be a new patient.</p>
                            )}
                          </div>
                        ) : (
                          <div className="p-4 text-sm text-gray-400">No profile data available</div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Doctor assignment info */}
                  {apt.doctorId && (
                    <div className="flex items-center gap-2 mt-2 text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-lg w-fit">
                      <Stethoscope className="w-3.5 h-3.5" />
                      <span>Assigned to <strong>Dr. {apt.doctorId.name}</strong></span>
                      {apt.doctorId.specialization && <span className="text-green-500">({apt.doctorId.specialization})</span>}
                    </div>
                  )}

                  {/* Verify result */}
                  <AnimatePresence>
                    {verifyResult?.id === apt._id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className={`mt-3 p-3 rounded-xl text-sm ${
                          verifyResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                        }`}
                      >
                        {verifyResult.success ? (
                          <div className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            <div>
                              <p className="font-medium">{verifyResult.message}</p>
                              {verifyResult.doctor && (
                                <p className="text-green-600 mt-0.5">
                                  Doctor: {verifyResult.doctor.name} ({verifyResult.doctor.specialization}) • Room {verifyResult.room}
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            {verifyResult.message}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Action area */}
                {apt.status === 'scheduled' && !apt.doctorId && (
                  <div className="shrink-0 flex flex-col items-end gap-2 min-w-[180px]">
                    <button
                      onClick={() => togglePicker(apt._id, apt.department)}
                      className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                    >
                      <Stethoscope className="w-3.5 h-3.5" />
                      {showPicker[apt._id] ? 'Hide doctor picker' : 'Choose doctor (optional)'}
                      <ChevronDown className={`w-3 h-3 transition ${showPicker[apt._id] ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {showPicker[apt._id] && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="w-full overflow-hidden"
                        >
                          <select
                            value={doctorChoice[apt._id] || ''}
                            onChange={e => setDoctorChoice(prev => ({ ...prev, [apt._id]: e.target.value }))}
                            className="input-field text-xs py-1.5 w-full"
                          >
                            <option value="">Auto-assign (least busy)</option>
                            {(doctorsByDept[apt.department] || []).map(doc => (
                              <option key={doc._id} value={doc._id}>
                                Dr. {doc.name}{doc.specialization ? ` — ${doc.specialization}` : ''}
                              </option>
                            ))}
                          </select>
                          {doctorsByDept[apt.department] && doctorsByDept[apt.department].length === 0 && (
                            <p className="text-[10px] text-gray-400 mt-1">No doctors found in {apt.department}</p>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <button
                      onClick={() => verifyAndAssign(apt._id)}
                      disabled={verifying === apt._id}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium text-sm shadow-lg shadow-primary-500/20 hover:shadow-primary-500/30 transition disabled:opacity-50"
                    >
                      {verifying === apt._id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserCheck className="w-4 h-4" />
                      )}
                      Verify & Assign
                    </button>
                  </div>
                )}
                {apt.status === 'scheduled' && apt.doctorId && (
                  <span className="shrink-0 px-3 py-1.5 bg-green-100 text-green-700 rounded-xl text-xs font-medium flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Assigned
                  </span>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
