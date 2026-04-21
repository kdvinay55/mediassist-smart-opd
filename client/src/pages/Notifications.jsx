import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, CheckCheck, Trash2, Pill, FlaskConical, Calendar, AlertTriangle, Activity } from 'lucide-react';
import api from '../lib/api';
import useSocket from '../lib/useSocket';
import { useAuth } from '../context/AuthContext';

const ICON_MAP = {
  'queue-update': Activity,
  'lab-ready': FlaskConical,
  'lab-ordered': FlaskConical,
  'medication-reminder': Pill,
  'follow-up-reminder': Calendar,
  'appointment-reminder': Calendar,
  'doctor-assigned': Activity,
  'triage-alert': AlertTriangle,
  'system': Bell
};

const COLOR_MAP = {
  'queue-update': 'bg-blue-100 text-blue-600',
  'lab-ready': 'bg-purple-100 text-purple-600',
  'lab-ordered': 'bg-orange-100 text-orange-600',
  'medication-reminder': 'bg-green-100 text-green-600',
  'follow-up-reminder': 'bg-amber-100 text-amber-600',
  'appointment-reminder': 'bg-indigo-100 text-indigo-600',
  'doctor-assigned': 'bg-teal-100 text-teal-600',
  'triage-alert': 'bg-red-100 text-red-600',
  'system': 'bg-gray-100 text-gray-600'
};

export default function Notifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get('/notifications');
      setNotifications(data.notifications || []);
      setUnread(data.unread || 0);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);

  // Realtime: prepend new notifications as they arrive
  useSocket({
    userId: user?._id,
    events: {
      notification: (payload) => {
        const n = payload?.notification;
        if (!n) return load();
        setNotifications(prev => [n, ...prev.filter(x => x._id !== n._id)]);
        if (!n.isRead) setUnread(c => c + 1);
      }
    }
  });

  const markRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
      setUnread(prev => Math.max(0, prev - 1));
    } catch { /* ignore */ }
  };

  const markAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnread(0);
    } catch { /* ignore */ }
  };

  const timeAgo = (date) => {
    const s = Math.floor((Date.now() - new Date(date)) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-gray-500 mt-1">{unread} unread notification{unread !== 1 ? 's' : ''}</p>
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} className="btn-secondary text-sm flex items-center gap-2">
            <CheckCheck className="w-4 h-4" /> Mark All Read
          </button>
        )}
      </div>

      <div className="space-y-2">
        <AnimatePresence>
          {notifications.map((n, i) => {
            const Icon = ICON_MAP[n.type] || Bell;
            const color = COLOR_MAP[n.type] || 'bg-gray-100 text-gray-600';
            return (
              <motion.div key={n._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className={`card p-4 flex items-start gap-4 cursor-pointer transition hover:shadow-md ${!n.isRead ? 'border-l-4 border-primary-500 bg-primary-50/30' : ''}`}
                onClick={() => !n.isRead && markRead(n._id)}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className={`text-sm ${n.isRead ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>{n.title}</h4>
                    <span className="text-xs text-gray-400 shrink-0 ml-2">{timeAgo(n.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5 truncate">{n.message}</p>
                </div>
                {!n.isRead && <div className="w-2.5 h-2.5 rounded-full bg-primary-500 shrink-0 mt-1.5" />}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {notifications.length === 0 && !loading && (
          <div className="text-center py-16 text-gray-400">
            <Bell className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>No notifications yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
