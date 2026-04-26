import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Calendar, Stethoscope, FlaskConical, Pill,
  MessageSquare, Users, Settings, LogOut, Menu, X, Bell, User,
  Activity, ClipboardList, Star, ChevronDown,
  Search, CheckCircle, MapPin, TrendingUp, TestTubes, Heart, FileText, Sparkles, Navigation, UserCheck
} from 'lucide-react';
import api from '../lib/api';
import useSocket from '../lib/useSocket';
import AssistantStatusIndicator from '../assistant/AssistantStatusIndicator';
import VoiceAssistant from '../assistant/VoiceAssistant';

const patientNav = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/appointments', label: 'Appointments', icon: Calendar },
  { path: '/vitals-kiosk', label: 'Vitals Kiosk', icon: Activity },
  { path: '/symptom-checker', label: 'Symptom Checker', icon: Search },
  { path: '/queue', label: 'Queue Status', icon: ClipboardList },
  { path: '/opd-traffic', label: 'OPD Traffic', icon: Activity },
  { path: '/consultations', label: 'Consultations', icon: Stethoscope },
  { path: '/lab-results', label: 'Lab Results', icon: FlaskConical },
  { path: '/sample-tracking', label: 'Sample Tracking', icon: TestTubes },
  { path: '/medications', label: 'Medications', icon: Pill },
  { path: '/medication-reminders', label: 'Reminders', icon: Bell },
  { path: '/follow-ups', label: 'Follow-ups', icon: Calendar },
  { path: '/health-tracking', label: 'Health Tracking', icon: Heart },
  { path: '/wellness-plan', label: 'Wellness Plan', icon: Heart },
  { path: '/feedback', label: 'Feedback', icon: Star },
  { path: '/notifications', label: 'Notifications', icon: Bell },
];

const doctorNav = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/doctor-patients', label: 'My Patients', icon: UserCheck },
  { path: '/appointments', label: 'Queue & Appointments', icon: Calendar },
  { path: '/opd-traffic', label: 'OPD Traffic', icon: Activity },
  { path: '/consultations', label: 'Consultations', icon: Stethoscope },
  { path: '/patients', label: 'Patients', icon: Users },
  { path: '/notifications', label: 'Notifications', icon: Bell },
];

const adminNav = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/reception', label: 'Reception Desk', icon: UserCheck },
  { path: '/admin/users', label: 'User Management', icon: Users },
  { path: '/appointments', label: 'Appointments', icon: Calendar },
  { path: '/opd-traffic', label: 'OPD Traffic', icon: Activity },
  { path: '/admin/stats', label: 'Analytics', icon: Activity },
  { path: '/admin/feedback', label: 'Feedback', icon: Star },
  { path: '/notifications', label: 'Notifications', icon: Bell },
];

const labNav = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/lab-dashboard', label: 'Laboratory Portal', icon: FlaskConical },
  { path: '/sample-tracking', label: 'Sample Tracking', icon: TestTubes },
  { path: '/opd-traffic', label: 'OPD Traffic', icon: Activity },
  { path: '/notifications', label: 'Notifications', icon: Bell },
];

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const navItems = user?.role === 'admin'
    ? (user?.department === 'laboratory' ? labNav : adminNav)
    : user?.role === 'doctor' ? doctorNav : patientNav;

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const { data } = await api.get('/notifications?unreadOnly=true');
        setUnreadCount(data.unread || 0);
      } catch { /* ignore */ }
    };
    fetchUnread();
    // Fallback poll every 60s in case socket misses an event
    const t = setInterval(fetchUnread, 60000);
    return () => clearInterval(t);
  }, [user?._id]);

  // Real-time notification push: increment unread when server emits 'notification'
  useSocket({
    userId: user?._id,
    events: {
      notification: () => setUnreadCount(c => c + 1)
    }
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-100 transform transition-transform duration-300 lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:flex lg:flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-gray-100">
          <img src="/srm-logo.png" alt="SRM BioVault" className="w-9 h-9 rounded-full object-cover" />
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-none">SRM BioVault</h1>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Medical Operations Platform</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          <div className="space-y-1">
            {navItems.map(item => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${active ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User Card */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center">
              <User className="w-4 h-4 text-primary-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
              <p className="text-xs text-gray-400 capitalize">{user?.role === 'admin' ? (user?.department === 'laboratory' ? 'Lab Technician' : 'Receptionist') : user?.role}</p>
              {user?.profileId && (
                <p className="mt-0.5 text-[10px] font-mono tracking-widest text-primary-600">#{user.profileId}</p>
              )}
            </div>
            <button onClick={handleLogout} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition" title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/20 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button className="lg:hidden p-2 text-gray-600 hover:bg-gray-50 rounded-lg" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {navItems.find(n => n.path === location.pathname)?.label || 'SRM BioVault'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <AssistantStatusIndicator compact />
            <Link to="/notifications" className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </Link>
            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded-lg transition"
              >
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                  <span className="text-sm font-medium text-primary-600">{user?.name?.[0]?.toUpperCase()}</span>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50"
                  >
                    <Link to="/profile" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setProfileOpen(false)}>
                      <Settings className="w-4 h-4" /> Profile Settings
                    </Link>
                    <button onClick={handleLogout} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                      <LogOut className="w-4 h-4" /> Logout
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        <VoiceAssistant />
      </div>

    </div>
  );
}
