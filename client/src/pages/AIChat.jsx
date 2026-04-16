import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Bot, User, Sparkles, Trash2, Stethoscope, Calendar,
  FlaskConical, Pill, Activity, Clock, MapPin, Bell, ArrowRight,
  AlertCircle, CheckCircle2, Mic, MicOff, RotateCcw, Zap
} from 'lucide-react';

const WELCOME_MSG = {
  role: 'assistant',
  content: 'Hello! I\'m **MediAssist**, your AI medical assistant. How can I help you today?',
  timestamp: Date.now(),
  type: 'welcome'
};

const QUICK_ACTIONS = [
  { text: 'Book an appointment', icon: Calendar, color: 'blue' },
  { text: 'Show my appointments', icon: Calendar, color: 'indigo' },
  { text: 'Show my lab results', icon: FlaskConical, color: 'emerald' },
  { text: 'Show my medications', icon: Pill, color: 'purple' },
  { text: 'What is my queue status?', icon: Clock, color: 'amber' },
  { text: 'Check symptoms', icon: Stethoscope, color: 'rose' },
];

const FOLLOW_UP_PROMPTS = [
  { text: 'What are symptoms of diabetes?', icon: Activity },
  { text: 'How to manage high blood pressure?', icon: Activity },
  { text: 'Tips for post-surgery recovery', icon: Activity },
  { text: 'What to expect during OPD visit?', icon: MapPin },
];

// Renders markdown-lite: **bold**, bullet points
function RichText({ content }) {
  if (!content) return null;
  const lines = content.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        // Bullet points
        if (/^[•\-\*]\s/.test(trimmed)) {
          const text = trimmed.replace(/^[•\-\*]\s*/, '');
          return (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-blue-400 mt-0.5 text-xs">•</span>
              <span dangerouslySetInnerHTML={{ __html: boldify(text) }} />
            </div>
          );
        }
        return <p key={i} dangerouslySetInnerHTML={{ __html: boldify(trimmed) }} />;
      })}
    </div>
  );
}

function boldify(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');
}

function ActionBadge({ intent, navigateTo, onNavigate }) {
  if (!intent || intent === 'GENERAL_CHAT') return null;
  const label = intent.replace(/_/g, ' ').toLowerCase();
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-medium">
        <Zap className="w-2.5 h-2.5" /> {label}
      </span>
      {navigateTo && (
        <button
          onClick={() => onNavigate(navigateTo)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-medium hover:bg-emerald-100 transition"
        >
          <ArrowRight className="w-2.5 h-2.5" /> Go to page
        </button>
      )}
    </div>
  );
}

