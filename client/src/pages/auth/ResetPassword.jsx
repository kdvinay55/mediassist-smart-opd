import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff, ArrowRight, ArrowLeft, ShieldCheck } from 'lucide-react';
import api from '../../lib/api';

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId, identifier } = location.state || {};

  const [form, setForm] = useState({ otp: '', newPassword: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!userId && !identifier) {
      navigate('/forgot-password', { replace: true });
    }
  }, [userId, identifier, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.newPassword !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (form.newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/auth/reset-password', {
        userId,
        otp: form.otp,
        newPassword: form.newPassword
      });
      setSuccess(data.message);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Password reset failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (!identifier) return;
    setResending(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { identifier });
      setError('');
    } catch (err) {
      setError('Failed to resend OTP');
    } finally {
      setResending(false);
    }
  };

  if (!userId && !identifier) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex items-center gap-2 mb-8 justify-center">
            <img src="/srm-logo.png" alt="SRM BioVault" className="w-10 h-10 rounded-full object-cover" />
            <h1 className="text-xl font-bold text-gray-900">SRM BioVault</h1>
          </div>

          {success ? (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Password Reset!</h2>
              <p className="text-gray-500 mb-4">{success}</p>
              <p className="text-sm text-gray-400">Redirecting to login...</p>
            </motion.div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Reset Password</h2>
              <p className="text-gray-500 mb-8">
                Enter the OTP sent to your email/phone and set a new password.
              </p>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 text-sm"
                >
                  {error}
                </motion.div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">OTP Code</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={form.otp}
                    onChange={e => setForm({ ...form, otp: e.target.value.replace(/\D/g, '') })}
                    className="input-field text-center text-2xl tracking-[0.5em] font-mono"
                    placeholder="------"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={form.newPassword}
                      onChange={e => setForm({ ...form, newPassword: e.target.value })}
                      className="input-field pl-11 pr-11"
                      placeholder="Min 6 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={form.confirmPassword}
                      onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
                      className="input-field pl-11"
                      placeholder="Re-enter password"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>Reset Password <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </form>

              <div className="flex items-center justify-between mt-6 text-sm">
                <Link to="/forgot-password" className="text-primary-500 font-medium hover:text-primary-600 inline-flex items-center gap-1">
                  <ArrowLeft className="w-4 h-4" /> Back
                </Link>
                <button
                  onClick={handleResendOTP}
                  disabled={resending}
                  className="text-primary-500 font-medium hover:text-primary-600"
                >
                  {resending ? 'Sending...' : 'Resend OTP'}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
