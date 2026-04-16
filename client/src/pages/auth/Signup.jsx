import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'framer-motion';
import { User, Mail, Phone, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'patient' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signup(form);
      navigate('/verify', { state: { userId: result.userId } });
    } catch (err) {
      setError(err.response?.data?.error || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-secondary-500 via-secondary-600 to-secondary-700 p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 right-20 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 left-10 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <img src="/srm-logo.png" alt="SRM BioVault" className="w-14 h-14 rounded-full shadow-lg object-cover" />
            <div>
              <h1 className="text-2xl font-bold text-white">SRM BioVault</h1>
              <p className="text-secondary-100 text-sm">Join Our Platform</p>
            </div>
          </div>
          <h2 className="text-4xl font-bold text-white mb-4 leading-tight">
            Start Your Digital<br />Health Journey
          </h2>
          <p className="text-secondary-50 text-lg max-w-md">
            Create your account to access AI-powered healthcare management, appointment scheduling, and real-time updates.
          </p>
        </div>
        <div className="relative z-10 grid grid-cols-3 gap-4 text-white/80 text-sm">
          <div className="bg-white/10 rounded-xl p-4 backdrop-blur"><span className="block font-bold text-white text-lg">Quick</span>Registration</div>
          <div className="bg-white/10 rounded-xl p-4 backdrop-blur"><span className="block font-bold text-white text-lg">Secure</span>Verification</div>
          <div className="bg-white/10 rounded-xl p-4 backdrop-blur"><span className="block font-bold text-white text-lg">Smart</span>Care</div>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <img src="/srm-logo.png" alt="SRM BioVault" className="w-10 h-10 rounded-full object-cover" />
            <h1 className="text-xl font-bold text-gray-900">SRM BioVault</h1>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">Create Account</h2>
          <p className="text-gray-500 mb-8">Register to get started</p>

          {error && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 text-sm">
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field pl-11" placeholder="John Doe" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input-field pl-11" placeholder="you@example.com" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input type="tel" required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-field pl-11" placeholder="9876543210" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required minLength={6}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="input-field pl-11 pr-11" placeholder="Min 6 characters"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
              {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Create Account <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-500 font-medium hover:text-primary-600">Sign In</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
