import { useState, useEffect } from 'react';
import api from '../lib/api';
import useSocket from '../lib/useSocket';
import { motion } from 'framer-motion';
import { Pill, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Medications() {
  const { user } = useAuth();
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMeds = async () => {
    try {
      const res = await api.get('/patients/dashboard');
      setMedications(res.data.activeMedications || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMeds(); }, []);

  // Refresh meds the moment a consultation completes (new prescription) or notification fires
  useSocket({
    patientId: user?._id,
    userId: user?._id,
    events: {
      'consultation-complete': fetchMeds,
      'notification': fetchMeds
    }
  });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-3 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Medications</h1>
        <p className="text-gray-500">Your active prescriptions and medication schedule</p>
      </div>

      {medications.length === 0 ? (
        <div className="card text-center py-12">
          <Pill className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No active medications</p>
          <p className="text-gray-400 text-sm mt-1">Medications will appear here after a consultation</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {medications.map(med => (
            <motion.div key={med._id} whileHover={{ y: -2 }} className="card">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                  <Pill className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{med.name}</h3>
                  {med.genericName && <p className="text-sm text-gray-400">{med.genericName}</p>}
                </div>
                {med.isActive ? (
                  <span className="badge badge-green">Active</span>
                ) : (
                  <span className="badge badge-yellow">Completed</span>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span><strong>Dosage:</strong> {med.dosage}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <CheckCircle className="w-4 h-4 text-gray-400" />
                  <span><strong>Frequency:</strong> {med.frequency}</span>
                </div>
                {med.duration && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span><strong>Duration:</strong> {med.duration}</span>
                  </div>
                )}
                {med.instructions && (
                  <div className="mt-2 p-2 bg-yellow-50 rounded-lg text-yellow-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{med.instructions}</span>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
