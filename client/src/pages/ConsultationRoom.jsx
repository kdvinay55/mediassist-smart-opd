import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Mic, MicOff, Brain, FileText, Pill, Loader2, Send,
  Stethoscope, History, FileSignature, AlertCircle,
  Heart, Activity, Thermometer, Wind, Scale, Shield, Sparkles,
  CheckCircle, Plus, Trash2, Save, FlaskConical
} from 'lucide-react';
import api from '../lib/api';

const TRIAGE_COLORS = {
  green: { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700', label: 'Low Risk' },
  yellow: { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-700', label: 'Moderate' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700', label: 'High Risk' },
  red: { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700', badge: 'bg-red-100 text-red-700', label: 'Critical' },
};

export default function ConsultationRoom() {
  const { consultationId } = useParams();
  const navigate = useNavigate();
  const [consultation, setConsultation] = useState(null);
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('vitals');
  const [notes, setNotes] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [examination, setExamination] = useState('');
  const [finalDiagnosis, setFinalDiagnosis] = useState('');
  const [aiChat, setAiChat] = useState([]);
  const [chatMsg, setChatMsg] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [patientHistory, setPatientHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [referralForm, setReferralForm] = useState({ department: '', doctor: '', reason: '', urgency: 'routine' });
  const [referralResult, setReferralResult] = useState(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const [vitalsData, setVitalsData] = useState(null);
  const [vitalsLoading, setVitalsLoading] = useState(true);
  const [prescriptions, setPrescriptions] = useState([{ medication: '', dosage: '', frequency: '', duration: '', instructions: '' }]);
  const [treatmentPlan, setTreatmentPlan] = useState('');
  const [completing, setCompleting] = useState(false);
  const [labOrders, setLabOrders] = useState([]);
  const [selectedTests, setSelectedTests] = useState([]);
  const [labPriority, setLabPriority] = useState('normal');
  const [labNotes, setLabNotes] = useState('');
  const [labSubmitting, setLabSubmitting] = useState(false);
  const recognitionRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => { if (consultationId) loadData(); }, [consultationId]);

  const loadData = async () => {
    try {
      const { data } = await api.get(`/consultations/${consultationId}`);
      setConsultation(data);
      setChiefComplaint(data.chiefComplaint || '');
      setSymptoms(data.symptoms?.join(', ') || '');
      setExamination(data.examination || '');
      setNotes(data.notes || '');
      setFinalDiagnosis(data.finalDiagnosis?.map(d => d.condition || d).join(', ') || '');
      setTreatmentPlan(data.treatmentPlan || '');
      if (data.prescriptions?.length) setPrescriptions(data.prescriptions);
      if (data.aiChatHistory?.length) setAiChat(data.aiChatHistory);

      // Load patient info
      if (data.patientId) {
        const pid = typeof data.patientId === 'string' ? data.patientId : data.patientId._id;
        try {
          const { data: pData } = await api.get(`/patients/${pid}`);
          setPatient(pData);
        } catch { /* ignore */ }
      }

      // Load vitals for this appointment
      if (data.appointmentId) {
        const aptId = typeof data.appointmentId === 'string' ? data.appointmentId : data.appointmentId._id;
        loadVitals(aptId);

        // Check if this is a follow-up — if so, auto-load patient history
        try {
          const { data: aptData } = await api.get(`/appointments/${aptId}`);
          if (aptData.type === 'follow-up') {
            loadPatientHistory();
          }
        } catch { /* ignore */ }
      }

      // Load lab orders for this consultation AND all patient labs
      loadLabOrders(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const loadVitals = async (aptId) => {
    setVitalsLoading(true);
    try {
      const { data } = await api.get(`/appointments/${aptId}/vitals-data`);
      setVitalsData(data);
    } catch {
      setVitalsData(null);
    }
    setVitalsLoading(false);
  };

  const loadLabOrders = async (consultationData) => {
    try {
      const c = consultationData || consultation;
      const pid = typeof c.patientId === 'string' ? c.patientId : c.patientId?._id;
      // Fetch ALL labs for this patient (not just current consultation) so follow-ups show previous results
      const { data } = await api.get(`/lab?patientId=${pid}`);
      setLabOrders(data);
    } catch { /* ignore */ }
  };

  const toggleTest = (test) => {
    setSelectedTests(prev => prev.some(t => t.name === test.name)
      ? prev.filter(t => t.name !== test.name)
      : [...prev, test]
    );
  };

  const orderLabTests = async () => {
    if (selectedTests.length === 0) return;
    setLabSubmitting(true);
    try {
      const patientId = typeof consultation.patientId === 'string' ? consultation.patientId : consultation.patientId._id;
      const appointmentId = typeof consultation.appointmentId === 'string' ? consultation.appointmentId : consultation.appointmentId._id;
      await api.post('/lab/order-batch', {
        patientId,
        appointmentId,
        consultationId,
        tests: selectedTests.map(t => ({ name: t.name, category: t.category })),
        priority: labPriority,
        notes: labNotes
      });
      setSelectedTests([]);
      setLabPriority('normal');
      setLabNotes('');
      loadLabOrders();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to order lab tests');
    }
    setLabSubmitting(false);
  };

  // Voice-to-text
  const toggleRecording = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('Speech recognition not supported');
      return;
    }
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (e) => {
      let transcript = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setNotes(prev => prev + ' ' + transcript);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

  const saveNotes = async () => {
    setSaving(true);
    try {
      await api.put(`/consultations/${consultationId}`, {
        chiefComplaint, symptoms: symptoms.split(',').map(s => s.trim()).filter(Boolean),
        examination, notes
      });
    } catch { /* ignore */ }
    setSaving(false);
  };

  const loadPatientHistory = async () => {
    if (patientHistory && !historyLoading) return;
    setHistoryLoading(true);
    try {
      const { data } = await api.get(`/consultations/${consultationId}/patient-history`);
      setPatientHistory(data);
    } catch {
      setPatientHistory({ summary: 'Failed to load patient history', patientData: {} });
    }
    setHistoryLoading(false);
  };

  const addPrescription = () => {
    setPrescriptions([...prescriptions, { medication: '', dosage: '', frequency: '', duration: '', instructions: '' }]);
  };

  const removePrescription = (index) => {
    if (prescriptions.length <= 1) return;
    setPrescriptions(prescriptions.filter((_, i) => i !== index));
  };

  const updatePrescription = (index, field, value) => {
    const updated = [...prescriptions];
    updated[index] = { ...updated[index], [field]: value };
    setPrescriptions(updated);
  };

  const completeConsultation = async () => {
    setCompleting(true);
    try {
      const validPrescriptions = prescriptions.filter(p => p.medication.trim());
      await api.post(`/consultations/${consultationId}/complete`, {
        finalDiagnosis: finalDiagnosis.split(',').map(d => ({ condition: d.trim() })).filter(d => d.condition),
        treatmentPlan,
        prescriptions: validPrescriptions,
        followUpInstructions: notes
      });
      navigate('/doctor-patients');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to complete consultation');
    }
    setCompleting(false);
  };

  const sendChat = async () => {
    if (!chatMsg.trim()) return;
    const msg = chatMsg;
    setChatMsg('');
    setAiChat(prev => [...prev, { role: 'doctor', message: msg }]);
    try {
      const { data } = await api.post(`/consultations/${consultationId}/chat`, { message: msg });
      setAiChat(prev => [...prev, { role: 'ai', message: data.response || data.message }]);
    } catch {
      setAiChat(prev => [...prev, { role: 'ai', message: 'AI unavailable' }]);
    }
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const submitReferral = async () => {
    if (!referralForm.department || !referralForm.reason) return;
    setReferralLoading(true);
    try {
      const { data } = await api.post(`/consultations/${consultationId}/referral`, referralForm);
      setReferralResult(data);
      setReferralForm({ department: '', doctor: '', reason: '', urgency: 'routine' });
    } catch {
      setReferralResult({ message: 'Failed to generate referral' });
    }
    setReferralLoading(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>;

  const triage = vitalsData?.vitals ? TRIAGE_COLORS[vitalsData.vitals.triageLevel] || TRIAGE_COLORS.green : null;

  const tabs = [
    { id: 'vitals', label: 'Vitals & AI', icon: Activity },
    { id: 'notes', label: 'Notes', icon: FileText },
    { id: 'history', label: 'History', icon: History },
    { id: 'lab', label: 'Lab Orders', icon: FlaskConical },
    { id: 'prescription', label: 'Prescription', icon: Pill },
    { id: 'referral', label: 'Referral', icon: FileSignature },
    { id: 'chat', label: 'AI Chat', icon: Stethoscope },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Stethoscope className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Consultation Room</h1>
            <p className="text-gray-500">Patient: <span className="font-medium text-gray-700">{consultation?.patientId?.name || 'N/A'}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleRecording}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition text-sm ${
              isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}>
            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            {isRecording ? 'Stop' : 'Voice'}
          </button>
        </div>
      </div>

      {/* Patient Summary Bar */}
      {patient && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Age:</span>
              <span className="font-semibold">{patient.dateOfBirth ? new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear() : '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Gender:</span>
              <span className="font-semibold capitalize">{patient.gender || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Blood:</span>
              <span className="font-semibold">{patient.bloodGroup || '—'}</span>
            </div>
            {patient.allergies?.length > 0 && (
              <div className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                <span className="text-red-600 font-medium">Allergies: {patient.allergies.join(', ')}</span>
              </div>
            )}
            {patient.chronicConditions?.length > 0 && (
              <div className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-amber-600 font-medium">Chronic: {patient.chronicConditions.join(', ')}</span>
              </div>
            )}
            {triage && (
              <div className="flex items-center gap-2 ml-auto">
                <Shield className={`w-4 h-4 ${triage.text}`} />
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${triage.badge}`}>{triage.label}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); if (t.id === 'history') loadPatientHistory(); if (t.id === 'lab') loadLabOrders(); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition whitespace-nowrap px-3 ${
              tab === t.id ? 'bg-white shadow text-primary-600' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* ============ VITALS & AI TAB ============ */}
      {tab === 'vitals' && (
        <div className="space-y-4">
          {vitalsLoading ? (
            <div className="card p-8 flex items-center justify-center gap-3 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading patient vitals...
            </div>
          ) : vitalsData?.vitals ? (
            <>
              {/* Triage Alert */}
              {triage && vitalsData.vitals.triageLevel !== 'green' && (
                <div className={`p-4 rounded-xl border-2 ${triage.bg} ${triage.border}`}>
                  <div className="flex items-center gap-3">
                    <Shield className={`w-6 h-6 ${triage.text}`} />
                    <div>
                      <p className={`font-bold ${triage.text}`}>Triage: {triage.label}</p>
                      <p className={`text-sm ${triage.text} opacity-80`}>Review the flagged vitals below carefully</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Vitals Grid */}
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-500" /> Patient Vitals
                  <span className="text-xs text-gray-400 font-normal ml-auto">
                    Recorded: {new Date(vitalsData.vitals.createdAt).toLocaleString()}
                  </span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {vitalsData.vitals.bloodPressure?.systolic && (
                    <VitalCard icon={Heart} color="red" label="Blood Pressure"
                      value={`${vitalsData.vitals.bloodPressure.systolic}/${vitalsData.vitals.bloodPressure.diastolic}`} unit="mmHg" />
                  )}
                  {vitalsData.vitals.heartRate && (
                    <VitalCard icon={Activity} color="pink" label="Heart Rate"
                      value={vitalsData.vitals.heartRate} unit="bpm" />
                  )}
                  {vitalsData.vitals.temperature && (
                    <VitalCard icon={Thermometer} color="orange" label="Temperature"
                      value={vitalsData.vitals.temperature} unit="°F" />
                  )}
                  {vitalsData.vitals.oxygenSaturation && (
                    <VitalCard icon={Wind} color="blue" label="SpO2"
                      value={vitalsData.vitals.oxygenSaturation} unit="%" />
                  )}
                  {vitalsData.vitals.respiratoryRate && (
                    <VitalCard icon={Wind} color="teal" label="Resp. Rate"
                      value={vitalsData.vitals.respiratoryRate} unit="/min" />
                  )}
                  {vitalsData.vitals.weight && (
                    <VitalCard icon={Scale} color="purple" label="Weight"
                      value={vitalsData.vitals.weight} unit="kg" />
                  )}
                  {vitalsData.vitals.bmi && (
                    <VitalCard icon={Scale} color="indigo" label="BMI"
                      value={vitalsData.vitals.bmi} unit="" />
                  )}
                  {vitalsData.vitals.bloodSugar && (
                    <VitalCard icon={Activity} color="amber" label="Blood Sugar"
                      value={vitalsData.vitals.bloodSugar} unit="mg/dL" />
                  )}
                </div>
              </div>

              {/* AI Clinical Summary */}
              {vitalsData.vitals.aiTriageAssessment && (
                <div className="card p-5 border-l-4 border-purple-400">
                  <h3 className="text-sm font-semibold text-purple-800 flex items-center gap-2 mb-3">
                    <Brain className="w-4 h-4" /> AI Clinical Assessment
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {vitalsData.vitals.aiTriageAssessment}
                  </p>
                </div>
              )}

              {/* Appointment Details */}
              {vitalsData.appointment && (
                <div className="card p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Appointment Details</h3>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                    <span>Department: <strong>{vitalsData.appointment.department}</strong></span>
                    {vitalsData.appointment.reasonForVisit && (
                      <span>Reason: <strong>{vitalsData.appointment.reasonForVisit}</strong></span>
                    )}
                    {vitalsData.appointment.symptoms?.length > 0 && (
                      <span>Reported Symptoms: <strong>{vitalsData.appointment.symptoms.join(', ')}</strong></span>
                    )}
                    {vitalsData.appointment.type && (
                      <span>Visit Type: <strong className="capitalize">{vitalsData.appointment.type}</strong></span>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="card p-8 text-center">
              <Activity className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500">No vitals recorded for this appointment yet</p>
              <p className="text-gray-400 text-sm mt-1">Patient hasn't completed the kiosk vitals scan</p>
            </div>
          )}
        </div>
      )}

      {/* ============ NOTES TAB ============ */}
      {tab === 'notes' && (
        <div className="card p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chief Complaint</label>
            <input value={chiefComplaint} onChange={e => setChiefComplaint(e.target.value)} className="input-field" placeholder="Main reason for visit" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Symptoms (comma-separated)</label>
            <input value={symptoms} onChange={e => setSymptoms(e.target.value)} className="input-field" placeholder="Fever, Cough, Body pain" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Examination Findings</label>
            <textarea value={examination} onChange={e => setExamination(e.target.value)} className="input-field min-h-[80px]" placeholder="Physical examination notes..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Clinical Notes {isRecording && <span className="text-red-500 animate-pulse">(Recording...)</span>}
            </label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input-field min-h-[120px]" placeholder="Detailed consultation notes..." />
          </div>
          <button onClick={saveNotes} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Notes
          </button>
        </div>
      )}

      {/* ============ HISTORY TAB ============ */}
      {tab === 'history' && (
        <div className="card p-6 space-y-4">
          {!patientHistory && !historyLoading && (
            <button onClick={loadPatientHistory} className="btn-primary flex items-center gap-2">
              <History className="w-4 h-4" /> Load Patient History Summary
            </button>
          )}
          {historyLoading && (
            <div className="flex items-center gap-3 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading patient records...
            </div>
          )}
          {patientHistory && (
            <>
              {patientHistory.patientData && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-500">Age</p>
                    <p className="font-bold text-gray-900">{patientHistory.patientData.age || '—'}</p>
                  </div>
                  <div className="bg-pink-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-500">Gender</p>
                    <p className="font-bold text-gray-900 capitalize">{patientHistory.patientData.gender || '—'}</p>
                  </div>
                  <div className="bg-red-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-500">Blood Group</p>
                    <p className="font-bold text-gray-900">{patientHistory.patientData.bloodGroup || '—'}</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-500">Past Visits</p>
                    <p className="font-bold text-gray-900">{patientHistory.patientData.pastConsultationsCount || 0}</p>
                  </div>
                </div>
              )}
              {patientHistory.patientData?.allergies?.length > 0 && (
                <div className="bg-red-50 rounded-xl p-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-sm text-red-700 font-medium">Allergies: {patientHistory.patientData.allergies.join(', ')}</span>
                </div>
              )}
              {patientHistory.patientData?.chronicConditions?.length > 0 && (
                <div className="bg-yellow-50 rounded-xl p-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0" />
                  <span className="text-sm text-yellow-700 font-medium">Chronic: {patientHistory.patientData.chronicConditions.join(', ')}</span>
                </div>
              )}

              {/* Previous Consultations */}
              {patientHistory.patientData?.pastConsultations?.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-700 flex items-center gap-2">
                    <History className="w-4 h-4" /> Previous Consultations
                  </h4>
                  {patientHistory.patientData.pastConsultations.map((pc, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">{pc.chiefComplaint || 'No complaint recorded'}</span>
                        <span className="text-xs text-gray-500">{pc.date}</span>
                      </div>
                      {pc.finalDiagnosis?.length > 0 && (
                        <p className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1 inline-block">
                          Diagnosis: {pc.finalDiagnosis.map(d => d.condition || d).join(', ')}
                        </p>
                      )}
                      {pc.treatmentPlan && <p className="text-xs text-gray-600">Treatment: {pc.treatmentPlan}</p>}
                      {pc.prescriptions?.length > 0 && (
                        <p className="text-xs text-gray-500">Rx: {pc.prescriptions.map(rx => `${rx.medication} ${rx.dosage}`).join(', ')}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Previous Lab Results */}
              {patientHistory.patientData?.labResults?.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-700 flex items-center gap-2">
                    <FlaskConical className="w-4 h-4" /> Previous Lab Results
                  </h4>
                  {patientHistory.patientData.labResults.map((lr, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
                      <FlaskConical className="w-4 h-4 text-blue-500 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{lr.testName}</p>
                        {lr.createdAt && <p className="text-xs text-gray-500">{new Date(lr.createdAt).toLocaleDateString()}</p>}
                        {lr.status === 'completed' && lr.results && (
                          <div className="mt-1 text-xs text-green-700 bg-green-50 rounded px-2 py-1 inline-block">
                            {typeof lr.results === 'object' ? (
                              Object.entries(lr.results).slice(0, 4).map(([k, v]) => `${k}: ${typeof v === 'object' ? v.value || JSON.stringify(v) : v}`).join(' | ')
                            ) : String(lr.results).substring(0, 150)}
                          </div>
                        )}
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        lr.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>{lr.status}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Active Medications */}
              {patientHistory.patientData?.medications?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-gray-700 flex items-center gap-2">
                    <Pill className="w-4 h-4" /> Active Medications
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {patientHistory.patientData.medications.map((m, i) => (
                      <span key={i} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium">
                        {m.name} {m.dosage} ({m.frequency})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-purple-50 rounded-xl p-5">
                <h4 className="font-semibold text-purple-900 mb-2 flex items-center gap-2">
                  <Brain className="w-4 h-4" /> AI Clinical Summary
                </h4>
                <div className="text-sm text-purple-800 whitespace-pre-wrap">{patientHistory.summary}</div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============ PRESCRIPTION TAB ============ */}
      {tab === 'prescription' && (
        <div className="space-y-4">
          {/* Diagnosis */}
          <div className="card p-5">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Final Diagnosis</label>
            <input value={finalDiagnosis} onChange={e => setFinalDiagnosis(e.target.value)}
              className="input-field" placeholder="e.g., Viral Fever, Upper Respiratory Infection" />
            <p className="text-xs text-gray-400 mt-1">Comma-separated if multiple diagnoses</p>
          </div>

          {/* Treatment Plan */}
          <div className="card p-5">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Treatment Plan</label>
            <textarea value={treatmentPlan} onChange={e => setTreatmentPlan(e.target.value)}
              className="input-field min-h-[80px]" placeholder="Overall treatment plan, advice, and instructions..." />
          </div>

          {/* Medications */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Medications</h3>
              <button onClick={addPrescription} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
                <Plus className="w-4 h-4" /> Add Medicine
              </button>
            </div>
            {prescriptions.map((rx, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">Medicine #{i + 1}</span>
                  {prescriptions.length > 1 && (
                    <button onClick={() => removePrescription(i)} className="text-red-400 hover:text-red-600 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input value={rx.medication} onChange={e => updatePrescription(i, 'medication', e.target.value)}
                    className="input-field" placeholder="Medication name" />
                  <input value={rx.dosage} onChange={e => updatePrescription(i, 'dosage', e.target.value)}
                    className="input-field" placeholder="Dosage (e.g., 500mg)" />
                  <input value={rx.frequency} onChange={e => updatePrescription(i, 'frequency', e.target.value)}
                    className="input-field" placeholder="Frequency (e.g., 3 times/day)" />
                  <input value={rx.duration} onChange={e => updatePrescription(i, 'duration', e.target.value)}
                    className="input-field" placeholder="Duration (e.g., 5 days)" />
                </div>
                <input value={rx.instructions} onChange={e => updatePrescription(i, 'instructions', e.target.value)}
                  className="input-field" placeholder="Special instructions (e.g., after meals)" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ LAB ORDERS TAB ============ */}
      {tab === 'lab' && (
        <div className="space-y-4">
          {/* Order New Lab Tests */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-blue-500" /> Order Lab Tests
              {selectedTests.length > 0 && (
                <span className="ml-auto px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                  {selectedTests.length} selected
                </span>
              )}
            </h3>

            {/* Test Selection Grid */}
            {[{ label: 'Blood Tests', category: 'blood', tests: ['Complete Blood Count (CBC)', 'Blood Sugar (Fasting)', 'Blood Sugar (PP)', 'HbA1c', 'Lipid Profile', 'Liver Function Test (LFT)', 'Kidney Function Test (KFT)', 'Thyroid Profile (T3, T4, TSH)', 'Hemoglobin', 'ESR', 'CRP (C-Reactive Protein)', 'Blood Culture', 'Dengue NS1 / IgM / IgG', 'Malaria Test (Rapid/Smear)', 'Widal Test', 'Vitamin D', 'Vitamin B12', 'Iron Studies', 'Coagulation Profile (PT/INR)', 'Electrolytes (Na, K, Cl)'] },
              { label: 'Urine Tests', category: 'urine', tests: ['Urine Routine & Microscopy', 'Urine Culture & Sensitivity', '24-Hour Urine Protein', 'Urine Microalbumin'] },
              { label: 'Imaging', category: 'imaging', tests: ['Chest X-Ray', 'Abdominal Ultrasound', 'ECG', 'CT Scan', 'MRI'] },
              { label: 'Other', category: 'other', tests: ['Sputum AFB', 'Stool Routine', 'Throat Swab Culture'] }
            ].map(group => (
              <div key={group.label}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{group.label}</p>
                <div className="flex flex-wrap gap-2">
                  {group.tests.map(test => {
                    const isSelected = selectedTests.some(t => t.name === test);
                    return (
                      <button key={test} onClick={() => toggleTest({ name: test, category: group.category })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                          isSelected
                            ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                        }`}>
                        {isSelected && <span className="mr-1">✓</span>}{test}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Priority & Notes */}
            {selectedTests.length > 0 && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
                  <div className="flex gap-2">
                    {['normal', 'urgent', 'stat'].map(p => (
                      <button key={p} onClick={() => setLabPriority(p)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition ${
                          labPriority === p
                            ? p === 'stat' ? 'bg-red-500 text-white' : p === 'urgent' ? 'bg-orange-500 text-white' : 'bg-primary-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}>{p === 'stat' ? 'STAT (Emergency)' : p}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
                  <input value={labNotes} onChange={e => setLabNotes(e.target.value)}
                    className="input-field" placeholder="Clinical indication, special instructions..." />
                </div>
                <button onClick={orderLabTests} disabled={labSubmitting}
                  className="btn-primary flex items-center gap-2">
                  {labSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                  Order {selectedTests.length} Test{selectedTests.length > 1 ? 's' : ''}
                </button>
              </>
            )}
          </div>

          {/* Ordered Tests */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">All Patient Lab Tests ({labOrders.length})</h3>
            {labOrders.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">No lab tests found for this patient</p>
            ) : (
              <div className="space-y-3">
                {labOrders.map(lab => {
                  const statusStyle = {
                    ordered: 'bg-blue-100 text-blue-700',
                    'sample-collected': 'bg-yellow-100 text-yellow-700',
                    processing: 'bg-purple-100 text-purple-700',
                    completed: 'bg-green-100 text-green-700',
                    cancelled: 'bg-gray-100 text-gray-500',
                  };
                  const isFromCurrentConsultation = lab.consultationId === consultationId;
                  return (
                    <div key={lab._id} className={`flex items-center gap-3 p-3 rounded-xl ${isFromCurrentConsultation ? 'bg-gray-50' : 'bg-blue-50/50 border border-blue-100'}`}>
                      <FlaskConical className="w-5 h-5 text-blue-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm">{lab.testName}</p>
                        <p className="text-xs text-gray-500">
                          {lab.testCategory} • {new Date(lab.createdAt).toLocaleString()}
                          {!isFromCurrentConsultation && <span className="ml-1 text-blue-600 font-medium">(Previous visit)</span>}
                        </p>
                        {lab.status === 'completed' && lab.results && (
                          <div className="mt-1 text-xs text-green-700 bg-green-50 rounded px-2 py-1 inline-block">
                            {typeof lab.results === 'object' ? (
                              Object.entries(lab.results).slice(0, 3).map(([k, v]) => `${k}: ${typeof v === 'object' ? v.value || JSON.stringify(v) : v}`).join(' | ')
                            ) : String(lab.results).substring(0, 100)}
                          </div>
                        )}
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle[lab.status] || 'bg-gray-100 text-gray-600'}`}>
                        {lab.status}
                      </span>
                      {lab.priority !== 'normal' && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${lab.priority === 'stat' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                          {lab.priority === 'stat' ? 'STAT' : 'Urgent'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ REFERRAL TAB ============ */}
      {tab === 'referral' && (
        <div className="card p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Generate Specialist Referral</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
              <select value={referralForm.department} onChange={e => setReferralForm(f => ({ ...f, department: e.target.value }))} className="input-field">
                <option value="">Select department</option>
                {['General Medicine', 'Cardiology', 'Orthopedics', 'Pediatrics', 'Dermatology', 'ENT', 'Ophthalmology', 'Neurology', 'Oncology', 'Psychiatry', 'Gastroenterology', 'Pulmonology'].map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Specific Doctor (optional)</label>
              <input value={referralForm.doctor} onChange={e => setReferralForm(f => ({ ...f, doctor: e.target.value }))} className="input-field" placeholder="Dr. Name" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Referral *</label>
            <textarea value={referralForm.reason} onChange={e => setReferralForm(f => ({ ...f, reason: e.target.value }))} className="input-field min-h-[80px]" placeholder="Clinical reason for specialist referral..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Urgency</label>
            <div className="flex gap-2">
              {['routine', 'urgent', 'emergency'].map(u => (
                <button key={u} onClick={() => setReferralForm(f => ({ ...f, urgency: u }))}
                  className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition ${
                    referralForm.urgency === u
                      ? u === 'emergency' ? 'bg-red-500 text-white' : u === 'urgent' ? 'bg-orange-500 text-white' : 'bg-primary-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>{u}</button>
              ))}
            </div>
          </div>
          <button onClick={submitReferral} disabled={referralLoading || !referralForm.department || !referralForm.reason} className="btn-primary flex items-center gap-2">
            {referralLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />} Generate Referral
          </button>
          {referralResult && (
            <div className="bg-indigo-50 rounded-xl p-5 space-y-3">
              <h4 className="font-semibold text-indigo-900">{referralResult.message}</h4>
              {referralResult.referralLetter && (
                <div className="bg-white rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap border border-indigo-100">{referralResult.referralLetter}</div>
              )}
            </div>
          )}
          {consultation?.referrals?.length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <h4 className="text-sm font-medium text-gray-500 mb-3">Previous Referrals</h4>
              <div className="space-y-2">
                {consultation.referrals.map((r, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.department}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        r.urgency === 'emergency' ? 'bg-red-100 text-red-700' : r.urgency === 'urgent' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                      }`}>{r.urgency}</span>
                    </div>
                    <p className="text-gray-500 mt-0.5">{r.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============ AI CHAT TAB ============ */}
      {tab === 'chat' && (
        <div className="card p-6 space-y-4">
          <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700 flex items-start gap-2">
            <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Ask AI about this patient's condition, possible diagnoses, drug interactions, or treatment options.</span>
          </div>
          <div className="max-h-80 overflow-y-auto space-y-3">
            {aiChat.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">No messages yet. Ask the AI a question about this case.</p>
            )}
            {aiChat.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'doctor' || m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === 'doctor' || m.role === 'user' ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-800'
                }`}>{m.message || m.content}</div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="flex gap-2">
            <input value={chatMsg} onChange={e => setChatMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChat()}
              className="input-field flex-1" placeholder="Ask AI about this case..." />
            <button onClick={sendChat} className="btn-primary px-3"><Send className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* ============ PERSISTENT ACTION BAR ============ */}
      {consultation?.status !== 'completed' && (
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-gray-100 -mx-1 px-1 py-4 mt-6 flex gap-3 z-10">
          <button onClick={saveNotes} disabled={saving}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition flex items-center justify-center gap-2 text-sm">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Draft
          </button>
          <button onClick={() => { if (!finalDiagnosis.trim()) { setTab('prescription'); alert('Please fill in the Final Diagnosis in the Prescription tab before completing.'); return; } completeConsultation(); }}
            disabled={completing}
            className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition disabled:opacity-50 text-sm">
            {completing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
            Complete Consultation
          </button>
        </div>
      )}
    </div>
  );
}

function VitalCard({ icon: Icon, color, label, value, unit }) {
  const colors = {
    red: 'text-red-500 bg-red-50',
    pink: 'text-pink-500 bg-pink-50',
    orange: 'text-orange-500 bg-orange-50',
    blue: 'text-blue-500 bg-blue-50',
    teal: 'text-teal-500 bg-teal-50',
    purple: 'text-purple-500 bg-purple-50',
    indigo: 'text-indigo-500 bg-indigo-50',
    amber: 'text-amber-500 bg-amber-50',
  };
  const c = colors[color] || colors.blue;
  return (
    <div className={`rounded-xl p-3 ${c.split(' ')[1]}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-3.5 h-3.5 ${c.split(' ')[0]}`} />
        <span className="text-[11px] text-gray-500 font-medium">{label}</span>
      </div>
      <div className="text-lg font-bold text-gray-900">
        {value} <span className="text-xs text-gray-400 font-normal">{unit}</span>
      </div>
    </div>
  );
}
