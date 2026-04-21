import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FlaskConical, Search, RefreshCw, Loader2, User, Clock,
  CheckCircle, AlertTriangle, ChevronDown, Beaker, FileText,
  Sparkles, TestTubes, Droplets, Microscope, ArrowRight, Hash, UserCheck,
  Wifi, WifiOff, Stethoscope, Pill, ClipboardList
} from 'lucide-react';
import { io as socketIo } from 'socket.io-client';
import api from '../lib/api';

const statusConfig = {
  'ordered': { label: 'Pending', color: 'bg-amber-100 text-amber-800 border border-amber-200', icon: TestTubes, bg: 'from-amber-500 to-orange-500' },
  'sample-collected': { label: 'Collected', color: 'bg-cyan-100 text-cyan-800 border border-cyan-200', icon: Droplets, bg: 'from-cyan-500 to-blue-500' },
  'processing': { label: 'Processing', color: 'bg-violet-100 text-violet-800 border border-violet-200', icon: Microscope, bg: 'from-violet-500 to-purple-500' },
  'completed': { label: 'Completed', color: 'bg-emerald-100 text-emerald-800 border border-emerald-200', icon: CheckCircle, bg: 'from-emerald-500 to-green-500' },
};

const priorityColors = {
  'normal': 'bg-slate-100 text-slate-600 border border-slate-200',
  'urgent': 'bg-rose-100 text-rose-700 border border-rose-200',
  'stat': 'bg-red-600 text-white',
};

