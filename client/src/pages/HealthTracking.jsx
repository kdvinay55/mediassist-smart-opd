import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Heart, Thermometer, Activity, Calendar, Loader2 } from 'lucide-react';
import api from '../lib/api';

export default function HealthTracking() {
  const [vitalsHistory, setVitalsHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        // Get patient dashboard which includes vitals
        const { data } = await api.get('/patients/dashboard');
        const vitals = data.vitals || data.recentVitals || [];
        setVitalsHistory(Array.isArray(vitals) ? vitals : [vitals].filter(Boolean));
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>;

  const latest = vitalsHistory[0];

  const metrics = [
    { label: 'Blood Pressure', value: latest?.bloodPressure ? `${latest.bloodPressure.systolic}/${latest.bloodPressure.diastolic}` : '—', unit: 'mmHg', icon: Heart, color: 'red', trend: vitalsHistory.map(v => v.bloodPressure?.systolic).filter(Boolean) },
    { label: 'Heart Rate', value: latest?.heartRate || '—', unit: 'bpm', icon: Activity, color: 'pink', trend: vitalsHistory.map(v => v.heartRate).filter(Boolean) },
    { label: 'Temperature', value: latest?.temperature || '—', unit: '°F', icon: Thermometer, color: 'orange', trend: vitalsHistory.map(v => v.temperature).filter(Boolean) },
    { label: 'SpO2', value: latest?.oxygenSaturation || '—', unit: '%', icon: Activity, color: 'blue', trend: vitalsHistory.map(v => v.oxygenSaturation).filter(Boolean) },
    { label: 'Weight', value: latest?.weight || '—', unit: 'kg', icon: TrendingUp, color: 'green', trend: vitalsHistory.map(v => v.weight).filter(Boolean) },
    { label: 'Blood Sugar', value: latest?.bloodSugar || '—', unit: 'mg/dL', icon: Activity, color: 'purple', trend: vitalsHistory.map(v => v.bloodSugar).filter(Boolean) },
  ];

  const colorMap = { red: 'from-red-500 to-red-600', pink: 'from-pink-500 to-pink-600', orange: 'from-orange-500 to-orange-600', blue: 'from-blue-500 to-blue-600', green: 'from-green-500 to-green-600', purple: 'from-purple-500 to-purple-600' };
  const bgMap = { red: 'bg-red-50', pink: 'bg-pink-50', orange: 'bg-orange-50', blue: 'bg-blue-50', green: 'bg-green-50', purple: 'bg-purple-50' };
  const textMap = { red: 'text-red-500', pink: 'text-pink-500', orange: 'text-orange-500', blue: 'text-blue-500', green: 'text-green-500', purple: 'text-purple-500' };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Health Tracking</h1>
        <p className="text-gray-500 mt-1">Monitor your vital signs and health trends</p>
      </div>

      {/* Current Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map((m, i) => (
          <motion.div key={m.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="card p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bgMap[m.color]}`}>
                <m.icon className={`w-5 h-5 ${textMap[m.color]}`} />
              </div>
              {m.trend.length > 1 && (
                <div className="flex items-center gap-0.5 h-8">
                  {m.trend.slice(-7).map((val, ti) => {
                    const max = Math.max(...m.trend.slice(-7));
                    const min = Math.min(...m.trend.slice(-7));
                    const range = max - min || 1;
                    const height = ((val - min) / range) * 28 + 4;
                    return <div key={ti} className={`w-1.5 rounded-full bg-gradient-to-t ${colorMap[m.color]}`} style={{ height: `${height}px` }} />;
                  })}
                </div>
              )}
            </div>
            <div className="text-2xl font-bold text-gray-900">{m.value}<span className="text-sm font-normal text-gray-400 ml-1">{m.unit}</span></div>
            <div className="text-xs text-gray-500 mt-0.5">{m.label}</div>
          </motion.div>
        ))}
      </div>

      {/* History Table */}
      {vitalsHistory.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b">
            <h3 className="font-semibold text-gray-900">Vitals History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2">BP</th>
                  <th className="px-4 py-2">HR</th>
                  <th className="px-4 py-2">Temp</th>
                  <th className="px-4 py-2">SpO2</th>
                  <th className="px-4 py-2">Weight</th>
                  <th className="px-4 py-2">BMI</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {vitalsHistory.map((v, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-600">{new Date(v.createdAt || v.recordedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5 text-center font-medium">{v.bloodPressure ? `${v.bloodPressure.systolic}/${v.bloodPressure.diastolic}` : '—'}</td>
                    <td className="px-4 py-2.5 text-center">{v.heartRate || '—'}</td>
                    <td className="px-4 py-2.5 text-center">{v.temperature || '—'}</td>
                    <td className="px-4 py-2.5 text-center">{v.oxygenSaturation || '—'}%</td>
                    <td className="px-4 py-2.5 text-center">{v.weight || '—'}</td>
                    <td className="px-4 py-2.5 text-center">{v.bmi || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {vitalsHistory.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No health data recorded yet</p>
          <p className="text-sm">Your vitals will appear here after your first visit</p>
        </div>
      )}
    </div>
  );
}
