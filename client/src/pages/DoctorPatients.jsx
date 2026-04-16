import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users, Heart, Activity, Thermometer, Loader2, ArrowRight,
  Clock, AlertTriangle, CheckCircle, Stethoscope, Shield, Brain
} from 'lucide-react';
import api from '../lib/api';

const statusColors = {
  'scheduled': 'bg-gray-100 text-gray-700',
  'checked-in': 'bg-blue-100 text-blue-700',
  'in-queue': 'bg-yellow-100 text-yellow-700',
  'vitals-done': 'bg-green-100 text-green-700',
  'in-consultation': 'bg-purple-100 text-purple-700',
  'completed': 'bg-emerald-100 text-emerald-700',
};

const triageColors = {
  green: { badge: 'bg-emerald-100 text-emerald-700', label: 'Low Risk' },
  yellow: { badge: 'bg-yellow-100 text-yellow-700', label: 'Moderate' },
  orange: { badge: 'bg-orange-100 text-orange-700', label: 'High Risk' },
  red: { badge: 'bg-red-100 text-red-700', label: 'Critical' },
};

export default function DoctorPatients() {
  const navigate = useNavigate();
  const location = useLocation();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(null);

  // Reload patients every time this page is navigated to (fixes stale data after returning from consultation)
  useEffect(() => { loadPatients(); }, [location.key]);

  const loadPatients = async () => {
    try {
      const { data } = await api.get('/appointments/doctor/assigned');
      setPatients(data);
    } catch (err) {
      console.error('Failed to load patients:', err);
    }
    setLoading(false);
  };

  const startConsultation = async (appointmentId) => {
    setStarting(appointmentId);
    try {
      const { data } = await api.post('/consultations', {
        appointmentId,
        chiefComplaint: '',
        symptoms: []
      });
      navigate(`/consultation-room/${data._id}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to start consultation');
    }
    setStarting(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  const waiting = patients.filter(p => ['checked-in', 'in-queue', 'vitals-done'].includes(p.status));
  const inProgress = patients.filter(p => p.status === 'in-consultation');
  const completed = patients.filter(p => p.status === 'completed');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Assigned Patients</h1>
        <p className="text-gray-500">Today's patient queue and details</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total</p>
            <p className="text-xl font-bold">{patients.length}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center">
            <Clock className="w-5 h-5 text-yellow-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Waiting</p>
            <p className="text-xl font-bold">{waiting.length}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <Stethoscope className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">In Progress</p>
            <p className="text-xl font-bold">{inProgress.length}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Completed</p>
            <p className="text-xl font-bold">{completed.length}</p>
          </div>
        </div>
      </div>

      {/* Waiting Patients */}
      {waiting.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Clock className="w-5 h-5 text-yellow-500" /> Waiting ({waiting.length})
          </h2>
          <div className="space-y-3">
            {waiting.map(apt => (
              <PatientCard
                key={apt._id}
                apt={apt}
                onStart={() => startConsultation(apt._id)}
                starting={starting === apt._id}
              />
            ))}
          </div>
        </div>
      )}

      {/* In Consultation */}
      {inProgress.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-purple-500" /> In Consultation ({inProgress.length})
          </h2>
          <div className="space-y-3">
            {inProgress.map(apt => (
              <PatientCard
                key={apt._id}
                apt={apt}
                onStart={() => startConsultation(apt._id)}
                starting={starting === apt._id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" /> Completed ({completed.length})
          </h2>
          <div className="space-y-3">
            {completed.map(apt => (
              <PatientCard key={apt._id} apt={apt} />
            ))}
          </div>
        </div>
      )}

      {patients.length === 0 && (
        <div className="card text-center py-16">
          <Users className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">No patients assigned today</p>
          <p className="text-gray-300 text-sm mt-1">Patients will appear here when the reception assigns them to you</p>
        </div>
      )}
    </div>
  );
}

function PatientCard({ apt, onStart, starting }) {
  const v = apt.latestVitals;
  const canStart = ['checked-in', 'in-queue', 'vitals-done'].includes(apt.status);
  const triage = v?.triageLevel ? triageColors[v.triageLevel] : null;
  const navigate = useNavigate();

  return (
    <motion.div whileHover={{ y: -1 }} className="card p-5">
      <div className="flex items-start gap-4">
        {/* Token */}
        <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center text-primary-600 font-bold text-lg shrink-0">
          #{apt.tokenNumber || '—'}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-semibold text-gray-900">{apt.patientId?.name || 'Patient'}</h3>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[apt.status] || 'bg-gray-100 text-gray-700'}`}>
              {apt.status}
            </span>
            {triage && v.triageLevel !== 'green' && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${triage.badge}`}>
                <Shield className="w-3 h-3" /> {triage.label}
              </span>
            )}
            {apt.priority === 'urgent' && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Urgent
              </span>
            )}
            {apt.type === 'follow-up' && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                Follow-up
              </span>
            )}
            {apt.roomNumber && (
              <span className="text-xs text-gray-400">Room {apt.roomNumber}</span>
            )}
          </div>

          {/* Info */}
          <p className="text-sm text-gray-500 mt-1">
            {apt.department} • {apt.reasonForVisit || apt.symptoms?.join(', ') || 'No reason specified'}
          </p>

          {/* Vitals bar */}
          {v && (
            <div className="flex flex-wrap gap-3 mt-3">
              {v.bloodPressure && (
                <div className="flex items-center gap-1 text-xs bg-red-50 text-red-700 px-2 py-1 rounded-lg">
                  <Activity className="w-3 h-3" /> BP: {v.bloodPressure.systolic}/{v.bloodPressure.diastolic}
                </div>
              )}
              {v.heartRate && (
                <div className="flex items-center gap-1 text-xs bg-pink-50 text-pink-700 px-2 py-1 rounded-lg">
                  <Heart className="w-3 h-3" /> HR: {v.heartRate} bpm
                </div>
              )}
              {v.temperature && (
                <div className="flex items-center gap-1 text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded-lg">
                  <Thermometer className="w-3 h-3" /> {v.temperature}°F
                </div>
              )}
              {v.oxygenSaturation && (
                <div className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-lg">
                  SpO2: {v.oxygenSaturation}%
                </div>
              )}
            </div>
          )}

          {/* AI Summary Preview */}
          {v?.aiTriageAssessment && (
            <div className="mt-3 p-2.5 bg-purple-50 rounded-lg text-xs text-purple-700 flex items-start gap-1.5">
              <Brain className="w-3.5 h-3.5 mt-0.5 shrink-0 text-purple-500" />
              <span className="line-clamp-2">{v.aiTriageAssessment}</span>
            </div>
          )}
        </div>

        {/* Action */}
        <div className="flex flex-col gap-2 shrink-0">
          {canStart && onStart && (
            <button onClick={onStart} disabled={starting}
              className="btn-primary flex items-center gap-2 !px-4 !py-2 text-sm">
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              Start Consultation
            </button>
          )}
          {apt.status === 'in-consultation' && apt.consultationId && (
            <button onClick={() => navigate(`/consultation-room/${apt.consultationId}`)}
              className="btn-primary flex items-center gap-2 !px-4 !py-2 text-sm bg-purple-600 hover:bg-purple-700">
              <Stethoscope className="w-4 h-4" /> Continue Consultation
            </button>
          )}
          {apt.status === 'in-consultation' && !apt.consultationId && onStart && (
            <button onClick={onStart} disabled={starting}
              className="btn-primary flex items-center gap-2 !px-4 !py-2 text-sm bg-purple-600 hover:bg-purple-700">
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Stethoscope className="w-4 h-4" />}
              Continue Consultation
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
