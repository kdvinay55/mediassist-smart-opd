import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, Thermometer, Wind, Activity, Scale, Ruler, Loader2, Brain, AlertTriangle, Camera } from 'lucide-react';
import api from '../lib/api';

export default function VitalsEntry() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [triageResult, setTriageResult] = useState(null);
  const [form, setForm] = useState({
    systolic: '', diastolic: '', heartRate: '', temperature: '',
    oxygenSaturation: '', respiratoryRate: '', weight: '', height: '',
    bloodSugar: '', painLevel: '0'
  });

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Save vitals via appointment route
      const vitals = {
        bloodPressure: { systolic: +form.systolic, diastolic: +form.diastolic },
        heartRate: +form.heartRate,
        temperature: +form.temperature,
        oxygenSaturation: +form.oxygenSaturation,
        respiratoryRate: +form.respiratoryRate,
        weight: +form.weight,
        height: +form.height,
        bloodSugar: form.bloodSugar ? +form.bloodSugar : undefined,
        painLevel: +form.painLevel
      };

      await api.post(`/appointments/${appointmentId}/vitals`, vitals);

      // Run AI triage
      try {
        const { data } = await api.post('/ai/triage', {
          vitals: { bp: `${form.systolic}/${form.diastolic}`, hr: form.heartRate, temp: form.temperature, spo2: form.oxygenSaturation }
        });
        setTriageResult(data);
      } catch {
        setTriageResult({ level: 'Pending', assessment: 'AI triage unavailable' });
      }

      // Transition workflow
      try { await api.post(`/workflow/${appointmentId}/transition`, { newState: 'VITALS_RECORDED' }); } catch { /* might already be */ }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const fields = [
    { label: 'Systolic BP', key: 'systolic', icon: Heart, unit: 'mmHg', placeholder: '120' },
    { label: 'Diastolic BP', key: 'diastolic', icon: Heart, unit: 'mmHg', placeholder: '80' },
    { label: 'Heart Rate', key: 'heartRate', icon: Activity, unit: 'bpm', placeholder: '72' },
    { label: 'Temperature', key: 'temperature', icon: Thermometer, unit: '°F', placeholder: '98.6' },
    { label: 'SpO2', key: 'oxygenSaturation', icon: Wind, unit: '%', placeholder: '98' },
    { label: 'Respiratory Rate', key: 'respiratoryRate', icon: Wind, unit: '/min', placeholder: '16' },
    { label: 'Weight', key: 'weight', icon: Scale, unit: 'kg', placeholder: '70' },
    { label: 'Height', key: 'height', icon: Ruler, unit: 'cm', placeholder: '170' },
    { label: 'Blood Sugar', key: 'bloodSugar', icon: Activity, unit: 'mg/dL', placeholder: '100' },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Record Vitals</h1>
          <p className="text-gray-500">Enter patient vital signs for triage assessment</p>
        </div>
        <button onClick={() => navigate(`/vitals-kiosk/${appointmentId}`)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-medium shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 transition">
          <Camera className="w-4 h-4" /> Scan Kiosk
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {fields.map(f => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                <div className="relative">
                  <f.icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="number" step="any" value={form[f.key]} onChange={e => set(f.key, e.target.value)}
                    placeholder={f.placeholder} className="input-field pl-10 pr-14" required={['systolic','diastolic','heartRate','temperature','oxygenSaturation'].includes(f.key)} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{f.unit}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Pain Level */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Pain Level: {form.painLevel}/10</label>
            <input type="range" min="0" max="10" value={form.painLevel} onChange={e => set('painLevel', e.target.value)}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-500" />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>No Pain</span><span>Moderate</span><span>Severe</span>
            </div>
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          {loading ? 'Saving & Running Triage...' : 'Save Vitals & Run AI Triage'}
        </button>
      </form>

      {triageResult && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card p-6">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" /> Triage Assessment
          </h3>
          <div className={`inline-block px-3 py-1 rounded-full text-sm font-bold mb-3 ${
            triageResult.level === 'emergency' || triageResult.level === 'High' ? 'bg-red-100 text-red-700' :
            triageResult.level === 'urgent' || triageResult.level === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
            'bg-green-100 text-green-700'
          }`}>{triageResult.level || 'Normal'}</div>
          <p className="text-gray-600 text-sm whitespace-pre-wrap">{triageResult.assessment || triageResult.response || JSON.stringify(triageResult)}</p>
          <button onClick={() => navigate(-1)} className="btn-secondary mt-4">Back to Queue</button>
        </motion.div>
      )}
    </div>
  );
}
