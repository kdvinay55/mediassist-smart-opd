import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, X, Send, Trash2, Globe, ChevronDown, Volume2, VolumeX } from 'lucide-react';
import assistantService from './assistantService';
import speechService from './speechService';
import VoiceWaveAnimation from './VoiceWaveAnimation';
import ChatPanel from './ChatPanel';
import api from '../lib/api';

const STATUS_TEXT = {
  idle: 'Tap to speak',
  'wake-listening': 'Listening for "Hey Medi"...',
  listening: 'Listening...',
  processing: 'Thinking...',
  speaking: 'Speaking...'
};

export default function VoiceAssistant() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState('idle');
  const [messages, setMessages] = useState([]);
  const [interimText, setInterimText] = useState('');
  const [textInput, setTextInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [language, setLanguage] = useState('en-US');
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const inputRef = useRef(null);

  // Wire up assistant callbacks
  useEffect(() => {
    const sync = () => setMessages([...assistantService.conversationHistory]);
    assistantService.onStateChange = (s) => setState(s);
    assistantService.onMessage = () => sync();
    assistantService.onInterim = (text) => setInterimText(text);
    assistantService.onNavigate = (path) => {
      navigate(path);
    };
    assistantService.onError = (err) => {
      const errMsg = {
        role: 'assistant',
        content: typeof err === 'string' ? err : 'Voice assistant is unavailable. Please try again.',
        timestamp: Date.now(),
        success: false
      };
      assistantService.conversationHistory.push(errMsg);
      setMessages([...assistantService.conversationHistory]);
    };

    // Sync existing messages on mount
    sync();

    return () => {
      assistantService.onStateChange = null;
      assistantService.onMessage = null;
      assistantService.onInterim = null;
      assistantService.onNavigate = null;
      assistantService.onError = null;
    };
  }, [navigate]);

  useEffect(() => {
    if (open) {
      assistantService.startWakeWordDetection();
    } else {
      assistantService.stop();
    }

    return () => {
      assistantService.stop();
    };
  }, [open]);

  // Fetch suggestions on open
  useEffect(() => {
    if (open && suggestions.length === 0) {
      api.get('/assistant/suggestions').then(r => setSuggestions(r.data.suggestions || [])).catch(() => {});
    }
  }, [open]);

  // Toggle microphone
  const toggleMic = useCallback(() => {
    if (state === 'listening') {
      assistantService.stop();
    } else if (state === 'speaking') {
      assistantService.interruptSpeech();
    } else {
      assistantService.listen();
    }
  }, [state]);

  // Send text command
  const handleTextSubmit = useCallback(async (e) => {
    e?.preventDefault();
    const text = textInput.trim();
    if (!text || state === 'processing') return;
    setTextInput('');

    // Add user message
    const userMsg = { role: 'user', content: text, timestamp: Date.now() };
    assistantService.conversationHistory.push(userMsg);
    setMessages([...assistantService.conversationHistory]);

    // Process
    if (ttsEnabled) {
      await assistantService.processCommand(text);
    } else {
      // Process without TTS
      setState('processing');
      try {
        const { data } = await api.post('/assistant/command', {
          text,
          conversationHistory: assistantService.conversationHistory.slice(-8)
        });
        const assistantMsg = {
          role: 'assistant',
          content: data.response,
          timestamp: Date.now(),
          intent: data.intent,
          action: data.action,
          navigateTo: data.navigateTo,
          success: data.success
        };
        assistantService.conversationHistory.push(assistantMsg);
        setMessages([...assistantService.conversationHistory]);
        if (data.action === 'NAVIGATE' && data.navigateTo) navigate(data.navigateTo);
      } catch {
        const errMsg = { role: 'assistant', content: 'Something went wrong. Please try again.', timestamp: Date.now() };
        assistantService.conversationHistory.push(errMsg);
        setMessages([...assistantService.conversationHistory]);
      }
      setState('idle');
    }
  }, [textInput, state, ttsEnabled, navigate]);

  // Suggestion click
  const handleSuggestion = useCallback((text) => {
    setTextInput(text);
    // Auto-submit
    const userMsg = { role: 'user', content: text, timestamp: Date.now() };
    assistantService.conversationHistory.push(userMsg);
    setMessages([...assistantService.conversationHistory]);
    assistantService.processCommand(text);
  }, []);

  // Clear conversation
  const clearConversation = useCallback(() => {
    assistantService.clearHistory();
    setMessages([]);
  }, []);

  // Language change
  const handleLanguageChange = useCallback((code) => {
    setLanguage(code);
    assistantService.setLanguage(code);
    setShowLangMenu(false);
  }, []);

  // Close panel and stop
  const handleClose = useCallback(() => {
    assistantService.stop();
    setOpen(false);
    setInterimText('');
  }, []);

  const languages = assistantService.getLanguages();

  return (
    <>
      {/* Floating Mic Button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 right-6 z-[60] w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-xl shadow-blue-500/25 flex items-center justify-center hover:shadow-blue-500/40 transition-shadow"
          >
            <Mic className="w-6 h-6" />
            {/* Pulse ring */}
            <span className="absolute inset-0 rounded-full animate-ping bg-blue-500/20" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Assistant Panel */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
              className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[60]"
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="fixed bottom-4 right-4 z-[70] w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-2rem)] bg-white rounded-3xl shadow-2xl shadow-black/10 flex flex-col overflow-hidden border border-gray-100"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-blue-500 to-indigo-600">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                    <Mic className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white leading-none">MediAssist</h3>
                    <p className="text-[10px] text-white/70 mt-0.5">Voice AI Assistant</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {/* TTS Toggle */}
                  <button
                    onClick={() => setTtsEnabled(v => !v)}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition text-white/80 hover:text-white"
                    title={ttsEnabled ? 'Mute voice' : 'Enable voice'}
                  >
                    {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </button>
                  {/* Language selector */}
                  <div className="relative">
                    <button
                      onClick={() => setShowLangMenu(v => !v)}
                      className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-white/10 transition text-white/80 hover:text-white text-[10px] font-medium"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      {language.split('-')[0].toUpperCase()}
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    <AnimatePresence>
                      {showLangMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="absolute right-0 mt-1 w-32 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-10"
                        >
                          {languages.map(l => (
                            <button
                              key={l.code}
                              onClick={() => handleLanguageChange(l.code)}
                              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${language === l.code ? 'text-blue-600 font-medium' : 'text-gray-700'}`}
                            >
                              {l.label}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  {/* Clear */}
                  {messages.length > 0 && (
                    <button
                      onClick={clearConversation}
                      className="p-1.5 rounded-lg hover:bg-white/10 transition text-white/80 hover:text-white"
                      title="Clear conversation"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {/* Close */}
                  <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-white/10 transition text-white/80 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Chat area */}
              {(state === 'wake-listening' || state === 'listening') && (
                <div className="px-4 pt-4">
                  <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-100 text-blue-700 px-3 py-2 text-xs font-medium shadow-sm">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                    {state === 'wake-listening' ? 'Listening for "Hey Medi"...' : 'Listening...'}
                  </div>
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                <ChatPanel
                  messages={messages}
                  suggestions={suggestions}
                  onSuggestionClick={handleSuggestion}
                  isProcessing={state === 'processing'}
                />
              </div>

              {/* Interim text */}
              <AnimatePresence>
                {interimText && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="px-4 border-t border-gray-50"
                  >
                    <p className="text-xs text-gray-400 italic py-1.5 truncate">{interimText}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Voice control area */}
              <div className="border-t border-gray-100 bg-gray-50/50">
                {/* Status + wave */}
                <div className="flex items-center justify-center gap-3 py-2.5">
                  <VoiceWaveAnimation state={state} size="sm" />
                  <span className={`text-xs font-medium ${
                    state === 'listening' ? 'text-blue-600' :
                    state === 'processing' ? 'text-amber-600' :
                    state === 'speaking' ? 'text-emerald-600' : 'text-gray-400'
                  }`}>
                    {STATUS_TEXT[state]}
                  </span>
                </div>

                {/* Mic button + text input */}
                <div className="flex items-center gap-2 px-3 pb-3">
                  <form onSubmit={handleTextSubmit} className="flex-1 flex items-center gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="Type a command..."
                      className="flex-1 px-3 py-2 text-sm rounded-xl bg-white border border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20 outline-none transition placeholder:text-gray-400"
                    />
                    {textInput.trim() && (
                      <motion.button
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        type="submit"
                        disabled={state === 'processing'}
                        className="w-9 h-9 rounded-xl bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition disabled:opacity-40"
                      >
                        <Send className="w-4 h-4" />
                      </motion.button>
                    )}
                  </form>

                  {/* Mic button */}
                  <button
                    onClick={toggleMic}
                    disabled={state === 'processing'}
                    className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
                      state === 'listening'
                        ? 'bg-red-500 text-white shadow-lg shadow-red-500/25 animate-pulse'
                        : state === 'speaking'
                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                        : 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30'
                    } disabled:opacity-40`}
                  >
                    {state === 'listening' ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
