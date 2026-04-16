import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import { motion } from 'framer-motion';
import { formatDate, getStatusColor } from '../lib/utils';
import {
  Calendar, Stethoscope, FlaskConical, Pill, Activity,
  Clock, Users, TrendingUp, ArrowRight, Heart, Thermometer,
  Phone, Shield, Flame, AlertTriangle, Brain, Ambulance
} from 'lucide-react';

function StatCard({ icon: Icon, label, value, color, trend }) {
  return (
    <motion.div whileHover={{ y: -2 }} className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1">
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
      {trend && <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">{trend}</span>}
    </motion.div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (user?.role === 'patient') {
          const res = await api.get('/patients/dashboard');
          setData(res.data);
        } else if (user?.role === 'admin') {
          const res = await api.get('/admin/stats');
          setData(res.data);
        } else {
          const today = new Date().toISOString().split('T')[0];
          const res = await api.get(`/appointments?date=${today}`);
          setData({ todayAppointments: res.data });
        }
      } catch (err) {
        console.error('Dashboard error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-3 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Admin Dashboard
  if (user?.role === 'admin') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-500">System overview and analytics</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Total Patients" value={data?.totalPatients || 0} color="bg-blue-100 text-blue-600" />
          <StatCard icon={Stethoscope} label="Total Doctors" value={data?.totalDoctors || 0} color="bg-green-100 text-green-600" />
          <StatCard icon={Calendar} label="Today's Appointments" value={data?.todayAppointments || 0} color="bg-purple-100 text-purple-600" />
          <StatCard icon={TrendingUp} label="Completed Today" value={data?.completedToday || 0} color="bg-orange-100 text-orange-600" />
        </div>
        <div className="card">
          <p className="text-gray-500 text-center py-8">Detailed analytics coming soon</p>
        </div>
      </div>
    );
  }

  // Doctor Dashboard
  if (user?.role === 'doctor') {
    const appointments = data?.todayAppointments || [];
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Good {new Date().getHours() < 12 ? 'Morning' : 'Afternoon'}, Dr. {user.name}</h1>
          <p className="text-gray-500">You have {appointments.length} appointments today</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard icon={Calendar} label="Today's Patients" value={appointments.length} color="bg-blue-100 text-blue-600" />
          <StatCard icon={Clock} label="In Queue" value={appointments.filter(a => ['checked-in', 'in-queue', 'vitals-done'].includes(a.status)).length} color="bg-yellow-100 text-yellow-600" />
          <StatCard icon={Activity} label="Completed" value={appointments.filter(a => a.status === 'completed').length} color="bg-green-100 text-green-600" />
        </div>
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Today's Queue</h3>
            <Link to="/appointments" className="text-primary-500 text-sm font-medium flex items-center gap-1 hover:text-primary-600">
              View All <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {appointments.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No appointments today</p>
          ) : (
            <div className="space-y-3">
              {appointments.slice(0, 5).map(apt => (
                <div key={apt._id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold text-sm">
                    #{apt.tokenNumber}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{apt.patientId?.name || 'Patient'}</p>
                    <p className="text-xs text-gray-500">{apt.reasonForVisit || apt.department}</p>
                  </div>
                  <span className={`badge ${getStatusColor(apt.status)}`}>{apt.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Patient Dashboard
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.name}</h1>
        <p className="text-gray-500">Your health overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Calendar} label="Upcoming" value={data?.upcomingAppointments?.length || 0} color="bg-blue-100 text-blue-600" />
        <StatCard icon={Pill} label="Active Meds" value={data?.activeMedications?.length || 0} color="bg-green-100 text-green-600" />
        <StatCard icon={FlaskConical} label="Pending Labs" value={data?.pendingLabs?.length || 0} color="bg-purple-100 text-purple-600" />
        <StatCard icon={Stethoscope} label="Consultations" value={data?.recentConsultations?.length || 0} color="bg-orange-100 text-orange-600" />
      </div>

      {/* Latest Vitals */}
      {data?.latestVitals && (
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Latest Vitals</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-red-50 rounded-xl p-3 text-center">
              <Heart className="w-5 h-5 text-red-500 mx-auto mb-1" />
              <p className="text-sm text-gray-500">Heart Rate</p>
              <p className="text-lg font-bold text-gray-900">{data.latestVitals.heartRate || '-'} <span className="text-xs font-normal">bpm</span></p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <Activity className="w-5 h-5 text-blue-500 mx-auto mb-1" />
              <p className="text-sm text-gray-500">Blood Pressure</p>
              <p className="text-lg font-bold text-gray-900">{data.latestVitals.bloodPressure?.systolic || '-'}/{data.latestVitals.bloodPressure?.diastolic || '-'}</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-3 text-center">
              <Thermometer className="w-5 h-5 text-orange-500 mx-auto mb-1" />
              <p className="text-sm text-gray-500">Temperature</p>
              <p className="text-lg font-bold text-gray-900">{data.latestVitals.temperature || '-'} <span className="text-xs font-normal">°F</span></p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <Activity className="w-5 h-5 text-green-500 mx-auto mb-1" />
              <p className="text-sm text-gray-500">SpO2</p>
              <p className="text-lg font-bold text-gray-900">{data.latestVitals.oxygenSaturation || '-'}<span className="text-xs font-normal">%</span></p>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming Appointments */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Upcoming Appointments</h3>
          <Link to="/appointments" className="text-primary-500 text-sm font-medium flex items-center gap-1 hover:text-primary-600">
            Book New <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        {(!data?.upcomingAppointments || data.upcomingAppointments.length === 0) ? (
          <p className="text-gray-400 text-center py-6">No upcoming appointments</p>
        ) : (
          <div className="space-y-3">
            {data.upcomingAppointments.map(apt => (
              <div key={apt._id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold text-sm">
                  #{apt.tokenNumber}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{apt.department}</p>
                  <p className="text-xs text-gray-500">{formatDate(apt.date)} {apt.timeSlot && `• ${apt.timeSlot}`}</p>
                </div>
                <span className={`badge ${getStatusColor(apt.status)}`}>{apt.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Emergency Contacts */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Phone className="w-5 h-5 text-red-500" /> Emergency Contacts
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <a href="tel:112" className="flex items-center gap-3 p-3 bg-red-50 rounded-xl hover:bg-red-100 transition-colors">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <Phone className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900 text-sm">Emergency</p>
              <p className="text-red-600 font-bold">112</p>
            </div>
          </a>
          <a href="tel:108" className="flex items-center gap-3 p-3 bg-orange-50 rounded-xl hover:bg-orange-100 transition-colors">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
              <Ambulance className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900 text-sm">Ambulance</p>
              <p className="text-orange-600 font-bold">108</p>
            </div>
          </a>
          <a href="tel:100" className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900 text-sm">Police</p>
              <p className="text-blue-600 font-bold">100</p>
            </div>
          </a>
          <a href="tel:101" className="flex items-center gap-3 p-3 bg-yellow-50 rounded-xl hover:bg-yellow-100 transition-colors">
            <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
              <Flame className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900 text-sm">Fire</p>
              <p className="text-yellow-600 font-bold">101</p>
            </div>
          </a>
          <a href="tel:1800-599-0019" className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900 text-sm">Poison Control</p>
              <p className="text-purple-600 font-bold">1800-599-0019</p>
            </div>
          </a>
          <a href="tel:08046110007" className="flex items-center gap-3 p-3 bg-teal-50 rounded-xl hover:bg-teal-100 transition-colors">
            <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
              <Brain className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900 text-sm">Mental Health</p>
              <p className="text-teal-600 font-bold">08046110007</p>
            </div>
          </a>
        </div>

        {/* Personal Emergency Contact */}
        {data?.emergencyContact?.name && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Your Emergency Contact</p>
            <a href={`tel:${data.emergencyContact.phone}`} className="flex items-center gap-3 p-3 bg-green-50 rounded-xl hover:bg-green-100 transition-colors">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <Heart className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900 text-sm">{data.emergencyContact.name} ({data.emergencyContact.relation})</p>
                <p className="text-green-600 font-bold">{data.emergencyContact.phone}</p>
              </div>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
