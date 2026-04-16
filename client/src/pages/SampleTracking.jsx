import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FlaskConical, Clock, CheckCircle, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import api from '../lib/api';

const STATUS_STEPS = ['ordered', 'sample-collected', 'processing', 'completed'];
const STATUS_LABEL = { 'ordered': 'Ordered', 'sample-collected': 'Sample Collected', 'processing': 'Processing', 'completed': 'Completed' };

export default function SampleTracking() {
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get('/lab');
      setLabs(Array.isArray(data) ? data : data.labs || []);
    } catch { setLabs([]); }
    setLoading(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);

  const activeLabs = labs.filter(l => l.status !== 'completed');
  const completedLabs = labs.filter(l => l.status === 'completed');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sample Tracking</h1>
          <p className="text-gray-500 mt-1">Real-time lab sample status updates every 10s</p>
        </div>
        <button onClick={load} className="btn-secondary text-sm flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Active Samples */}
      {activeLabs.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-gray-700">In Progress ({activeLabs.length})</h2>
          {activeLabs.map((lab, i) => {
            const stepIndex = STATUS_STEPS.indexOf(lab.status);
            return (
              <motion.div key={lab._id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">{lab.testName}</h3>
                    <p className="text-xs text-gray-500">{lab.testCategory} • {lab.priority === 'urgent' ? '🔴 Urgent' : 'Routine'}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    lab.status === 'processing' ? 'bg-yellow-100 text-yellow-700 animate-pulse' :
                    lab.status === 'sample-collected' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{STATUS_LABEL[lab.status]}</span>
                </div>

                {/* Progress Steps */}
                <div className="flex items-center gap-1">
                  {STATUS_STEPS.map((step, si) => (
                    <div key={step} className="flex-1 flex items-center">
                      <div className={`w-full h-2 rounded-full transition-all duration-500 ${
                        si <= stepIndex ? 'bg-primary-500' : 'bg-gray-200'
                      }`} />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-1.5 text-[10px] text-gray-400">
                  {STATUS_STEPS.map(s => <span key={s}>{STATUS_LABEL[s]}</span>)}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Completed */}
      {completedLabs.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-gray-700">Completed ({completedLabs.length})</h2>
          {completedLabs.slice(0, 10).map(lab => (
            <div key={lab._id} className="card p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <div>
                  <div className="font-medium text-gray-900 text-sm">{lab.testName}</div>
                  <div className="text-xs text-gray-500">{lab.completedAt ? new Date(lab.completedAt).toLocaleString() : ''}</div>
                </div>
              </div>
              {lab.results?.some(r => r.flag === 'high' || r.flag === 'low') && (
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              )}
            </div>
          ))}
        </div>
      )}

      {labs.length === 0 && !loading && (
        <div className="text-center py-16 text-gray-400">
          <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No lab samples to track</p>
        </div>
      )}
    </div>
  );
}
