import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Hash, Clock, Users, RefreshCw, MapPin } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';

export default function QueueScreen() {
  const { user } = useAuth();
  const [queues, setQueues] = useState({});
  const [myQueue, setMyQueue] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get('/appointments', { params: { status: 'in-queue' } });
      const appts = Array.isArray(data) ? data : data.appointments || [];

      // Group by department
      const grouped = {};
      appts.forEach(a => {
        if (!grouped[a.department]) grouped[a.department] = [];
        grouped[a.department].push(a);
      });
      Object.keys(grouped).forEach(k => grouped[k].sort((a, b) => (a.tokenNumber || 0) - (b.tokenNumber || 0)));
      setQueues(grouped);

      // Find my queue
      if (user?.role === 'patient') {
        const mine = appts.find(a => a.patientId === user.id || a.patientId?._id === user.id);
        setMyQueue(mine);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Queue Status</h1>
          <p className="text-gray-500 mt-1">Live queue positions across departments</p>
        </div>
        <button onClick={load} className="btn-secondary text-sm flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* My Queue Card */}
      {myQueue && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="card p-6 bg-gradient-to-r from-primary-500 to-primary-700 text-white">
          <p className="text-primary-200 text-sm mb-1">Your Queue</p>
          <div className="flex items-center gap-8">
            <div>
              <div className="text-5xl font-bold">{myQueue.tokenNumber || '—'}</div>
              <div className="text-sm text-primary-200 mt-1">Token</div>
            </div>
            <div className="h-12 w-px bg-white/20" />
            <div className="space-y-1">
              <div className="flex items-center gap-2"><MapPin className="w-4 h-4" />{myQueue.department}</div>
              <div className="flex items-center gap-2"><Hash className="w-4 h-4" />Position: {myQueue.queuePosition || '—'}</div>
              <div className="flex items-center gap-2"><Clock className="w-4 h-4" />~{myQueue.estimatedWaitTime || '?'} min</div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Department Queues */}
      {Object.keys(queues).length === 0 && !loading ? (
        <div className="text-center py-12 text-gray-400">No active queues right now</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Object.entries(queues).map(([dept, appts]) => (
            <div key={dept} className="card overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">{dept}</h3>
                <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Users className="w-3 h-3" />{appts.length}
                </span>
              </div>
              <div className="divide-y max-h-64 overflow-y-auto">
                {appts.map((a, i) => (
                  <div key={a._id} className={`px-5 py-3 flex items-center justify-between ${
                    a.patientId === user?.id || a.patientId?._id === user?.id ? 'bg-primary-50' : ''
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        i === 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>{a.tokenNumber}</div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{a.patientId?.name || 'Patient'}</div>
                        <div className="text-xs text-gray-500">{a.priority === 'urgent' ? '🔴 Urgent' : a.priority === 'emergency' ? '🚨 Emergency' : ''}</div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">~{a.estimatedWaitTime || '?'} min</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
