import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import { motion } from 'framer-motion';
import { formatDate } from '../lib/utils';
import { Stethoscope, MessageSquare, CheckCircle, AlertCircle, Plus, X } from 'lucide-react';

export default function Consultations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [consultations, setConsultations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [chatMsg, setChatMsg] = useState('');

  useEffect(() => {
    const fetch = async () => {
      try {
        if (user?.role === 'patient') {
          const res = await api.get('/patients/history');
          setConsultations(res.data);
        } else {
          // Doctor: get from appointments
          const today = new Date().toISOString().split('T')[0];
          const res = await api.get(`/appointments?date=${today}`);
          setConsultations(res.data.filter(a => ['in-consultation', 'vitals-done'].includes(a.status)));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [user, location.key]);

  const startConsultation = async (appointmentId) => {
    try {
      const res = await api.post('/consultations', {
        appointmentId,
        chiefComplaint: '',
        symptoms: [],
      });
      navigate(`/consultation-room/${res.data._id}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to start consultation');
    }
  };

  const getAIDiagnosis = async () => {
    if (!selected) return;
    setAiLoading(true);
    try {
      const res = await api.post(`/consultations/${selected._id}/ai-diagnosis`, {});
      setSelected({ ...selected, aiSuggestedDiagnosis: res.data.aiDiagnosis });
    } catch (err) {
      alert('AI diagnosis failed');
    } finally {
      setAiLoading(false);
    }
  };

  const sendChat = async () => {
    if (!chatMsg.trim() || !selected) return;
    setAiLoading(true);
    try {
      const res = await api.post(`/consultations/${selected._id}/chat`, { message: chatMsg });
      setSelected({
        ...selected,
        aiChatHistory: [
          ...(selected.aiChatHistory || []),
          { role: 'user', content: chatMsg },
          { role: 'assistant', content: res.data.response }
        ]
      });
      setChatMsg('');
    } catch (err) {
      alert('AI chat failed');
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-3 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" /></div>;

  // If a consultation is selected (doctor view)
  if (selected && user?.role === 'doctor') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setSelected(null)} className="btn-secondary">Back</button>
          <h1 className="text-2xl font-bold text-gray-900">Active Consultation</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Consultation Notes */}
          <div className="card space-y-4">
            <h3 className="font-semibold text-gray-900">Consultation Notes</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chief Complaint</label>
              <input
                type="text"
                className="input-field"
                value={selected.chiefComplaint || ''}
                onChange={e => setSelected({ ...selected, chiefComplaint: e.target.value })}
                placeholder="Main complaint"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Symptoms</label>
              <input
                type="text"
                className="input-field"
                value={(selected.symptoms || []).join(', ')}
                onChange={e => setSelected({ ...selected, symptoms: e.target.value.split(',').map(s => s.trim()) })}
                placeholder="Comma separated symptoms"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Examination Notes</label>
              <textarea
                className="input-field min-h-[100px]"
                value={selected.examination || ''}
                onChange={e => setSelected({ ...selected, examination: e.target.value })}
                placeholder="Physical examination findings"
              />
            </div>
            <button onClick={getAIDiagnosis} disabled={aiLoading} className="btn-primary flex items-center gap-2">
              {aiLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Stethoscope className="w-4 h-4" />}
              Get AI Diagnosis
            </button>

            {selected.aiSuggestedDiagnosis?.length > 0 && (
              <div className="bg-blue-50 rounded-xl p-4">
                <h4 className="font-medium text-blue-900 mb-2">AI Suggested Diagnoses</h4>
                {selected.aiSuggestedDiagnosis.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-blue-800">
                    <AlertCircle className="w-4 h-4" />
                    <span>{d.condition}</span>
                    {d.confidence > 0 && <span className="text-blue-500">({d.confidence}%)</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Chat */}
          <div className="card flex flex-col" style={{ maxHeight: '600px' }}>
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary-500" /> AI Assistant
            </h3>
            <div className="flex-1 overflow-y-auto space-y-3 mb-4">
              {(!selected.aiChatHistory || selected.aiChatHistory.length === 0) && (
                <p className="text-gray-400 text-center text-sm py-8">Ask the AI assistant about this case</p>
              )}
              {(selected.aiChatHistory || []).map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-800'}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={chatMsg}
                onChange={e => setChatMsg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendChat()}
                className="input-field flex-1"
                placeholder="Ask about this case..."
              />
              <button onClick={sendChat} disabled={aiLoading || !chatMsg.trim()} className="btn-primary !px-4">
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Consultations</h1>
        <p className="text-gray-500">{user?.role === 'patient' ? 'Your consultation history' : 'Today\'s consultations'}</p>
      </div>

      {consultations.length === 0 ? (
        <div className="card text-center py-12">
          <Stethoscope className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No consultations found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {consultations.map(item => (
            <motion.div key={item._id} whileHover={{ y: -1 }} className="card flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                <Stethoscope className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">
                  {user?.role === 'patient' ? `Dr. ${item.doctorId?.name || 'N/A'}` : item.patientId?.name || 'Patient'}
                </p>
                <p className="text-sm text-gray-500">
                  {item.department || item.chiefComplaint || 'Consultation'} • {formatDate(item.createdAt || item.date)}
                </p>
              </div>
              {user?.role === 'doctor' && (
                <button onClick={() => startConsultation(item._id)} className="btn-primary text-sm !px-4 !py-2">
                  {item.status === 'in-consultation' ? 'Continue Consultation' : 'Start Consultation'}
                </button>
              )}
              {item.status && <span className={`badge ${item.status === 'completed' ? 'badge-green' : 'badge-yellow'}`}>{item.status}</span>}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
