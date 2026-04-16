import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Plus, X, ArrowRight, AlertTriangle, Stethoscope, Loader2 } from 'lucide-react';
import api from '../lib/api';

const COMMON_SYMPTOMS = [
  'Fever', 'Headache', 'Cough', 'Sore Throat', 'Body Pain', 'Fatigue',
  'Nausea', 'Vomiting', 'Diarrhea', 'Chest Pain', 'Shortness of Breath',
  'Dizziness', 'Abdominal Pain', 'Back Pain', 'Joint Pain', 'Rash',
  'Runny Nose', 'Sneezing', 'Loss of Appetite', 'Weight Loss'
];

export default function SymptomChecker() {
  const navigate = useNavigate();
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [customSymptom, setCustomSymptom] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const toggleSymptom = (s) => {
    setSelectedSymptoms(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const addCustom = () => {
    if (customSymptom.trim() && !selectedSymptoms.includes(customSymptom.trim())) {
      setSelectedSymptoms(prev => [...prev, customSymptom.trim()]);
      setCustomSymptom('');
    }
  };

  const analyze = async () => {
    if (selectedSymptoms.length === 0) return;
    setLoading(true);
    try {
      const { data } = await api.post('/ai/chat', {
        message: `I have these symptoms: ${selectedSymptoms.join(', ')}. Provide a concise, easy-to-read answer with these headings:\n\n` +
          `Possible conditions:\nRecommended department:\nUrgency level:\nImmediate self-care advice:\n\nKeep each section short, clear, and user-friendly.`
      });
      setResult(data.response || data.message);
    } catch {
      setResult('AI service is currently unavailable. Please try again later. If you need immediate care, book a General Medicine appointment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">AI Symptom Checker</h1>
        <p className="text-gray-500 mt-1">Select your symptoms for AI-powered assessment</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Symptom Selection */}
        <div className="lg:col-span-2 space-y-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card p-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-primary-500" /> Common Symptoms
            </h3>
            <div className="flex flex-wrap gap-2">
              {COMMON_SYMPTOMS.map(s => (
                <button key={s} onClick={() => toggleSymptom(s)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    selectedSymptoms.includes(s)
                      ? 'bg-primary-500 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}>
                  {s}
                </button>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <input value={customSymptom} onChange={e => setCustomSymptom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustom()}
                placeholder="Add other symptom..." className="input-field flex-1" />
              <button onClick={addCustom} className="btn-primary px-3"><Plus className="w-4 h-4" /></button>
            </div>
          </motion.div>

          {/* AI Result */}
          <AnimatePresence>
            {result && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card p-6">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-500" /> AI Assessment
                </h3>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800 flex gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>This is an AI-assisted assessment. Always consult a qualified doctor for diagnosis.</span>
                </div>
                <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">{result}</div>
                <button onClick={() => navigate('/appointments')} className="btn-primary mt-4 flex items-center gap-2">
                  Book Appointment <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Selected Summary */}
        <div className="space-y-4">
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Selected Symptoms ({selectedSymptoms.length})</h3>
            {selectedSymptoms.length === 0 ? (
              <p className="text-gray-400 text-sm">No symptoms selected</p>
            ) : (
              <div className="space-y-2">
                {selectedSymptoms.map(s => (
                  <div key={s} className="flex items-center justify-between bg-primary-50 rounded-lg px-3 py-2">
                    <span className="text-sm font-medium text-primary-700">{s}</span>
                    <button onClick={() => toggleSymptom(s)} className="text-primary-400 hover:text-red-500">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={analyze} disabled={loading || selectedSymptoms.length === 0}
              className="btn-primary w-full mt-4 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
              {loading ? 'Analyzing...' : 'Analyze Symptoms'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
