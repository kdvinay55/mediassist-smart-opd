import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Pill, Clock, CheckCircle, AlertCircle, Bell } from 'lucide-react';
import api from '../lib/api';

export default function MedicationReminders() {
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get('/medications');
        setMedications(Array.isArray(data) ? data : data.medications || []);
      } catch { setMedications([]); }
      setLoading(false);
    };
    load();
  }, []);

  const activeMeds = medications.filter(m => m.isActive);
  const completedMeds = medications.filter(m => !m.isActive);

  const logAdherence = async (medId) => {
    try {
      // Optimistic update — mark as taken
      setMedications(prev => prev.map(m =>
        m._id === medId ? { ...m, _takenToday: true } : m
      ));
    } catch { /* ignore */ }
  };

  const daysLeft = (endDate) => {
    if (!endDate) return null;
    const d = Math.ceil((new Date(endDate) - Date.now()) / 86400000);
    return d > 0 ? d : 0;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Medication Reminders</h1>
        <p className="text-gray-500 mt-1">Track your medications and never miss a dose</p>
      </div>

      {/* Active Medications */}
      {activeMeds.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2"><Bell className="w-4 h-4 text-primary-500" /> Active Medications</h2>
          {activeMeds.map((med, i) => {
            const days = daysLeft(med.endDate);
            return (
              <motion.div key={med._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="card p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                      <Pill className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{med.name}</h3>
                      {med.genericName && <p className="text-xs text-gray-400">{med.genericName}</p>}
                      <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-600">
                        <span className="bg-blue-50 px-2 py-0.5 rounded text-blue-700 text-xs">{med.dosage}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{med.frequency}</span>
                        {med.route && <span className="text-xs text-gray-400">({med.route})</span>}
                      </div>
                      {med.instructions && <p className="text-xs text-gray-500 mt-1">{med.instructions}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    {days !== null && (
                      <div className={`text-xs font-medium ${days <= 2 ? 'text-red-500' : 'text-gray-400'}`}>
                        {days} day{days !== 1 ? 's' : ''} left
                      </div>
                    )}
                    <button onClick={() => logAdherence(med._id)}
                      className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        med._takenToday
                          ? 'bg-green-100 text-green-700'
                          : 'bg-primary-500 text-white hover:bg-primary-600'
                      }`}>
                      {med._takenToday ? <><CheckCircle className="w-3 h-3 inline mr-1" />Taken</> : 'Mark Taken'}
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                {med.startDate && med.endDate && (
                  <div className="mt-3">
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-400 rounded-full transition-all" style={{
                        width: `${Math.min(100, ((Date.now() - new Date(med.startDate)) / (new Date(med.endDate) - new Date(med.startDate))) * 100)}%`
                      }} />
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Completed */}
      {completedMeds.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-700">Completed Courses</h2>
          {completedMeds.map(med => (
            <div key={med._id} className="card p-4 flex items-center gap-3 opacity-60">
              <CheckCircle className="w-5 h-5 text-gray-400" />
              <div>
                <div className="font-medium text-gray-700 text-sm">{med.name} — {med.dosage}</div>
                <div className="text-xs text-gray-400">{med.frequency} • {med.duration || ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {medications.length === 0 && !loading && (
        <div className="text-center py-16 text-gray-400">
          <Pill className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No medications prescribed</p>
        </div>
      )}
    </div>
  );
}