export default function AIChat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([WELCOME_MSG]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const messagesEnd = useRef(null);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Elapsed timer while loading
  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => clearInterval(timerRef.current);
  }, [loading]);

  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');

    const userMsg = { role: 'user', content: msg, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    // Build conversation context (last 8 messages)
    const history = [...messages.filter(m => m.type !== 'welcome'), userMsg].slice(-8);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Use the assistant/command endpoint — it handles both actions AND general chat
      const res = await api.post('/assistant/command', {
        text: msg,
        conversationHistory: history.map(m => ({ role: m.role, content: m.content }))
      }, { signal: controller.signal, timeout: 95000 });

      const data = res.data;
      const assistantMsg = {
        role: 'assistant',
        content: data.response,
        timestamp: Date.now(),
        intent: data.intent,
        action: data.action,
        navigateTo: data.navigateTo,
        success: data.success !== false
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Auto-navigate after a delay
      if (data.action === 'NAVIGATE' && data.navigateTo) {
        setTimeout(() => navigate(data.navigateTo), 1500);
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I\'m having trouble connecting right now. Please try again in a moment.',
        timestamp: Date.now(),
        success: false,
        isError: true
      }]);
    } finally {
      setLoading(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }, [input, loading, messages, navigate]);

  const cancelRequest = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Request cancelled. How else can I help?',
      timestamp: Date.now()
    }]);
  }, []);

  const clearChat = useCallback(() => {
    setMessages([{ ...WELCOME_MSG, content: 'Chat cleared! How can I help you?', timestamp: Date.now() }]);
  }, []);

  const retryLast = useCallback(() => {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (lastUser) {
      setMessages(prev => prev.filter(m => m !== prev[prev.length - 1])); // remove error msg
      sendMessage(lastUser.content);
    }
  }, [messages, sendMessage]);

  const showQuickActions = messages.length <= 1;

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              MediAssist AI
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online
              </span>
            </h1>
            <p className="text-xs text-gray-400">Powered by Ollama Local AI &middot; Private & Secure</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 1 && (
            <button onClick={clearChat} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-gray-500 hover:text-red-500 hover:bg-red-50 transition">
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1 scroll-smooth">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-1 ${
                msg.role === 'user'
                  ? 'bg-blue-100'
                  : msg.isError
                  ? 'bg-red-100'
                  : 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/20'
              }`}>
                {msg.role === 'user'
                  ? <User className="w-4 h-4 text-blue-600" />
                  : msg.isError
                  ? <AlertCircle className="w-4 h-4 text-red-500" />
                  : <Bot className="w-4 h-4 text-white" />
                }
              </div>

              {/* Bubble */}
              <div className={`max-w-[75%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                <div className={`inline-block px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-tr-md shadow-md shadow-blue-500/10'
                    : msg.isError
                    ? 'bg-red-50 border border-red-100 text-red-700 rounded-tl-md'
                    : 'bg-white border border-gray-100 text-gray-800 rounded-tl-md shadow-sm'
                }`}>
                  {msg.role === 'user'
                    ? <p className="whitespace-pre-wrap">{msg.content}</p>
                    : <RichText content={msg.content} />
                  }
                </div>

                {/* Action badge + navigation */}
                {msg.role === 'assistant' && msg.intent && (
                  <ActionBadge intent={msg.intent} navigateTo={msg.navigateTo} onNavigate={navigate} />
                )}

                {/* Error retry */}
                {msg.isError && (
                  <button onClick={retryLast} className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-red-500 hover:text-red-700 transition">
                    <RotateCcw className="w-3 h-3" /> Retry
                  </button>
                )}

                {/* Timestamp */}
                <div className={`mt-1 text-[10px] text-gray-400 ${msg.role === 'user' ? 'text-right pr-1' : 'pl-1'}`}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {msg.success === true && msg.intent && msg.intent !== 'GENERAL_CHAT' && (
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 inline ml-1" />
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Loading indicator */}
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      className="w-2 h-2 rounded-full bg-blue-400"
                      animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                </div>
                <span className="text-xs text-gray-400">
                  {elapsed > 3 ? `Thinking... (${elapsed}s)` : 'Thinking...'}
                </span>
                {elapsed > 5 && (
                  <button onClick={cancelRequest} className="text-[10px] text-red-400 hover:text-red-600 underline transition">
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEnd} />
      </div>

      {/* Quick Actions Grid */}
      <AnimatePresence>
        {showQuickActions && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4"
          >
            <p className="text-xs text-gray-400 font-medium mb-2 px-1">Quick Actions</p>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_ACTIONS.map((action, i) => {
                const Icon = action.icon;
                const colorMap = {
                  blue: 'bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-100',
                  indigo: 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border-indigo-100',
                  emerald: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-100',
                  purple: 'bg-purple-50 text-purple-600 hover:bg-purple-100 border-purple-100',
                  amber: 'bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-100',
                  rose: 'bg-rose-50 text-rose-600 hover:bg-rose-100 border-rose-100',
                };
                return (
                  <button
                    key={i}
                    onClick={() => sendMessage(action.text)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-xs font-medium transition ${colorMap[action.color]}`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-center leading-tight">{action.text}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Follow-up suggestions after first exchange */}
      {!showQuickActions && !loading && messages.length >= 3 && messages.length <= 5 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {FOLLOW_UP_PROMPTS.map((p, i) => (
            <button
              key={i}
              onClick={() => sendMessage(p.text)}
              className="text-[11px] px-3 py-1.5 rounded-full bg-gray-50 border border-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-100 transition"
            >
              {p.text}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="bg-white border border-gray-200 rounded-2xl p-2 shadow-sm flex items-center gap-2 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100 transition">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          className="flex-1 px-3 py-2 text-sm bg-transparent outline-none placeholder:text-gray-400"
          placeholder={loading ? 'Waiting for response...' : 'Ask me anything about your health...'}
          disabled={loading}
        />
        <button
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
          className="w-10 h-10 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white flex items-center justify-center hover:from-blue-600 hover:to-indigo-600 transition disabled:opacity-30 disabled:cursor-not-allowed shadow-md shadow-blue-500/20"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {/* Disclaimer */}
      <p className="text-center text-[10px] text-gray-400 mt-2">
        MediAssist provides general information only. Always consult your doctor for medical decisions.
      </p>
    </div>
  );
}
