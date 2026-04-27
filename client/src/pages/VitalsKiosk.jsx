import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, Upload, RotateCcw, Check, AlertTriangle, Heart, Activity,
  Thermometer, Wind, Scale, Ruler, Loader2, Brain, Sparkles, X,
  ChevronRight, Shield, Edit3, Image as ImageIcon, Zap, Calendar, Clock, Stethoscope
} from 'lucide-react';
import api from '../lib/api';

const VITALS_FIELDS = [
  { key: 'bloodPressure', label: 'Blood Pressure', icon: Heart, unit: 'mmHg', color: 'red',
    render: (v) => v ? `${v.systolic}/${v.diastolic}` : null,
    inputs: [
      { subKey: 'systolic', label: 'Systolic', placeholder: '120' },
      { subKey: 'diastolic', label: 'Diastolic', placeholder: '80' },
    ]
  },
  { key: 'heartRate', label: 'Heart Rate', icon: Activity, unit: 'bpm', color: 'pink', placeholder: '72' },
  { key: 'temperature', label: 'Temperature', icon: Thermometer, unit: '°F', color: 'orange', placeholder: '98.6' },
  { key: 'oxygenSaturation', label: 'SpO2', icon: Wind, unit: '%', color: 'blue', placeholder: '98' },
  { key: 'respiratoryRate', label: 'Resp. Rate', icon: Wind, unit: '/min', color: 'teal', placeholder: '16' },
  { key: 'weight', label: 'Weight', icon: Scale, unit: 'kg', color: 'purple', placeholder: '70' },
  { key: 'height', label: 'Height', icon: Ruler, unit: 'cm', color: 'indigo', placeholder: '170' },
  { key: 'bloodSugar', label: 'Blood Sugar', icon: Activity, unit: 'mg/dL', color: 'amber', placeholder: '100' },
];

const TRIAGE_COLORS = {
  green: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700', label: 'Low Risk' },
  yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-700', label: 'Moderate' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700', label: 'High Risk' },
  red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-700', label: 'Critical' },
};

