import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Heart, Loader2, Salad, Dumbbell, Moon, Brain, Shield,
  AlertTriangle, Pill, Activity, RefreshCw
} from 'lucide-react';
import api from '../lib/api';

const sectionIcons = {
  diet: Salad,
  exercise: Dumbbell,
  sleep: Moon,
  stress: Brain,
  screening: Shield,
  lifestyle: Activity,
  warning: AlertTriangle,
};

export default function WellnessPlan() {
  const [plan, setPlan] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generatePlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/wellness/plan');
      setPlan(data.plan);
      setSummary(data.patientSummary);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate wellness plan');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-4">
          <Heart className="w-8 h-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Personalized Wellness Plan</h1>
        <p className="text-gray-500 mt-1">AI-generated health recommendations based on your medical records</p>
      </div>

      {/* Patient Summary */}
      {summary && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Your Health Profile</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500">Age</p>
              <p className="font-bold text-gray-900">{summary.age || '—'}</p>
            </div>
            <div className="bg-pink-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500">Gender</p>
              <p className="font-bold text-gray-900 capitalize">{summary.gender || '—'}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500">BMI</p>
              <p className="font-bold text-gray-900">{summary.bmi || '—'}</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500">Active Meds</p>
              <p className="font-bold text-gray-900">{summary.activeMedications || 0}</p>
            </div>
          </div>
          {summary.diagnoses?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {summary.diagnoses.map((d, i) => (
                <span key={i} className="px-3 py-1 bg-yellow-50 text-yellow-700 rounded-full text-xs font-medium">{d}</span>
              ))}
            </div>
          )}
          {summary.chronicConditions?.length > 0 && (
            <div className="mt-2 flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="w-4 h-4" />
              Chronic: {summary.chronicConditions.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Generate Button */}
      {!plan && !loading && (
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={generatePlan}
          className="w-full card p-8 text-center hover:shadow-lg transition cursor-pointer border-2 border-dashed border-green-200 hover:border-green-400"
        >
          <Heart className="w-12 h-12 text-green-300 mx-auto mb-3" />
          <p className="text-lg font-semibold text-gray-700">Generate My Wellness Plan</p>
          <p className="text-sm text-gray-400 mt-1">AI will analyze your medical records and create personalized recommendations</p>
        </motion.button>
      )}

      {/* Loading */}
      {loading && (
        <div className="card p-12 text-center">
          <Loader2 className="w-10 h-10 animate-spin text-green-500 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Analyzing your health data...</p>
          <p className="text-sm text-gray-400 mt-1">This may take a moment as AI reviews your records</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card p-6 bg-red-50 border border-red-200">
          <p className="text-red-700">{error}</p>
          <button onClick={generatePlan} className="mt-3 text-sm text-red-600 underline">Try again</button>
        </div>
      )}

      {/* Wellness Plan Content */}
      {plan && (
        <div className="space-y-4">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Heart className="w-5 h-5 text-green-500" /> Your Personalized Plan
              </h3>
              <button onClick={generatePlan} className="text-sm text-primary-500 flex items-center gap-1 hover:text-primary-600">
                <RefreshCw className="w-3.5 h-3.5" /> Regenerate
              </button>
            </div>
            <div className="bg-green-50 rounded-xl p-5 text-sm text-green-900 whitespace-pre-wrap leading-relaxed">
              {plan}
            </div>
          </div>

          {/* Quick Reference Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                <Salad className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Diet</h4>
                <p className="text-xs text-gray-500 mt-0.5">Follow the dietary guidelines above. Stay hydrated with 8+ glasses of water daily.</p>
              </div>
            </div>
            <div className="card p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <Dumbbell className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Exercise</h4>
                <p className="text-xs text-gray-500 mt-0.5">Follow your personalized exercise plan. Start gradually and increase intensity.</p>
              </div>
            </div>
            <div className="card p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                <Moon className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Sleep</h4>
                <p className="text-xs text-gray-500 mt-0.5">Aim for 7-9 hours of quality sleep. Maintain consistent sleep schedule.</p>
              </div>
            </div>
            <div className="card p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center shrink-0">
                <Brain className="w-5 h-5 text-pink-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Mental Health</h4>
                <p className="text-xs text-gray-500 mt-0.5">Practice stress management techniques. Seek professional help if needed.</p>
              </div>
            </div>
          </div>

          <div className="card p-4 bg-yellow-50 border border-yellow-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
              <p className="text-sm text-yellow-800">
                This wellness plan is AI-generated based on your records. Always consult your doctor before making significant changes to your diet, exercise, or medication routine.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
