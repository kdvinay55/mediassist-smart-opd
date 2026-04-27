import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Mic, MicOff, Send, Volume2, X } from 'lucide-react';
import assistantRuntime from './AssistantRuntime';
import AssistantStatusIndicator from './AssistantStatusIndicator';
import { ASSISTANT_STATES, ASSISTANT_STATUS_EVENT_NAME } from './config';

const STATUS_TEXT = {
  [ASSISTANT_STATES.IDLE]: 'Closed',
  [ASSISTANT_STATES.WAITING_FOR_WAKE_WORD]: 'Listening for "Hey Medi"',
  [ASSISTANT_STATES.WAKE_DETECTED]: 'Wake word detected',
  [ASSISTANT_STATES.LISTENING]: 'Listening...',
  [ASSISTANT_STATES.PROCESSING]: 'Thinking...',
  [ASSISTANT_STATES.SPEAKING]: 'Speaking...',
  [ASSISTANT_STATES.RETRY]: 'Recovering...',
  [ASSISTANT_STATES.RETURN_TO_IDLE]: 'Resetting...',
  [ASSISTANT_STATES.ERROR]: 'Recovering...'
};

export default function VoiceAssistant() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(assistantRuntime.getState());
  const [messages, setMessages] = useState([...assistantRuntime.conversationHistory]);
  const [textInput, setTextInput] = useState('');
  const [assistantStatus, setAssistantStatus] = useState(assistantRuntime.getSystemStatus());

  useEffect(() => {
    assistantRuntime.onStateChange = (nextState) => setState(nextState);
    assistantRuntime.onMessage = (_message, history) => setMessages(history);
    assistantRuntime.onNavigate = (path) => navigate(path);
    assistantRuntime.onError = () => setMessages([...assistantRuntime.conversationHistory]);

    return () => {
      assistantRuntime.onStateChange = null;
      assistantRuntime.onMessage = null;
      assistantRuntime.onNavigate = null;
      assistantRuntime.onError = null;
    };
  }, [navigate]);

  useEffect(() => {
    void assistantRuntime.initializeStatusMonitor();
    const handler = (event) => setAssistantStatus(event.detail);
    window.addEventListener(ASSISTANT_STATUS_EVENT_NAME, handler);
    return () => window.removeEventListener(ASSISTANT_STATUS_EVENT_NAME, handler);
  }, []);

  useEffect(() => {
    if (open) {
      void assistantRuntime.start();
    } else {
      void assistantRuntime.stop();
    }

    return () => {
      void assistantRuntime.stop();
    };
  }, [open]);

  const statusText = useMemo(() => STATUS_TEXT[state] || 'Ready', [state]);
  const controlsDisabled = !assistantStatus.assistantEnabled && !assistantStatus.demoModeActive;
  const micDisabled = controlsDisabled || !assistantStatus.voiceInputEnabled;

  const handleMicClick = async () => {
    if (micDisabled) {
      return;
    }
    if (state === ASSISTANT_STATES.LISTENING) {
      await assistantRuntime.finishListening();
      return;
    }
    if (state === ASSISTANT_STATES.ERROR) {
      await assistantRuntime.stopCurrentAction();
      return;
    }
    if (state === ASSISTANT_STATES.SPEAKING || state === ASSISTANT_STATES.PROCESSING) {
      await assistantRuntime.stopCurrentAction();
      return;
    }
    await assistantRuntime.listenNow();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const value = textInput.trim();
    if (!value) return;
    setTextInput('');
    await assistantRuntime.submitText(value);
  };

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setOpen(true)}
            aria-label="Open MediAssist voice assistant"
            data-testid="assistant-fab"
            style={{ backgroundColor: '#2563eb', color: '#ffffff', boxShadow: '0 10px 24px rgba(37, 99, 235, 0.4)' }}
            className="fixed bottom-6 right-6 z-[60] flex h-14 w-14 items-center justify-center rounded-full"
          >
            <Mic className="h-6 w-6" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/20"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              className="fixed bottom-4 right-4 z-[70] flex h-[560px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-2xl"
            >
              <div
                style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <div className="text-sm font-semibold">MediAssist</div>
                  <div className="text-xs text-white/75">Voice Assistant</div>
                </div>
                <AssistantStatusIndicator compact className="!border-white/20 !bg-white/10 !text-white" />
                <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-white/10">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="border-b border-gray-100 px-4 py-3">
                <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                  {statusText}
                </div>
                {(assistantStatus.statusMessage || assistantStatus.sessionTimedOut) && (
                  <div className="mt-2 text-xs text-gray-500">
                    {assistantStatus.statusMessage}
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {messages.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                    Say "Hey Medi" or tap the mic to start a command.
                  </div>
                )}
                {messages.map((message, index) => (
                  <div key={`${message.timestamp}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      style={message.role === 'user'
                        ? { backgroundColor: '#2563eb', color: '#ffffff' }
                        : { backgroundColor: '#dbeafe', color: '#0f172a', border: '1px solid #93c5fd' }}
                      className="max-w-[82%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap"
                    >
                      {message.content || (message.streaming ? '…' : '')}
                      {message.streaming && message.content && <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-gray-700 align-middle" />}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-gray-100 px-4 py-4">
                <div className="mb-3 flex items-center justify-center">
                  <button
                    onClick={handleMicClick}
                    disabled={micDisabled}
                    style={{
                      backgroundColor: state === ASSISTANT_STATES.LISTENING ? '#ef4444' : '#2563eb',
                      color: '#ffffff',
                      boxShadow: '0 8px 16px rgba(37, 99, 235, 0.35)'
                    }}
                    className="flex h-14 w-14 items-center justify-center rounded-full disabled:opacity-50"
                    aria-label={state === ASSISTANT_STATES.LISTENING ? 'Stop listening' : 'Start listening'}
                  >
                    {state === ASSISTANT_STATES.LISTENING ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                  </button>
                </div>
                <form onSubmit={handleSubmit} className="flex items-center gap-2">
                  <div className="flex min-h-11 flex-1 items-center gap-2 rounded-2xl border border-gray-200 px-3">
                    <Volume2 className="h-4 w-4 text-gray-400" />
                    <input
                      value={textInput}
                      onChange={(event) => setTextInput(event.target.value)}
                      placeholder={controlsDisabled ? 'Assistant unavailable' : 'Type a command'}
                      disabled={controlsDisabled}
                      aria-label="Assistant text input"
                      data-testid="assistant-input"
                      className="h-11 w-full bg-transparent text-sm text-gray-800 outline-none"
                    />
                  </div>
                  <button type="submit" disabled={controlsDisabled} aria-label="Send assistant message" data-testid="assistant-send" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-900 text-white disabled:opacity-50">
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