export default function VitalsKiosk() {
  const { appointmentId: paramAppointmentId } = useParams();
  const navigate = useNavigate();

  const [appointmentId, setAppointmentId] = useState(paramAppointmentId || null);
  const [appointments, setAppointments] = useState([]);
  const [pastVitals, setPastVitals] = useState([]);
  const [loadingAppointments, setLoadingAppointments] = useState(!paramAppointmentId);
  const [step, setStep] = useState(paramAppointmentId ? 'capture' : 'select'); // select | capture | review | saving | result
  const [capturedImage, setCapturedImage] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [extractedVitals, setExtractedVitals] = useState({});
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [cameraActive, setCameraActive] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => stopCamera();
  }, []);

  // Load appointments for selection mode
  useEffect(() => {
    if (!paramAppointmentId) {
      loadAppointmentsAndVitals();
    }
  }, [paramAppointmentId]);

  const loadAppointmentsAndVitals = async () => {
    setLoadingAppointments(true);
    try {
      const [aptsRes, vitalsRes] = await Promise.all([
        api.get('/appointments'),
        api.get('/vitals-kiosk/my-history')
      ]);
      // Show appointments that are checked-in or in-queue (ready for vitals)
      const eligible = (aptsRes.data || []).filter(a =>
        ['checked-in', 'in-queue'].includes(a.status)
      );
      setAppointments(eligible);
      setPastVitals(vitalsRes.data || []);
    } catch {
      try {
        const aptsRes = await api.get('/appointments');
        const eligible = (aptsRes.data || []).filter(a =>
          ['checked-in', 'in-queue'].includes(a.status)
        );
        setAppointments(eligible);
      } catch { /* ignore */ }
    }
    setLoadingAppointments(false);
  };

  const selectAppointment = (id) => {
    setAppointmentId(id);
    setStep('capture');
  };

  const startCamera = useCallback(async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch (err) {
      setError('Camera access denied. Please use the upload option instead.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImage(dataUrl);
    stopCamera();
  }, [stopCamera]);

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10MB');
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = (ev) => setCapturedImage(ev.target.result);
    reader.readAsDataURL(file);
  }, []);

  const scanImage = useCallback(async () => {
    if (!capturedImage) return;
    setScanning(true);
    setError('');

    try {
      const { data } = await api.post(`/vitals-kiosk/${appointmentId}/scan`, {
        image: capturedImage
      });

      setOcrText(data.ocrText || '');
      setExtractedVitals(data.extractedVitals || {});

      if (data.fieldsFound === 0) {
        setError('No vitals detected. Try a clearer photo or enter values manually.');
        setEditMode(true);
      }

      setStep('review');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to scan image. Please try again.');
    } finally {
      setScanning(false);
    }
  }, [capturedImage, appointmentId]);

  const updateVital = useCallback((key, value, subKey) => {
    setExtractedVitals(prev => {
      if (subKey) {
        return { ...prev, [key]: { ...(prev[key] || {}), [subKey]: value ? parseFloat(value) : undefined } };
      }
      return { ...prev, [key]: value ? parseFloat(value) : undefined };
    });
  }, []);

  const saveVitals = useCallback(async () => {
    setSaving(true);
    setError('');

    try {
      const { data } = await api.post(`/vitals-kiosk/${appointmentId}/save`, {
        vitals: extractedVitals
      });

      setResult(data);
      setStep('result');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save vitals. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [appointmentId, extractedVitals]);

  const resetAll = useCallback(() => {
    setCapturedImage(null);
    setOcrText('');
    setExtractedVitals({});
    setEditMode(false);
    setResult(null);
    setError('');
    setStep('capture');
  }, []);

  // Count filled vitals
  const filledCount = Object.keys(extractedVitals).filter(k => {
    const v = extractedVitals[k];
    if (k === 'bloodPressure') return v?.systolic && v?.diastolic;
    return v !== undefined && v !== null;
  }).length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <Camera className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vitals Kiosk</h1>
          <p className="text-sm text-gray-500">Scan the kiosk display to auto-extract your vitals</p>
        </div>
      </div>

      {/* Progress Steps */}
      {step !== 'select' && (
      <div className="flex items-center gap-2">
        {['Capture', 'Review', 'Result'].map((label, i) => {
          const stepIndex = { capture: 0, review: 1, saving: 1, result: 2 }[step];
          const isActive = i === stepIndex;
          const isDone = i < stepIndex;
          return (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition ${
                isDone ? 'bg-emerald-500 text-white' :
                isActive ? 'bg-blue-500 text-white' :
                'bg-gray-100 text-gray-400'
              }`}>
                {isDone ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-xs font-medium ${isActive ? 'text-blue-600' : isDone ? 'text-emerald-600' : 'text-gray-400'}`}>
                {label}
              </span>
              {i < 2 && <div className={`flex-1 h-0.5 rounded ${isDone ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
            </div>
          );
        })}
      </div>
      )}

      {/* Step 0: Select Appointment */}
      {step === 'select' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {loadingAppointments ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
          ) : appointments.length > 0 ? (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
                <p className="font-medium">Select an appointment to record your vitals</p>
                <p className="text-blue-500 mt-1">You can take a photo of the kiosk display or upload an image</p>
              </div>
              {appointments.map(apt => (
                <motion.button key={apt._id} whileHover={{ y: -2 }} onClick={() => selectAppointment(apt._id)}
                  className="w-full text-left card p-5 hover:shadow-md transition border-2 border-transparent hover:border-blue-200">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
                      #{apt.tokenNumber || '—'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{apt.department}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          apt.status === 'checked-in' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>{apt.status}</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                        <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{new Date(apt.date).toLocaleDateString()}</span>
                        {apt.timeSlot && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{apt.timeSlot}</span>}
                      </div>
                      {apt.doctorId && (
                        <div className="flex items-center gap-1.5 mt-2 text-sm text-green-700">
                          <Stethoscope className="w-3.5 h-3.5" />
                          <span className="font-medium">{apt.doctorId.name}</span>
                        </div>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
                  </div>
                </motion.button>
              ))}
            </div>
          ) : (
            <div className="card text-center py-16">
              <div className="w-20 h-20 mx-auto rounded-3xl bg-gray-50 flex items-center justify-center mb-4">
                <Camera className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="text-lg font-semibold text-gray-600">No Appointments Ready</h3>
              <p className="text-sm text-gray-400 mt-2 max-w-sm mx-auto">
                You need a checked-in appointment to record vitals. Book an appointment first and wait for the receptionist to check you in.
              </p>
              <button onClick={() => navigate('/appointments')} className="mt-4 btn-primary">
                Go to Appointments
              </button>
            </div>
          )}

          {/* Past Vitals History */}
          {pastVitals.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Heart className="w-5 h-5 text-red-400" /> Your Vitals History
              </h3>
              <div className="space-y-3">
                {pastVitals.slice(0, 5).map(v => {
                  const triage = TRIAGE_COLORS[v.triageLevel] || TRIAGE_COLORS.green;
                  return (
                    <div key={v._id} className={`card p-4 border-l-4 ${triage.border}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">{new Date(v.createdAt).toLocaleDateString()} {new Date(v.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${triage.badge}`}>{triage.label}</span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm">
                        {v.bloodPressure?.systolic && (
                          <span className="flex items-center gap-1 text-gray-600"><Heart className="w-3 h-3 text-red-400" /> BP: {v.bloodPressure.systolic}/{v.bloodPressure.diastolic}</span>
                        )}
                        {v.heartRate && <span className="flex items-center gap-1 text-gray-600"><Activity className="w-3 h-3 text-pink-400" /> HR: {v.heartRate} bpm</span>}
                        {v.temperature && <span className="flex items-center gap-1 text-gray-600"><Thermometer className="w-3 h-3 text-orange-400" /> {v.temperature}°F</span>}
                        {v.oxygenSaturation && <span className="text-gray-600">SpO2: {v.oxygenSaturation}%</span>}
                      </div>
                      {v.aiTriageAssessment && (
                        <div className="mt-2 p-2 bg-purple-50 rounded-lg text-xs text-purple-700 flex items-start gap-1.5">
                          <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>{v.aiTriageAssessment}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} className="p-1 hover:bg-red-100 rounded-lg transition">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step 1: Capture */}
      {step === 'capture' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {/* Camera / Image preview */}
          <div className="card overflow-hidden">
            {cameraActive ? (
              <div className="relative">
                <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-xl aspect-video object-cover bg-black" />
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-8 border-2 border-white/40 rounded-2xl" />
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm">
                    Position the kiosk display within the frame
                  </div>
                </div>
                <div className="absolute bottom-4 right-4 flex gap-2">
                  <button onClick={stopCamera} className="p-2 bg-white/90 rounded-xl hover:bg-white transition shadow">
                    <X className="w-5 h-5 text-gray-700" />
                  </button>
                  <button onClick={capturePhoto}
                    className="p-3 bg-white rounded-full shadow-lg hover:scale-105 transition ring-4 ring-blue-500/30">
                    <Camera className="w-6 h-6 text-blue-600" />
                  </button>
                </div>
              </div>
            ) : capturedImage ? (
              <div className="relative">
                <img src={capturedImage} alt="Captured vitals" className="w-full rounded-xl aspect-video object-contain bg-gray-50" />
                <button onClick={resetAll}
                  className="absolute top-3 right-3 p-2 bg-white/90 rounded-xl hover:bg-white transition shadow text-gray-700">
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="p-12 text-center space-y-6">
                <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-cyan-50 to-blue-50 flex items-center justify-center">
                  <ImageIcon className="w-10 h-10 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">Capture Kiosk Display</h3>
                  <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                    Take a photo of the vitals kiosk screen or upload an existing image
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button onClick={startCamera}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-medium shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition">
                    <Camera className="w-5 h-5" /> Open Camera
                  </button>
                  <button onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition">
                    <Upload className="w-5 h-5" /> Upload Photo
                  </button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </div>
            )}
          </div>

          {/* Hidden canvas for capture */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Scan Button */}
          {capturedImage && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={scanImage}
              disabled={scanning}
              className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition disabled:opacity-60"
            >
              {scanning ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Scanning vitals from image...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  Scan & Extract Vitals
                </>
              )}
            </motion.button>
          )}

          {/* Info card */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
            <Shield className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-700">
              <p className="font-medium">How it works</p>
              <p className="mt-1 text-blue-600">
                The AI reads the vitals displayed on the kiosk screen using OCR technology,
                extracts the values, and lets you review before saving. Your image is processed securely
                and not stored.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Step 2: Review Extracted Vitals */}
      {(step === 'review' || step === 'saving') && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {/* OCR Result Summary */}
          {ocrText && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-500" /> OCR Extracted Text
                </h3>
                <span className="text-xs text-gray-400">{filledCount} vitals found</span>
              </div>
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 font-mono leading-relaxed max-h-24 overflow-y-auto">
                {ocrText}
              </p>
            </div>
          )}

          {/* Vitals Grid */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700">Extracted Vitals</h3>
              <button
                onClick={() => setEditMode(!editMode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  editMode ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" /> {editMode ? 'Editing' : 'Edit Values'}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {VITALS_FIELDS.map(field => {
                const Icon = field.icon;
                const value = extractedVitals[field.key];
                const hasValue = field.key === 'bloodPressure'
                  ? value?.systolic && value?.diastolic
                  : value !== undefined && value !== null;

                return (
                  <div
                    key={field.key}
                    className={`p-3 rounded-xl border transition ${
                      hasValue ? 'bg-white border-gray-200' : 'bg-gray-50 border-dashed border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <Icon className={`w-3.5 h-3.5 ${hasValue ? 'text-blue-500' : 'text-gray-300'}`} />
                      <span className="text-[11px] text-gray-500 font-medium">{field.label}</span>
                    </div>

                    {editMode ? (
                      field.inputs ? (
                        <div className="flex gap-1">
                          {field.inputs.map(inp => (
                            <input
                              key={inp.subKey}
                              type="number"
                              step="any"
                              value={value?.[inp.subKey] || ''}
                              onChange={e => updateVital(field.key, e.target.value, inp.subKey)}
                              placeholder={inp.placeholder}
                              className="w-full px-2 py-1 text-sm rounded-lg border border-gray-200 focus:border-blue-400 outline-none"
                            />
                          ))}
                        </div>
                      ) : (
                        <input
                          type="number"
                          step="any"
                          value={value || ''}
                          onChange={e => updateVital(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="w-full px-2 py-1 text-sm rounded-lg border border-gray-200 focus:border-blue-400 outline-none"
                        />
                      )
                    ) : (
                      <div className="text-lg font-bold text-gray-900">
                        {hasValue ? (
                          <>
                            {field.render ? field.render(value) : value}
                            <span className="text-xs text-gray-400 font-normal ml-1">{field.unit}</span>
                          </>
                        ) : (
                          <span className="text-sm text-gray-300">--</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Preview image thumbnail */}
          {capturedImage && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
              <img src={capturedImage} alt="Scanned" className="w-16 h-12 rounded-lg object-cover" />
              <div className="flex-1">
                <p className="text-xs text-gray-600 font-medium">Kiosk photo scanned</p>
                <p className="text-[11px] text-gray-400">{filledCount} of {VITALS_FIELDS.length} vitals detected</p>
              </div>
              <button onClick={() => { resetAll(); }} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                Retake
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button onClick={resetAll} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition">
              Retake Photo
            </button>
            <button
              onClick={saveVitals}
              disabled={saving || filledCount === 0}
              className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving & Analyzing...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Save Vitals & Get AI Summary
                </>
              )}
            </button>
          </div>
        </motion.div>
      )}

      {/* Step 3: Result */}
      {step === 'result' && result && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Success Banner */}
          <div className="card p-6 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Vitals Recorded</h2>
            <p className="text-sm text-gray-500 mt-1">Your vitals have been saved and analyzed by AI</p>
          </div>

          {/* Triage Level */}
          {result.triageLevel && (
            <div className={`p-4 rounded-xl border ${TRIAGE_COLORS[result.triageLevel]?.bg} ${TRIAGE_COLORS[result.triageLevel]?.border}`}>
              <div className="flex items-center gap-3">
                <Shield className={`w-6 h-6 ${TRIAGE_COLORS[result.triageLevel]?.text}`} />
                <div>
                  <p className={`text-sm font-semibold ${TRIAGE_COLORS[result.triageLevel]?.text}`}>Triage Assessment</p>
                  <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${TRIAGE_COLORS[result.triageLevel]?.badge}`}>
                    {TRIAGE_COLORS[result.triageLevel]?.label || result.triageLevel}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* AI Summary */}
          {result.aiSummary && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-purple-500" /> AI Patient Profile Summary
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                {result.aiSummary}
              </p>
            </div>
          )}

          {/* BMI */}
          {result.bmi && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-indigo-50 border border-indigo-100">
              <Scale className="w-5 h-5 text-indigo-500" />
              <div>
                <p className="text-sm font-medium text-indigo-700">BMI: {result.bmi}</p>
                <p className="text-xs text-indigo-500">
                  {result.bmi < 18.5 ? 'Underweight' :
                   result.bmi < 25 ? 'Normal weight' :
                   result.bmi < 30 ? 'Overweight' : 'Obese'}
                </p>
              </div>
            </div>
          )}

          {/* Saved Vitals Summary Grid */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Saved Vitals</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {VITALS_FIELDS.map(field => {
                const v = extractedVitals[field.key];
                const hasValue = field.key === 'bloodPressure' ? v?.systolic && v?.diastolic : v;
                if (!hasValue) return null;
                const Icon = field.icon;
                return (
                  <div key={field.key} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                    <Icon className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">{field.label}</p>
                      <p className="text-sm font-semibold text-gray-800">
                        {field.render ? field.render(v) : v} <span className="text-xs font-normal text-gray-400">{field.unit}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex gap-3">
            <button
              onClick={() => { resetAll(); if (!paramAppointmentId) { setAppointmentId(null); setStep('select'); loadAppointmentsAndVitals(); } else { navigate(-1); } }}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition"
            >
              {paramAppointmentId ? 'Back to Queue' : 'Back to Kiosk'}
            </button>
            <button
              onClick={() => navigate('/health-tracking')}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-medium shadow-lg shadow-blue-500/20 transition"
            >
              View Health Tracking <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
