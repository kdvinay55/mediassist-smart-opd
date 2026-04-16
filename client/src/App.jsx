import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './components/AppLayout';

// Auth pages
import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import VerifyOTP from './pages/auth/VerifyOTP';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';

// Core pages
import Dashboard from './pages/Dashboard';
import Onboarding from './pages/Onboarding';
import Appointments from './pages/Appointments';
import Consultations from './pages/Consultations';
import LabResults from './pages/LabResults';
import Medications from './pages/Medications';
import AIChat from './pages/AIChat';
import Feedback from './pages/Feedback';
import Profile from './pages/Profile';

// Module 1 - Entry
const SymptomChecker = lazy(() => import('./pages/SymptomChecker'));
const CheckIn = lazy(() => import('./pages/CheckIn'));
const OPDTraffic = lazy(() => import('./pages/OPDTraffic'));

// Module 2 - Pre OPD
const QueueScreen = lazy(() => import('./pages/QueueScreen'));
const VitalsEntry = lazy(() => import('./pages/VitalsEntry'));
const VitalsKiosk = lazy(() => import('./pages/VitalsKiosk'));

// Module 3 - OPD
const ConsultationRoom = lazy(() => import('./pages/ConsultationRoom'));
const DoctorPatients = lazy(() => import('./pages/DoctorPatients'));

// Module 4 - Post OPD
const SampleTracking = lazy(() => import('./pages/SampleTracking'));
const Notifications = lazy(() => import('./pages/Notifications'));

// Module 5 - After Hospital
const MedicationReminders = lazy(() => import('./pages/MedicationReminders'));
const FollowUpBooking = lazy(() => import('./pages/FollowUpBooking'));
const HealthTracking = lazy(() => import('./pages/HealthTracking'));
const NavigateClinic = lazy(() => import('./pages/NavigateClinic'));
const WellnessPlan = lazy(() => import('./pages/WellnessPlan'));

// Admin pages
import UserManagement from './pages/admin/UserManagement';
import AdminFeedback from './pages/admin/AdminFeedback';
const ReceptionDashboard = lazy(() => import('./pages/ReceptionDashboard'));
const LabDashboard = lazy(() => import('./pages/LabDashboard'));

const LazyFallback = () => (
  <div className="flex justify-center py-20">
    <div className="w-8 h-8 border-3 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
  </div>
);

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'patient' && !user.onboardingComplete) return <Navigate to="/onboarding" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
        <Route path="/verify" element={<VerifyOTP />} />
        <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Onboarding (auth required but no onboarding guard) */}
        <Route path="/onboarding" element={<Onboarding />} />

        {/* Protected routes */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/appointments" element={<ProtectedRoute><Appointments /></ProtectedRoute>} />
        <Route path="/consultations" element={<ProtectedRoute><Consultations /></ProtectedRoute>} />
        <Route path="/lab-results" element={<ProtectedRoute><LabResults /></ProtectedRoute>} />
        <Route path="/medications" element={<ProtectedRoute><Medications /></ProtectedRoute>} />
        <Route path="/ai-chat" element={<ProtectedRoute><AIChat /></ProtectedRoute>} />
        <Route path="/feedback" element={<ProtectedRoute><Feedback /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

        {/* Module 1 - Entry */}
        <Route path="/symptom-checker" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><SymptomChecker /></Suspense></ProtectedRoute>} />
        <Route path="/check-in/:appointmentId" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><CheckIn /></Suspense></ProtectedRoute>} />
        <Route path="/opd-traffic" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><OPDTraffic /></Suspense></ProtectedRoute>} />

        {/* Module 2 - Pre OPD */}
        <Route path="/queue" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><QueueScreen /></Suspense></ProtectedRoute>} />
        <Route path="/vitals/:appointmentId" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><VitalsEntry /></Suspense></ProtectedRoute>} />
        <Route path="/vitals-kiosk" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><VitalsKiosk /></Suspense></ProtectedRoute>} />
        <Route path="/vitals-kiosk/:appointmentId" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><VitalsKiosk /></Suspense></ProtectedRoute>} />

        {/* Module 3 - OPD */}
        <Route path="/consultation-room/:consultationId" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><ConsultationRoom /></Suspense></ProtectedRoute>} />
        <Route path="/doctor-patients" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><DoctorPatients /></Suspense></ProtectedRoute>} />
        <Route path="/navigate/:appointmentId" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><NavigateClinic /></Suspense></ProtectedRoute>} />

        {/* Module 4 - Post OPD */}
        <Route path="/sample-tracking" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><SampleTracking /></Suspense></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><Notifications /></Suspense></ProtectedRoute>} />

        {/* Module 5 - After Hospital */}
        <Route path="/medication-reminders" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><MedicationReminders /></Suspense></ProtectedRoute>} />
        <Route path="/follow-ups" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><FollowUpBooking /></Suspense></ProtectedRoute>} />
        <Route path="/health-tracking" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><HealthTracking /></Suspense></ProtectedRoute>} />
        <Route path="/wellness-plan" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><WellnessPlan /></Suspense></ProtectedRoute>} />

        {/* Admin routes */}
        <Route path="/admin/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
        <Route path="/admin/stats" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/admin/feedback" element={<ProtectedRoute><AdminFeedback /></ProtectedRoute>} />
        <Route path="/reception" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><ReceptionDashboard /></Suspense></ProtectedRoute>} />
        <Route path="/lab-dashboard" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><LabDashboard /></Suspense></ProtectedRoute>} />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
