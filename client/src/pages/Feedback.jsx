import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { motion } from 'framer-motion';
import { Star, Send, CheckCircle } from 'lucide-react';

export default function Feedback() {
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    overallRating: 0,
    waitTimeRating: 0,
    doctorRating: 0,
    facilityRating: 0,
    staffRating: 0,
    comment: '',
    wouldRecommend: null,
    categories: []
  });

  const StarRating = ({ value, onChange, label }) => (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(star => (
          <button key={star} type="button" onClick={() => onChange(star)} className="transition-transform hover:scale-110">
            <Star className={`w-7 h-7 ${star <= value ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
          </button>
        ))}
      </div>
    </div>
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.overallRating === 0) return alert('Please provide overall rating');
    try {
      await api.post('/admin/feedback', form);
      setSubmitted(true);
    } catch (err) {
      alert('Failed to submit feedback');
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center justify-center h-64">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Thank You!</h2>
          <p className="text-gray-500 mb-4">Your feedback helps us improve</p>
          <button onClick={() => navigate('/dashboard')} className="btn-primary">Back to Dashboard</button>
        </motion.div>
      </div>
    );
  }

  const categories = ['cleanliness', 'wait-time', 'staff-behavior', 'treatment', 'facilities'];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Rate Your Experience</h1>
        <p className="text-gray-500">Help us improve our services</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-6">
        <StarRating label="Overall Experience *" value={form.overallRating} onChange={v => setForm({ ...form, overallRating: v })} />
        <StarRating label="Wait Time" value={form.waitTimeRating} onChange={v => setForm({ ...form, waitTimeRating: v })} />
        <StarRating label="Doctor Interaction" value={form.doctorRating} onChange={v => setForm({ ...form, doctorRating: v })} />
        <StarRating label="Facility & Cleanliness" value={form.facilityRating} onChange={v => setForm({ ...form, facilityRating: v })} />
        <StarRating label="Staff Behavior" value={form.staffRating} onChange={v => setForm({ ...form, staffRating: v })} />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Areas of Feedback</label>
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  const has = form.categories.includes(cat);
                  setForm({ ...form, categories: has ? form.categories.filter(c => c !== cat) : [...form.categories, cat] });
                }}
                className={`px-3 py-1.5 rounded-full text-sm capitalize transition ${form.categories.includes(cat) ? 'bg-primary-100 text-primary-700 border border-primary-300' : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'}`}
              >
                {cat.replace('-', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Would you recommend us?</label>
          <div className="flex gap-3">
            {[true, false].map(val => (
              <button
                key={String(val)}
                type="button"
                onClick={() => setForm({ ...form, wouldRecommend: val })}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition ${form.wouldRecommend === val ? (val ? 'bg-green-50 border-green-300 text-green-700' : 'bg-red-50 border-red-300 text-red-700') : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                {val ? '👍 Yes' : '👎 No'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Additional Comments</label>
          <textarea
            value={form.comment}
            onChange={e => setForm({ ...form, comment: e.target.value })}
            className="input-field min-h-[100px]"
            placeholder="Tell us more about your experience..."
          />
        </div>

        <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2">
          <Send className="w-4 h-4" /> Submit Feedback
        </button>
      </form>
    </div>
  );
}
