import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDate } from '../lib/utils';
import {
  FlaskConical, AlertTriangle, CheckCircle, Clock, Loader, Loader2,
  XCircle, ThumbsUp, Navigation, Hash, MapPin, ArrowRight, Sparkles,
  Calendar, Stethoscope, ChevronDown
} from 'lucide-react';

function getFlagStyle(flag) {
  switch (flag) {
    case 'high': return 'text-red-600 bg-red-50';
    case 'low': return 'text-yellow-600 bg-yellow-50';
    case 'critical': return 'text-red-800 bg-red-100 font-bold';
    default: return 'text-green-600 bg-green-50';
  }
}

const statusSteps = ['ordered', 'sample-collected', 'processing', 'completed'];
const statusLabels = { ordered: 'Ordered', 'sample-collected': 'Sample Collected', processing: 'Processing', completed: 'Results Ready' };

export default function LabResults() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [labs, setLabs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [interpreting, setInterpreting] = useState(null);
  const [requestingFollowup, setRequestingFollowup] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState(null);

  const load = async () => {
    try {
      const res = await api.get('/lab');
      setLabs(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);

  const handleBatchConsent = async (orderGroup, consent) => {
    try {
      const { data } = await api.put('/lab/consent-batch', { orderGroup, consent });
      load(); // Refresh
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update consent');
    }
  };

  const interpretResults = async (labId) => {
    setInterpreting(labId);
    try {
      const res = await api.post(`/lab/${labId}/ai-interpret`);
      setLabs(labs.map(l => l._id === labId ? { ...l, aiInterpretation: res.data.interpretation } : l));
      if (selected?._id === labId) {
        setSelected({ ...selected, aiInterpretation: res.data.interpretation });
      }
    } catch (err) {
      alert('AI interpretation failed');
    }
    setInterpreting(null);
  };

  const requestFollowup = async (labId) => {
    setRequestingFollowup(true);
    try {
      const { data } = await api.post('/lab/request-followup', { labId });
      alert(`✅ ${data.message}`);
      navigate('/queue');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to request follow-up');
    }
    setRequestingFollowup(false);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-3 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" /></div>;

  // Group labs by orderGroup
  const grouped = {};
  labs.forEach(lab => {
    const key = lab.orderGroup || lab._id;
    if (!grouped[key]) {
      grouped[key] = {
        orderGroup: key,
        doctor: lab.orderedBy,
        labs: [],
        consent: lab.patientConsent,
        labTokenNumber: lab.labTokenNumber,
        labQueuePosition: lab.labQueuePosition,
        labAccepted: lab.labAccepted,
        createdAt: lab.createdAt,
        priority: lab.priority
      };
    }
    grouped[key].labs.push(lab);
  });
  const groups = Object.values(grouped);
  const pendingGroups = groups.filter(g => g.consent === 'pending' && g.labs.some(l => l.status !== 'cancelled'));
  const acceptedGroups = groups.filter(g => g.consent === 'accepted');
  const completedGroups = groups.filter(g => g.labs.every(l => l.status === 'completed'));

  // Detail view
  if (selected) {
    const stepIdx = statusSteps.indexOf(selected.status);
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setSelected(null)} className="btn-secondary">← Back</button>
          <h1 className="text-2xl font-bold text-gray-900">{selected.testName}</h1>
        </div>

        {/* Status Progress Bar */}
        <div className="card p-4">
          <div className="flex items-center justify-between">
            {statusSteps.map((step, i) => (
              <div key={step} className="flex items-center flex-1">
                <div className={`flex flex-col items-center flex-1 ${i <= stepIdx ? 'text-emerald-600' : 'text-gray-300'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    i < stepIdx ? 'bg-emerald-500 text-white' :
                    i === stepIdx ? 'bg-emerald-500 text-white ring-4 ring-emerald-100' :
                    'bg-gray-200 text-gray-400'
                  }`}>{i < stepIdx ? '✓' : i + 1}</div>
                  <span className="text-xs mt-1 font-medium text-center">{statusLabels[step]}</span>
                </div>
                {i < statusSteps.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-1 ${i < stepIdx ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Test Results</h3>
              <span className={`badge ${selected.status === 'completed' ? 'badge-green' : 'badge-yellow'}`}>{selected.status}</span>
            </div>
            {selected.results && selected.results.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-gray-500 font-medium">Parameter</th>
                      <th className="text-left py-2 text-gray-500 font-medium">Value</th>
                      <th className="text-left py-2 text-gray-500 font-medium">Reference</th>
                      <th className="text-left py-2 text-gray-500 font-medium">Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.results.map((r, i) => (
                      <tr key={i} className={`border-b border-gray-50 ${r.flag === 'high' || r.flag === 'critical' ? 'bg-red-50/50' : r.flag === 'low' ? 'bg-yellow-50/50' : ''}`}>
                        <td className="py-2 text-gray-900">{r.parameter}</td>
                        <td className="py-2 font-medium">{r.value} {r.unit}</td>
                        <td className="py-2 text-gray-500">{r.referenceRange}</td>
                        <td className="py-2"><span className={`badge ${getFlagStyle(r.flag)}`}>{r.flag || 'normal'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8">
                <Loader className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-2" />
                <p className="text-gray-400">Results pending — you'll be notified when ready</p>
              </div>
            )}

            {/* AI Summary below results */}
            {selected.status === 'completed' && selected.results?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                {selected.aiInterpretation ? (
                  <div className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl border border-purple-100">
                    <p className="text-xs text-purple-600 font-semibold flex items-center gap-1 mb-2"><Sparkles className="w-3.5 h-3.5" /> AI Summary</p>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{selected.aiInterpretation}</p>
                  </div>
                ) : (
                  <button onClick={() => interpretResults(selected._id)}
                    disabled={interpreting === selected._id}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 text-white font-medium hover:from-purple-600 hover:to-blue-600 transition disabled:opacity-50">
                    {interpreting === selected._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Get AI Summary of Results
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-2">Test Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Category</span><span className="capitalize">{selected.testCategory}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Priority</span><span className="capitalize">{selected.priority}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Ordered By</span><span>{selected.orderedBy?.name || 'N/A'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Date</span><span>{formatDate(selected.createdAt)}</span></div>
                {selected.sampleCollectedAt && <div className="flex justify-between"><span className="text-gray-500">Sample Collected</span><span>{formatDate(selected.sampleCollectedAt)}</span></div>}
                {selected.completedAt && <div className="flex justify-between"><span className="text-gray-500">Completed</span><span>{formatDate(selected.completedAt)}</span></div>}
              </div>
            </div>

            {/* Request Follow-up Appointment */}
            {selected.status === 'completed' && user?.role === 'patient' && (
              <div className="card border-2 border-blue-200 bg-blue-50/50">
                <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-500" /> Follow-up with Doctor
                </h3>
                <p className="text-sm text-gray-600 mb-3">Book a follow-up appointment to discuss your results with {selected.orderedBy?.name || 'your doctor'}.</p>
                <button onClick={() => requestFollowup(selected._id)}
                  disabled={requestingFollowup}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-500 text-white font-medium hover:bg-blue-600 transition disabled:opacity-50">
                  {requestingFollowup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Stethoscope className="w-4 h-4" />}
                  Join Doctor's Queue (No Verification Needed)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Main list view
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Lab Results</h1>
        <p className="text-gray-500">Track your laboratory tests and results</p>
      </div>

      {labs.length === 0 ? (
        <div className="card text-center py-12">
          <FlaskConical className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No lab tests ordered yet</p>
        </div>
      ) : (
        <div className="space-y-6">

          {/* Pending Consent — Grouped */}
          {pendingGroups.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" /> Lab Test Requests
              </h2>
              {pendingGroups.map(group => (
                <motion.div key={group.orderGroup} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="card border-2 border-amber-200 bg-amber-50/50 p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
                      <FlaskConical className="w-6 h-6 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900">
                          {group.labs.length} Test{group.labs.length > 1 ? 's' : ''} Ordered
                        </h3>
                        {group.priority !== 'normal' && (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${group.priority === 'stat' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                            {group.priority === 'stat' ? 'STAT' : 'Urgent'}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5">
                        Ordered by: <strong>{group.doctor?.name || 'Doctor'}</strong> • {formatDate(group.createdAt)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {group.labs.map(l => (
                          <span key={l._id} className="inline-flex items-center px-2.5 py-1 bg-white rounded-lg text-xs font-medium text-gray-700 border border-gray-200">
                            🧪 {l.testName} <span className="ml-1 text-gray-400 capitalize">({l.testCategory})</span>
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">Your doctor has recommended these tests. Accept to join the lab queue.</p>
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => handleBatchConsent(group.orderGroup, 'accepted')}
                          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition shadow-md shadow-emerald-500/20">
                          <ThumbsUp className="w-4 h-4" /> Accept All & Join Lab Queue
                        </button>
                        <button onClick={() => { if (confirm('Decline all lab tests in this order?')) handleBatchConsent(group.orderGroup, 'declined'); }}
                          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 transition">
                          <XCircle className="w-4 h-4" /> Decline
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Lab Queue Status — for accepted orders not yet completed */}
          {acceptedGroups.filter(g => !g.labs.every(l => l.status === 'completed')).length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Navigation className="w-5 h-5 text-blue-500" /> Lab Queue & Status
              </h2>
              {acceptedGroups.filter(g => !g.labs.every(l => l.status === 'completed')).map(group => {
                const allCollected = group.labs.every(l => ['sample-collected', 'processing', 'completed'].includes(l.status));
                const allProcessing = group.labs.every(l => ['processing', 'completed'].includes(l.status));
                const overallStatus = allProcessing ? 'processing' : allCollected ? 'sample-collected' : 'ordered';
                const stepIdx = statusSteps.indexOf(overallStatus);

                return (
                  <motion.div key={group.orderGroup} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="card p-5 border-l-4 border-blue-400">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        {/* Queue Token */}
                        {group.labTokenNumber && !group.labAccepted && (
                          <div className="flex items-center gap-4 mb-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                            <div className="text-center">
                              <div className="text-3xl font-bold text-blue-600">{group.labTokenNumber}</div>
                              <div className="text-[10px] text-blue-400 font-medium">TOKEN</div>
                            </div>
                            <div className="h-10 w-px bg-blue-200" />
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5 text-sm text-blue-800">
                                <Hash className="w-3.5 h-3.5" /> Queue Position: <strong>#{group.labQueuePosition}</strong>
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-blue-600">
                                <MapPin className="w-3 h-3" /> Please proceed to the Laboratory
                              </div>
                            </div>
                          </div>
                        )}

                        {group.labAccepted && overallStatus === 'ordered' && (
                          <div className="mb-3 p-3 bg-green-50 rounded-xl border border-green-100">
                            <p className="text-sm text-green-800 font-medium">✅ Lab has accepted you — sample collection in progress</p>
                          </div>
                        )}

                        {/* Progress Bar */}
                        <div className="flex items-center gap-1 mb-3">
                          {statusSteps.map((step, i) => (
                            <div key={step} className="flex items-center flex-1">
                              <div className={`h-1.5 flex-1 rounded-full ${i <= stepIdx ? 'bg-blue-500' : 'bg-gray-200'}`} />
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-gray-500 mb-2">Status: <span className="font-medium text-gray-700 capitalize">{statusLabels[overallStatus]}</span></p>

                        {/* Tests */}
                        <div className="flex flex-wrap gap-1.5">
                          {group.labs.map(l => (
                            <span key={l._id} onClick={() => l.status === 'completed' ? setSelected(l) : null}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                                l.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 cursor-pointer hover:bg-emerald-100' :
                                l.status === 'processing' ? 'bg-violet-50 text-violet-700 border-violet-200' :
                                l.status === 'sample-collected' ? 'bg-cyan-50 text-cyan-700 border-cyan-200' :
                                'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>
                              {l.status === 'completed' ? <CheckCircle className="w-3 h-3" /> :
                               l.status === 'processing' ? <Loader className="w-3 h-3 animate-spin" /> :
                               <Clock className="w-3 h-3" />}
                              {l.testName}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Completed Results */}
          {completedGroups.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-500" /> Completed Results
              </h2>
              {completedGroups.map(group => (
                <div key={group.orderGroup} className="card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm text-gray-500">Ordered by {group.doctor?.name} • {formatDate(group.createdAt)}</p>
                    </div>
                    <button onClick={() => requestFollowup(group.labs[0]._id)}
                      disabled={requestingFollowup}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition">
                      {requestingFollowup ? <Loader2 className="w-3 h-3 animate-spin" /> : <Stethoscope className="w-3 h-3" />}
                      Book Follow-up
                    </button>
                  </div>
                  <div className="space-y-2">
                    {group.labs.map(lab => (
                      <motion.div key={lab._id} whileHover={{ y: -1 }} onClick={() => setSelected(lab)}
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition">
                        <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm">{lab.testName}</p>
                          <p className="text-xs text-gray-500">{lab.testCategory} • Completed {formatDate(lab.completedAt)}</p>
                        </div>
                        {lab.results?.some(r => r.flag === 'critical' || r.flag === 'high') && (
                          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                        )}
                        {lab.aiInterpretation && <Sparkles className="w-4 h-4 text-purple-500 shrink-0" />}
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* All other labs (not in pending or completed groups) */}
          {labs.filter(l => l.patientConsent === 'declined').length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-gray-400">Declined</h2>
              {labs.filter(l => l.patientConsent === 'declined').map(lab => (
                <div key={lab._id} className="card p-3 opacity-50 flex items-center gap-3">
                  <XCircle className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500 line-through">{lab.testName}</p>
                    <p className="text-xs text-gray-400">{lab.testCategory} • {formatDate(lab.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
