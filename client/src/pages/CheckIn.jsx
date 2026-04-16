import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, MapPin, Hash, Loader2, ArrowRight, Camera, Navigation } from 'lucide-react';
import api from '../lib/api';

export default function CheckIn() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const [appointment, setAppointment] = useState(null);
  const [queueInfo, setQueueInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);

  useEffect(() => {
    if (appointmentId) loadAppointment();
  }, [appointmentId]);

  const loadAppointment = async () => {
    try {
      const { data } = await api.get(`/appointments/${appointmentId}`);
      setAppointment(data);
      if (['in-queue', 'vitals-done', 'in-consultation'].includes(data.status)) {
        setCheckedIn(true);
        setQueueInfo({ tokenNumber: data.tokenNumber, queuePosition: data.queuePosition, waitingTime: data.estimatedWaitTime });
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleCheckIn = async () => {
    setCheckingIn(true);
    try {
      const { data } = await api.post(`/workflow/${appointmentId}/check-in`);
      setQueueInfo(data);
      setCheckedIn(true);
    } catch { /* ignore */ }
    setCheckingIn(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>;
  if (!appointment) return <div className="text-center py-20 text-gray-500">Appointment not found</div>;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Digital Check-In</h1>

      <div className="card p-6">
        <div className="text-sm text-gray-500 mb-1">Appointment</div>
        <div className="font-semibold text-lg">{appointment.department}</div>
        <div className="text-gray-600 text-sm mt-1">{new Date(appointment.date).toLocaleDateString()} • {appointment.timeSlot || 'General'}</div>
        <div className={`inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-medium ${
          appointment.status === 'completed' ? 'bg-green-100 text-green-700' :
          appointment.status === 'cancelled' ? 'bg-red-100 text-red-700' :
          'bg-blue-100 text-blue-700'
        }`}>{appointment.status}</div>
      </div>

      {!checkedIn ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card p-6 text-center">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-primary-500" />
          </div>
          <h3 className="font-semibold text-lg mb-2">Ready to Check In?</h3>
          <p className="text-gray-500 text-sm mb-4">You'll be assigned a token and queue position</p>
          <button onClick={handleCheckIn} disabled={checkingIn} className="btn-primary w-full flex items-center justify-center gap-2">
            {checkingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {checkingIn ? 'Checking In...' : 'Check In Now'}
          </button>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
          <div className="card p-6 bg-gradient-to-br from-primary-500 to-primary-700 text-white text-center">
            <p className="text-primary-200 text-sm mb-1">Your Token</p>
            <div className="text-6xl font-bold">{queueInfo?.tokenNumber || appointment.tokenNumber || '—'}</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="card p-4 text-center">
              <Hash className="w-5 h-5 text-gray-400 mx-auto mb-1" />
              <div className="text-2xl font-bold text-gray-900">{queueInfo?.queuePosition || '—'}</div>
              <div className="text-xs text-gray-500">Queue Position</div>
            </div>
            <div className="card p-4 text-center">
              <Clock className="w-5 h-5 text-gray-400 mx-auto mb-1" />
              <div className="text-2xl font-bold text-gray-900">{queueInfo?.waitingTime || '—'}</div>
              <div className="text-xs text-gray-500">Est. Wait (min)</div>
            </div>
          </div>

          {queueInfo?.roomNumber && (
            <div className="card p-4 flex items-center gap-3">
              <MapPin className="w-5 h-5 text-green-500" />
              <div>
                <div className="font-semibold">Room {queueInfo.roomNumber}</div>
                <div className="text-xs text-gray-500">{appointment.department}</div>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => navigate(`/vitals-kiosk/${appointmentId}`)} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 transition">
              <Camera className="w-4 h-4" /> Vitals Kiosk
            </button>
            <button onClick={() => navigate(`/vitals/${appointmentId}`)} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition">
              Enter Vitals Manually
            </button>
          </div>

          <button onClick={() => navigate('/queue')} className="btn-primary w-full flex items-center justify-center gap-2">
            View Queue <ArrowRight className="w-4 h-4" />
          </button>

          <button onClick={() => navigate(`/navigate/${appointmentId}`)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-medium shadow-lg shadow-green-500/20 hover:shadow-green-500/30 transition">
            <Navigation className="w-4 h-4" /> Navigate to Clinic
          </button>
        </motion.div>
      )}
    </div>
  );
}
