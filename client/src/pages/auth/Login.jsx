import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'framer-motion';
import { Mail, Phone, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(form.identifier, form.password);
      if (result.token) {
        navigate('/dashboard');
      }
    } catch (err) {
      const data = err.response?.data;
      if (data?.requiresVerification) {
        navigate('/verify', { state: { userId: data.userId, displayOtp: data.displayOtp, displayOtpReason: data.displayOtpReason, displayOtp: data.displayOtp, displayOtpReason: data.displayOtpReason } });
      } else {
        setError(data?.error || err.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-500 via-primary-600 to-primary-800 p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <img src="/srm-logo.png" alt="SRM BioVault" className="w-14 h-14 rounded-full shadow-lg object-cover" />
            <div>
              <h1 className="text-2xl font-bold text-white">SRM BioVault</h1>
              <p className="text-primary-200 text-sm">Medical AI Assistant</p>
            </div>
          </div>
          <h2 className="text-4xl font-bold text-white mb-4 leading-tight">
            Intelligent Healthcare<br />at Your Fingertips
          </h2>
          <p className="text-primary-100 text-lg max-w-md">
            AI-powered OPD management with real-time queue tracking, smart diagnostics, and seamless patient care.
          </p>
        </div>
        <div className="relative z-10 flex gap-8 text-white/80 text-sm">
          <div><span className="text-3xl font-bold text-white block">AI</span>Powered</div>
          <div><span className="text-3xl font-bold text-white block">24/7</span>Support</div>
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <img src="/srm-logo.png" alt="SRM BioVault" className="w-10 h-10 rounded-full object-cover" />
            <h1 className="text-xl font-bold text-gray-900">SRM BioVault</h1>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome back</h2>
          <p className="text-gray-500 mb-8">Sign in to your account</p>

          {error && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 text-sm">
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email or Phone</label>
              <div className="relative">
                {form.identifier.includes('@') ? (
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                ) : (
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                )}
                <input
                  type="text"
                  required
                  value={form.identifier}
                  onChange={e => setForm({ ...form, identifier: e.target.value })}
                  className="input-field pl-11"
                  placeholder="you@example.com or 9876543210"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="input-field pl-11 pr-11"
                  placeholder="Enter password"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-sm text-primary-500 hover:text-primary-600 font-medium">
                Forgot Password?
              </Link>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Sign In <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Don't have an account?{' '}
            <Link to="/signup" className="text-primary-500 font-medium hover:text-primary-600">Create Account</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
