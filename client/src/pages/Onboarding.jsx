import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Heart, AlertTriangle, Pill, ClipboardList,
  Phone, ChevronRight, ChevronLeft, Check, Hospital
} from 'lucide-react';

const STEPS = [
  { id: 'personal', label: 'Personal Info', icon: User },
  { id: 'emergency', label: 'Emergency Contact', icon: Phone },
  { id: 'conditions', label: 'Medical Conditions', icon: Heart },
  { id: 'history', label: 'Medical History', icon: ClipboardList },
  { id: 'medications', label: 'Medications & Allergies', icon: Pill },
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const COMMON_CONDITIONS = [
  'Diabetes', 'Hypertension', 'Asthma', 'Heart Disease', 'Thyroid Disorder',
  'Arthritis', 'COPD', 'Kidney Disease', 'Liver Disease', 'Cancer',
  'Epilepsy', 'Depression', 'Anxiety', 'Migraine'
];

const COMMON_ALLERGIES = [
  'Penicillin', 'Sulfa Drugs', 'Aspirin', 'Ibuprofen', 'Latex',
  'Peanuts', 'Shellfish', 'Dust', 'Pollen', 'Milk/Dairy'
];

export default function Onboarding() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    dateOfBirth: '',
    gender: '',
    bloodGroup: '',
    address: { street: '', city: '', state: '', pincode: '' },
    emergencyContact: { name: '', phone: '', relation: '' },
    chronicConditions: [],
    customCondition: '',
    allergies: [],
    customAllergy: '',
    currentMedications: [''],
    medicalHistory: [{ condition: '', diagnosedDate: '', status: 'active', notes: '' }],
  });

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const updateAddress = (field, value) => setForm(prev => ({ ...prev, address: { ...prev.address, [field]: value } }));
  const updateEmergency = (field, value) => setForm(prev => ({ ...prev, emergencyContact: { ...prev.emergencyContact, [field]: value } }));

  const toggleItem = (field, item) => {
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(item)
        ? prev[field].filter(i => i !== item)
        : [...prev[field], item]
    }));
  };

  const addCustomItem = (field, customField) => {
    if (form[customField].trim()) {
      setForm(prev => ({
        ...prev,
        [field]: [...prev[field], prev[customField].trim()],
        [customField]: ''
      }));
    }
  };

  const addMedication = () => setForm(prev => ({ ...prev, currentMedications: [...prev.currentMedications, ''] }));
  const updateMedication = (i, val) => {
    const meds = [...form.currentMedications];
    meds[i] = val;
    setForm(prev => ({ ...prev, currentMedications: meds }));
  };
  const removeMedication = (i) => {
    const meds = form.currentMedications.filter((_, idx) => idx !== i);
    setForm(prev => ({ ...prev, currentMedications: meds.length ? meds : [''] }));
  };

  const addHistory = () => setForm(prev => ({
    ...prev,
    medicalHistory: [...prev.medicalHistory, { condition: '', diagnosedDate: '', status: 'active', notes: '' }]
  }));
  const updateHistory = (i, field, val) => {
    const hist = [...form.medicalHistory];
    hist[i] = { ...hist[i], [field]: val };
    setForm(prev => ({ ...prev, medicalHistory: hist }));
  };
  const removeHistory = (i) => {
    const hist = form.medicalHistory.filter((_, idx) => idx !== i);
    setForm(prev => ({ ...prev, medicalHistory: hist.length ? hist : [{ condition: '', diagnosedDate: '', status: 'active', notes: '' }] }));
  };

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      const payload = {
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        bloodGroup: form.bloodGroup || undefined,
        address: (form.address.city || form.address.street) ? form.address : undefined,
        emergencyContact: form.emergencyContact.name ? form.emergencyContact : undefined,
        chronicConditions: form.chronicConditions,
        allergies: form.allergies,
        currentMedications: form.currentMedications.filter(Boolean),
        medicalHistory: form.medicalHistory.filter(h => h.condition),
      };

      const res = await api.post('/patients/onboarding', payload);
      updateUser(res.data.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/patients/onboarding', {});
      updateUser(res.data.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep(s => Math.max(s - 1, 0));

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-primary-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 pt-6">
          <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Hospital className="w-8 h-8 text-primary-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.name}!</h1>
          <p className="text-gray-500 mt-1">Let's set up your medical profile for better care</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setStep(i)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  i === step
                    ? 'bg-primary-500 text-white shadow-md'
                    : i < step
                    ? 'bg-primary-100 text-primary-600'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {i < step ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            );
          })}
        </div>

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">
            {error}
          </motion.div>
        )}

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="glass-card p-6"
          >
            {/* Step 0: Personal Info */}
            {step === 0 && (
              <div className="space-y-5">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <User className="w-5 h-5 text-primary-500" /> Personal Information
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={form.dateOfBirth}
                      onChange={e => updateForm('dateOfBirth', e.target.value)}
                      className="input-field w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                    <div className="flex gap-2">
                      {['male', 'female', 'other'].map(g => (
                        <button
                          key={g}
                          onClick={() => updateForm('gender', g)}
                          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                            form.gender === g
                              ? 'bg-primary-500 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {g.charAt(0).toUpperCase() + g.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Blood Group</label>
                  <div className="flex flex-wrap gap-2">
                    {BLOOD_GROUPS.map(bg => (
                      <button
                        key={bg}
                        onClick={() => updateForm('bloodGroup', bg)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                          form.bloodGroup === bg
                            ? 'bg-red-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {bg}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Street / Building"
                      value={form.address.street}
                      onChange={e => updateAddress('street', e.target.value)}
                      className="input-field w-full"
                    />
                    <div className="grid grid-cols-3 gap-3">
                      <input type="text" placeholder="City" value={form.address.city} onChange={e => updateAddress('city', e.target.value)} className="input-field" />
                      <input type="text" placeholder="State" value={form.address.state} onChange={e => updateAddress('state', e.target.value)} className="input-field" />
                      <input type="text" placeholder="Pincode" value={form.address.pincode} onChange={e => updateAddress('pincode', e.target.value)} className="input-field" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: Emergency Contact */}
            {step === 1 && (
              <div className="space-y-5">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Phone className="w-5 h-5 text-primary-500" /> Emergency Contact
                </h2>
                <p className="text-sm text-gray-500">Add a trusted person we can reach in an emergency.</p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Father, Mother, Spouse"
                    value={form.emergencyContact.name}
                    onChange={e => updateEmergency('name', e.target.value)}
                    className="input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={form.emergencyContact.phone}
                    onChange={e => updateEmergency('phone', e.target.value)}
                    className="input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Relation</label>
                  <div className="flex flex-wrap gap-2">
                    {['Parent', 'Spouse', 'Sibling', 'Child', 'Friend', 'Other'].map(r => (
                      <button
                        key={r}
                        onClick={() => updateEmergency('relation', r)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                          form.emergencyContact.relation === r
                            ? 'bg-primary-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Chronic Conditions */}
            {step === 2 && (
              <div className="space-y-5">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Heart className="w-5 h-5 text-primary-500" /> Chronic Conditions
                </h2>
                <p className="text-sm text-gray-500">Select any conditions you currently have or have been diagnosed with.</p>

                <div className="flex flex-wrap gap-2">
                  {COMMON_CONDITIONS.map(c => (
                    <button
                      key={c}
                      onClick={() => toggleItem('chronicConditions', c)}
                      className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                        form.chronicConditions.includes(c)
                          ? 'bg-primary-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {form.chronicConditions.includes(c) && <Check className="w-3.5 h-3.5 inline mr-1" />}
                      {c}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add other condition..."
                    value={form.customCondition}
                    onChange={e => updateForm('customCondition', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCustomItem('chronicConditions', 'customCondition')}
                    className="input-field flex-1"
                  />
                  <button onClick={() => addCustomItem('chronicConditions', 'customCondition')} className="btn-primary px-4">Add</button>
                </div>

                {form.chronicConditions.filter(c => !COMMON_CONDITIONS.includes(c)).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {form.chronicConditions.filter(c => !COMMON_CONDITIONS.includes(c)).map(c => (
                      <span key={c} className="bg-primary-100 text-primary-700 px-3 py-1 rounded-full text-sm flex items-center gap-1">
                        {c}
                        <button onClick={() => toggleItem('chronicConditions', c)} className="text-primary-400 hover:text-primary-600">&times;</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Medical History (Surgeries/Operations) */}
            {step === 3 && (
              <div className="space-y-5">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-primary-500" /> Past Surgeries & Medical History
                </h2>
                <p className="text-sm text-gray-500">List any previous surgeries, operations, or significant medical events.</p>

                <div className="space-y-4">
                  {form.medicalHistory.map((h, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-600">Entry #{i + 1}</span>
                        {form.medicalHistory.length > 1 && (
                          <button onClick={() => removeHistory(i)} className="text-red-400 hover:text-red-600 text-sm">Remove</button>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="Condition / Surgery (e.g., Appendectomy, Knee Replacement)"
                        value={h.condition}
                        onChange={e => updateHistory(i, 'condition', e.target.value)}
                        className="input-field w-full"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Date (approx.)</label>
                          <input
                            type="date"
                            value={h.diagnosedDate}
                            onChange={e => updateHistory(i, 'diagnosedDate', e.target.value)}
                            className="input-field w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Status</label>
                          <select
                            value={h.status}
                            onChange={e => updateHistory(i, 'status', e.target.value)}
                            className="input-field w-full"
                          >
                            <option value="active">Active</option>
                            <option value="resolved">Resolved</option>
                            <option value="managed">Managed</option>
                          </select>
                        </div>
                      </div>
                      <input
                        type="text"
                        placeholder="Notes (optional)"
                        value={h.notes}
                        onChange={e => updateHistory(i, 'notes', e.target.value)}
                        className="input-field w-full"
                      />
                    </div>
                  ))}
                </div>

                <button onClick={addHistory} className="text-primary-500 text-sm font-medium hover:text-primary-600">
                  + Add Another Entry
                </button>
              </div>
            )}

            {/* Step 4: Medications & Allergies */}
            {step === 4 && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-500" /> Allergies
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {COMMON_ALLERGIES.map(a => (
                      <button
                        key={a}
                        onClick={() => toggleItem('allergies', a)}
                        className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                          form.allergies.includes(a)
                            ? 'bg-orange-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {form.allergies.includes(a) && <Check className="w-3.5 h-3.5 inline mr-1" />}
                        {a}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add other allergy..."
                      value={form.customAllergy}
                      onChange={e => updateForm('customAllergy', e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addCustomItem('allergies', 'customAllergy')}
                      className="input-field flex-1"
                    />
                    <button onClick={() => addCustomItem('allergies', 'customAllergy')} className="btn-primary px-4">Add</button>
                  </div>
                </div>

                <hr className="border-gray-200" />

                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Pill className="w-5 h-5 text-green-500" /> Current Medications
                  </h2>
                  <p className="text-sm text-gray-500">List medications you are currently taking.</p>

                  <div className="space-y-2">
                    {form.currentMedications.map((med, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          type="text"
                          placeholder={`Medication ${i + 1} (e.g., Metformin 500mg)`}
                          value={med}
                          onChange={e => updateMedication(i, e.target.value)}
                          className="input-field flex-1"
                        />
                        {form.currentMedications.length > 1 && (
                          <button onClick={() => removeMedication(i)} className="text-red-400 hover:text-red-600 px-2">&times;</button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button onClick={addMedication} className="text-primary-500 text-sm font-medium hover:text-primary-600">
                    + Add Another Medication
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 mb-8">
          <div>
            {step > 0 && (
              <button onClick={prev} className="flex items-center gap-1 text-gray-600 hover:text-gray-900 font-medium text-sm">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSkip}
              disabled={loading}
              className="text-gray-400 hover:text-gray-600 text-sm font-medium"
            >
              Skip for now
            </button>
            {step < STEPS.length - 1 ? (
              <button onClick={next} className="btn-primary flex items-center gap-1">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={loading} className="btn-primary flex items-center gap-1">
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Complete Setup <Check className="w-4 h-4" /></>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
