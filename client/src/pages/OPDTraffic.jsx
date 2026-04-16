import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Users, Clock, TrendingUp, RefreshCw } from 'lucide-react';
import api from '../lib/api';

const CROWD_LEVEL = (w) => w === 0 ? { label: 'Closed', color: 'gray' } : w <= 3 ? { label: 'Low', color: 'green' } : w <= 8 ? { label: 'Moderate', color: 'yellow' } : { label: 'Busy', color: 'red' };

export default function OPDTraffic() {
  const [traffic, setTraffic] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/workflow/opd/traffic');
      setTraffic(data);
    } catch { setTraffic([]); }
    setLoading(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">OPD Traffic</h1>
          <p className="text-gray-500 mt-1">Real-time department occupancy</p>
        </div>
        <button onClick={load} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {traffic.map((dept, i) => {
          const crowd = CROWD_LEVEL(dept.waiting);
          return (
            <motion.div key={dept.department} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="card p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 text-sm">{dept.department}</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  crowd.color === 'green' ? 'bg-green-100 text-green-700' :
                  crowd.color === 'yellow' ? 'bg-yellow-100 text-yellow-700' :
                  crowd.color === 'red' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-500'
                }`}>{crowd.label}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center">
                <div>
                  <div className="flex items-center justify-center gap-1 text-gray-400 mb-0.5"><Users className="w-3.5 h-3.5" /></div>
                  <div className="text-lg font-bold text-gray-900">{dept.waiting}</div>
                  <div className="text-[10px] text-gray-500">Waiting</div>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-gray-400 mb-0.5"><Clock className="w-3.5 h-3.5" /></div>
                  <div className="text-lg font-bold text-gray-900">{dept.avgWaitTime}</div>
                  <div className="text-[10px] text-gray-500">Avg Min</div>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-gray-400 mb-0.5"><Activity className="w-3.5 h-3.5" /></div>
                  <div className="text-lg font-bold text-gray-900">{dept.total}</div>
                  <div className="text-[10px] text-gray-500">Today</div>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-gray-400 mb-0.5"><TrendingUp className="w-3.5 h-3.5" /></div>
                  <div className="text-lg font-bold text-green-600">{dept.completed}</div>
                  <div className="text-[10px] text-gray-500">Done</div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${
                  crowd.color === 'green' ? 'bg-green-400' : crowd.color === 'yellow' ? 'bg-yellow-400' : crowd.color === 'red' ? 'bg-red-400' : 'bg-gray-300'
                }`} style={{ width: `${dept.total > 0 ? (dept.completed / dept.total) * 100 : 0}%` }} />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