export default function LabDashboard() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('waiting');
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState(null);
  const [resultForm, setResultForm] = useState({});
  const [showResultModal, setShowResultModal] = useState(null);
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [interpreting, setInterpreting] = useState(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const debounceRef = useRef(null);

  // Real-time: keep a long-lived socket connection in the lab room and refresh
  // the queue (debounced) whenever ANY lab event fires.
  useEffect(() => {
    loadQueue();
    const apiBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '');
    const socket = socketIo(apiBase || undefined, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: false,
      reconnection: true
    });
    socket.on('connect', () => {
      setLiveConnected(true);
      socket.emit('join-room', 'lab');
    });
    socket.on('disconnect', () => setLiveConnected(false));
    const refresh = (payload) => {
      setLastUpdate(new Date());
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(loadQueue, 250);
    };
    socket.on('lab-queue-update', refresh);
    socket.on('new-order', refresh);
    socket.on('patient-accepted', refresh);
    // Lightweight safety net: refresh every 30s in case sockets drop.
    const fallback = setInterval(loadQueue, 30000);
    return () => {
      clearInterval(fallback);
      clearTimeout(debounceRef.current);
      socket.disconnect();
    };
  }, []);

  const loadQueue = async () => {
    try {
      const { data } = await api.get('/lab/queue');
      setQueue(data);
    } catch (err) {
      console.error('Failed to load lab queue:', err);
    }
    setLoading(false);
  };

  const acceptPatient = async (orderGroup) => {
    setUpdating(orderGroup);
    try {
      await api.put('/lab/accept-patient', { orderGroup });
      await loadQueue();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to accept patient');
    }
    setUpdating(null);
  };

  const collectSamples = async (orderGroup) => {
    setUpdating(orderGroup);
    try {
      await api.put('/lab/collect-samples', { orderGroup });
      await loadQueue();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to collect samples');
    }
    setUpdating(null);
  };

  const updateTestStatus = async (labId, status) => {
    setUpdating(labId);
    try {
      await api.put(`/lab/${labId}/status`, { status });
      await loadQueue();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update');
    }
    setUpdating(null);
  };

  const submitResults = async (labId) => {
    const form = resultForm[labId];
    if (!form || form.length === 0) return alert('Please add at least one result parameter');
    setUpdating(labId);
    try {
      await api.put(`/lab/${labId}/results`, { results: form });
      setShowResultModal(null);
      setResultForm(prev => ({ ...prev, [labId]: undefined }));
      await loadQueue();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit results');
    }
    setUpdating(null);
  };

  const addResultRow = (labId) => {
    const current = resultForm[labId] || [];
    setResultForm(prev => ({
      ...prev,
      [labId]: [...current, { parameter: '', value: '', unit: '', referenceRange: '', flag: 'normal' }]
    }));
  };

  const updateResultRow = (labId, index, field, value) => {
    const current = [...(resultForm[labId] || [])];
    current[index] = { ...current[index], [field]: value };
    setResultForm(prev => ({ ...prev, [labId]: current }));
  };

  const removeResultRow = (labId, index) => {
    const current = [...(resultForm[labId] || [])];
    current.splice(index, 1);
    setResultForm(prev => ({ ...prev, [labId]: current }));
  };

  const runAIInterpretation = async (labId) => {
    setInterpreting(labId);
    try {
      await api.post(`/lab/${labId}/ai-interpret`);
      await loadQueue();
    } catch (err) {
      alert(err.response?.data?.error || 'AI interpretation failed');
    }
    setInterpreting(null);
  };

  // Categorize groups
  const waiting = queue.filter(g => !g.labAccepted && g.tests.some(t => t.status === 'ordered'));
  const inProgress = queue.filter(g => g.labAccepted && !g.allCompleted);
  const completed = queue.filter(g => g.allCompleted);

  const filteredGroups = filter === 'waiting' ? waiting : filter === 'in-progress' ? inProgress : filter === 'completed' ? completed : queue;

  const searchFiltered = filteredGroups.filter(g => {
    if (!search) return true;
    const q = search.toLowerCase();
    return g.patient?.name?.toLowerCase().includes(q) || g.doctor?.name?.toLowerCase().includes(q) || g.tests.some(t => t.testName.toLowerCase().includes(q));
  });

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-teal-600 via-emerald-600 to-cyan-600 p-6 text-white shadow-lg shadow-teal-500/20">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
              <Microscope className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Laboratory Portal</h1>
              <p className="text-teal-100 text-sm mt-0.5">Accept patients &bull; Collect samples &bull; Process &bull; Enter results</p>
            </div>
          </div>
          <button onClick={loadQueue} className="flex items-center gap-2 text-sm px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl backdrop-blur transition font-medium">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
        {/* Live connection indicator */}
        <div className="mt-3 flex items-center gap-3 text-xs text-teal-50/90">
          {liveConnected ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-300/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
              <Wifi className="w-3 h-3" /> Live tracking active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/20 border border-amber-300/30">
              <WifiOff className="w-3 h-3" /> Reconnecting…
            </span>
          )}
          {lastUpdate && (
            <span className="opacity-80">Last update: {lastUpdate.toLocaleTimeString()}</span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { key: 'waiting', label: 'Waiting Patients', count: waiting.length, bg: 'from-amber-500 to-orange-500', Icon: TestTubes },
          { key: 'in-progress', label: 'In Progress', count: inProgress.length, bg: 'from-cyan-500 to-blue-500', Icon: Droplets },
          { key: 'completed', label: 'Completed', count: completed.length, bg: 'from-emerald-500 to-green-500', Icon: CheckCircle },
        ].map(({ key, label, count, bg, Icon }) => (
          <motion.div key={key} whileHover={{ y: -3, scale: 1.02 }} onClick={() => setFilter(key)}
            className={`relative overflow-hidden rounded-2xl p-4 cursor-pointer shadow-md transition ${filter === key ? 'ring-2 ring-offset-2 ring-teal-400' : ''}`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${bg} opacity-10`} />
            <div className="relative flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${bg} flex items-center justify-center shadow-sm`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{count}</p>
                <p className="text-xs text-gray-500 font-medium">{label}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-10" placeholder="Search by patient, test name, or doctor..." />
        </div>
        <div className="flex gap-1 bg-teal-50 rounded-xl p-1 border border-teal-100">
          {['all', 'waiting', 'in-progress', 'completed'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition capitalize ${filter === f ? 'bg-white shadow text-teal-700 border border-teal-200' : 'text-teal-600/60 hover:text-teal-700'}`}>
              {f === 'all' ? `All (${queue.length})` : f === 'waiting' ? `Waiting (${waiting.length})` : f === 'in-progress' ? `In Progress (${inProgress.length})` : `Completed (${completed.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Patient Groups */}
      <div className="space-y-4">
        {searchFiltered.length === 0 ? (
          <div className="card text-center py-16 border-2 border-dashed border-gray-200">
            <Microscope className="w-16 h-16 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-lg font-medium">No patients in this category</p>
          </div>
        ) : (
          searchFiltered.map(group => {
            const isExpanded = expandedGroup === group.orderGroup;
            const hasTestsNeedingSamples = group.labAccepted && group.tests.some(t => t.status === 'ordered');

            return (
              <motion.div key={group.orderGroup} layout
                className={`card overflow-hidden border-l-4 ${
                  group.allCompleted ? 'border-l-emerald-400' :
                  group.labAccepted ? 'border-l-cyan-400' : 'border-l-amber-400'
                }`}>
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Patient avatar */}
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-gradient-to-br ${
                      group.allCompleted ? 'from-emerald-500 to-green-500' :
                      group.labAccepted ? 'from-cyan-500 to-blue-500' : 'from-amber-500 to-orange-500'
                    } shadow-sm`}>
                      <User className="w-6 h-6 text-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Patient Info */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-gray-900 text-base">{group.patient?.name || 'Unknown Patient'}</h3>
                        {group.labTokenNumber && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold border border-blue-200">
                            <Hash className="w-3 h-3" /> Token {group.labTokenNumber}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${priorityColors[group.priority]}`}>
                          {group.priority}
                        </span>
                        {group.labAccepted && !group.allCompleted && (
                          <span className="px-2 py-0.5 bg-cyan-50 text-cyan-700 rounded-lg text-[11px] font-semibold border border-cyan-200">
                            <UserCheck className="w-3 h-3 inline mr-0.5" /> Accepted
                          </span>
                        )}
                        {group.allCompleted && (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-lg text-[11px] font-semibold border border-emerald-200">
                            ✅ All Done
                          </span>
                        )}
                      </div>

                      {/* Doctor & Time */}
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                          <FileText className="w-3 h-3 text-gray-400" /> Ordered by {group.doctor?.name || 'Unknown'}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                          <Clock className="w-3 h-3 text-gray-400" /> {new Date(group.createdAt).toLocaleString()}
                        </span>
                      </div>

                      {/* Test chips */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {group.tests.map(test => (
                          <span key={test._id} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                            test.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            test.status === 'processing' ? 'bg-violet-50 text-violet-700 border-violet-200' :
                            test.status === 'sample-collected' ? 'bg-cyan-50 text-cyan-700 border-cyan-200' :
                            'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {test.status === 'completed' ? <CheckCircle className="w-3 h-3" /> :
                             test.status === 'processing' ? <Microscope className="w-3 h-3" /> :
                             test.status === 'sample-collected' ? <Droplets className="w-3 h-3" /> :
                             <TestTubes className="w-3 h-3" />}
                            {test.testName}
                            <span className="text-[10px] opacity-60 capitalize ml-0.5">({test.testCategory})</span>
                          </span>
                        ))}
                      </div>

                      {/* Clinical Context — symptoms, diagnosis, prescriptions so the lab tech understands WHY */}
                      {(group.clinicalContext || group.activeMedications?.length > 0 || group.orderingNotes) && (
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                          {(group.clinicalContext?.chiefComplaint || group.clinicalContext?.symptoms?.length > 0) && (
                            <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2">
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 mb-1">
                                <Stethoscope className="w-3 h-3" /> Symptoms / Reason
                              </div>
                              {group.clinicalContext?.chiefComplaint && (
                                <p className="text-xs text-gray-800 leading-snug">{group.clinicalContext.chiefComplaint}</p>
                              )}
                              {group.clinicalContext?.symptoms?.length > 0 && (
                                <p className="text-[11px] text-gray-600 mt-0.5">{group.clinicalContext.symptoms.join(', ')}</p>
                              )}
                              {group.clinicalContext?.symptomDuration && (
                                <p className="text-[11px] text-gray-500 mt-0.5">Duration: {group.clinicalContext.symptomDuration}</p>
                              )}
                            </div>
                          )}
                          {group.clinicalContext?.diagnosis?.length > 0 && (
                            <div className="rounded-lg border border-rose-100 bg-rose-50/40 px-3 py-2">
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 mb-1">
                                <ClipboardList className="w-3 h-3" /> Working Diagnosis
                              </div>
                              <p className="text-xs text-gray-800 leading-snug">{group.clinicalContext.diagnosis.join('; ')}</p>
                            </div>
                          )}
                          {group.orderingNotes && (
                            <div className="rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2 md:col-span-2">
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 mb-1">
                                <FileText className="w-3 h-3" /> Doctor&apos;s Note for Lab
                              </div>
                              <p className="text-xs text-gray-800 leading-snug whitespace-pre-line">{group.orderingNotes}</p>
                            </div>
                          )}
                          {group.activeMedications?.length > 0 && (
                            <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2 md:col-span-2">
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 mb-1">
                                <Pill className="w-3 h-3" /> Patient&apos;s Current Medications ({group.activeMedications.length})
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {group.activeMedications.map((m, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-emerald-200 text-[11px] text-gray-800">
                                    <span className="font-semibold">{m.name}</span>
                                    <span className="text-gray-500">{m.dosage}</span>
                                    <span className="text-gray-400">· {m.frequency}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {group.clinicalContext?.prescriptionsFromVisit?.length > 0 && (
                            <div className="rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-2 md:col-span-2">
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-700 mb-1">
                                <Pill className="w-3 h-3" /> Prescriptions from this Visit
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {group.clinicalContext.prescriptionsFromVisit.map((p, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-violet-200 text-[11px] text-gray-800">
                                    <span className="font-semibold">{p.medication}</span>
                                    <span className="text-gray-500">{p.dosage}</span>
                                    <span className="text-gray-400">· {p.frequency} · {p.duration}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Expand for details */}
                      {(group.labAccepted || group.allCompleted) && (
                        <button onClick={() => setExpandedGroup(isExpanded ? null : group.orderGroup)}
                          className="mt-2 flex items-center gap-1 text-xs text-teal-600 font-medium hover:text-teal-700 transition">
                          <ChevronDown className={`w-3 h-3 transition ${isExpanded ? 'rotate-180' : ''}`} />
                          {isExpanded ? 'Collapse' : 'View'} Test Details
                        </button>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="shrink-0 flex flex-col gap-2">
                      {!group.labAccepted && !group.allCompleted && (
                        <button onClick={() => acceptPatient(group.orderGroup)}
                          disabled={updating === group.orderGroup}
                          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold hover:from-amber-600 hover:to-orange-600 transition disabled:opacity-50 shadow-md shadow-amber-500/20">
                          {updating === group.orderGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                          Accept Patient
                        </button>
                      )}
                      {hasTestsNeedingSamples && (
                        <button onClick={() => collectSamples(group.orderGroup)}
                          disabled={updating === group.orderGroup}
                          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold hover:from-cyan-600 hover:to-blue-600 transition disabled:opacity-50 shadow-md shadow-cyan-500/20">
                          {updating === group.orderGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Droplets className="w-4 h-4" />}
                          Collect All Samples
                        </button>
                      )}
                      {group.allCompleted && (
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                          <CheckCircle className="w-3.5 h-3.5" /> Completed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded Test Details */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        className="mt-4 space-y-3 overflow-hidden">
                        {group.tests.map(test => (
                          <div key={test._id} className={`p-4 rounded-xl border ${
                            test.status === 'completed' ? 'bg-emerald-50/50 border-emerald-200' :
                            test.status === 'processing' ? 'bg-violet-50/50 border-violet-200' :
                            test.status === 'sample-collected' ? 'bg-cyan-50/50 border-cyan-200' :
                            'bg-amber-50/50 border-amber-200'
                          }`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Beaker className="w-4 h-4 text-gray-500" />
                                <span className="font-semibold text-gray-900 text-sm">{test.testName}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusConfig[test.status]?.color}`}>
                                  {statusConfig[test.status]?.label}
                                </span>
                                <span className="text-[11px] text-gray-400 capitalize">{test.testCategory}</span>
                              </div>

                              <div className="flex items-center gap-2">
                                {test.status === 'sample-collected' && (
                                  <button onClick={() => updateTestStatus(test._id, 'processing')}
                                    disabled={updating === test._id}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-purple-500 text-white text-xs font-semibold hover:from-violet-600 hover:to-purple-600 transition disabled:opacity-50">
                                    {updating === test._id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Microscope className="w-3 h-3" />}
                                    Start Processing
                                  </button>
                                )}
                                {test.status === 'processing' && (
                                  <button onClick={() => { setShowResultModal(test._id); if (!resultForm[test._id]) addResultRow(test._id); }}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-green-500 text-white text-xs font-semibold hover:from-emerald-600 hover:to-green-600 transition">
                                    <FileText className="w-3 h-3" /> Enter Results
                                  </button>
                                )}
                                {test.status === 'completed' && test.results?.length > 0 && (
                                  <button onClick={() => runAIInterpretation(test._id)}
                                    disabled={interpreting === test._id}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 text-xs font-semibold border border-purple-200 hover:bg-purple-100 transition disabled:opacity-50">
                                    {interpreting === test._id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                    AI Analysis
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Results Table */}
                            {test.results?.length > 0 && (
                              <div className="mt-3">
                                <table className="w-full text-sm border border-gray-100 rounded-lg overflow-hidden">
                                  <thead className="bg-gradient-to-r from-teal-50 to-cyan-50">
                                    <tr>
                                      <th className="text-left px-3 py-2 text-xs text-teal-700 font-semibold">Parameter</th>
                                      <th className="text-left px-3 py-2 text-xs text-teal-700 font-semibold">Value</th>
                                      <th className="text-left px-3 py-2 text-xs text-teal-700 font-semibold">Unit</th>
                                      <th className="text-left px-3 py-2 text-xs text-teal-700 font-semibold">Reference</th>
                                      <th className="text-left px-3 py-2 text-xs text-teal-700 font-semibold">Flag</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {test.results.map((r, i) => (
                                      <tr key={i} className={`border-t border-gray-50 ${r.flag === 'high' || r.flag === 'critical' ? 'bg-red-50/50' : r.flag === 'low' ? 'bg-yellow-50/50' : ''}`}>
                                        <td className="px-3 py-2 font-medium text-gray-800">{r.parameter}</td>
                                        <td className="px-3 py-2 text-gray-700">{r.value}</td>
                                        <td className="px-3 py-2 text-gray-500">{r.unit}</td>
                                        <td className="px-3 py-2 text-gray-500">{r.referenceRange}</td>
                                        <td className="px-3 py-2">
                                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                            r.flag === 'normal' ? 'bg-green-100 text-green-700' :
                                            r.flag === 'low' ? 'bg-yellow-100 text-yellow-700' :
                                            r.flag === 'high' ? 'bg-red-100 text-red-700' :
                                            r.flag === 'critical' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'
                                          }`}>{r.flag}</span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* Result Entry Modal */}
                            <AnimatePresence>
                              {showResultModal === test._id && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                  className="mt-3 p-4 bg-gradient-to-r from-teal-50 to-cyan-50 rounded-xl border border-teal-200 overflow-hidden">
                                  <h4 className="font-semibold text-teal-900 mb-3 flex items-center gap-2">
                                    <FileText className="w-4 h-4" /> Enter Results — {test.testName}
                                  </h4>
                                  <div className="space-y-2">
                                    {(resultForm[test._id] || []).map((row, i) => (
                                      <div key={i} className="grid grid-cols-6 gap-2 items-center">
                                        <input placeholder="Parameter" value={row.parameter} onChange={e => updateResultRow(test._id, i, 'parameter', e.target.value)} className="input-field text-sm col-span-1" />
                                        <input placeholder="Value" value={row.value} onChange={e => updateResultRow(test._id, i, 'value', e.target.value)} className="input-field text-sm" />
                                        <input placeholder="Unit" value={row.unit} onChange={e => updateResultRow(test._id, i, 'unit', e.target.value)} className="input-field text-sm" />
                                        <input placeholder="Ref Range" value={row.referenceRange} onChange={e => updateResultRow(test._id, i, 'referenceRange', e.target.value)} className="input-field text-sm" />
                                        <select value={row.flag} onChange={e => updateResultRow(test._id, i, 'flag', e.target.value)} className="input-field text-sm">
                                          <option value="normal">Normal</option>
                                          <option value="low">Low</option>
                                          <option value="high">High</option>
                                          <option value="critical">Critical</option>
                                        </select>
                                        <button onClick={() => removeResultRow(test._id, i)} className="text-red-400 hover:text-red-600 text-sm">Remove</button>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="flex gap-3 mt-3">
                                    <button onClick={() => addResultRow(test._id)} className="text-sm px-3 py-1.5 border border-teal-200 text-teal-700 rounded-lg hover:bg-teal-50 transition font-medium">+ Add Parameter</button>
                                    <button onClick={() => submitResults(test._id)}
                                      disabled={updating === test._id}
                                      className="btn-primary text-sm flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-500 border-0 shadow-md">
                                      {updating === test._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                      Submit Results
                                    </button>
                                    <button onClick={() => setShowResultModal(null)} className="text-gray-500 text-sm hover:text-gray-700 font-medium">Cancel</button>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
