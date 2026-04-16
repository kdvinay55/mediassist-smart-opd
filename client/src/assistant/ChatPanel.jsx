import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bot, User, ArrowRight, Sparkles } from 'lucide-react';

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${isUser ? 'bg-primary-100' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
        {isUser ? <User className="w-3.5 h-3.5 text-primary-600" /> : <Bot className="w-3.5 h-3.5 text-white" />}
      </div>
      <div className={`max-w-[80%] ${isUser ? 'text-right' : 'text-left'}`}>
        <div className={`inline-block px-3.5 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-primary-500 text-white rounded-br-md'
            : 'bg-gray-100 text-gray-800 rounded-bl-md'
        }`}>
          {msg.content}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 px-1">
          <span className="text-[10px] text-gray-400">{timeAgo(msg.timestamp)}</span>
          {msg.intent && msg.intent !== 'GENERAL_CHAT' && (
            <span className="text-[10px] text-blue-500 font-medium">{msg.intent.replace(/_/g, ' ')}</span>
          )}
          {msg.navigateTo && (
            <span className="text-[10px] text-emerald-500 flex items-center gap-0.5">
              <ArrowRight className="w-2.5 h-2.5" /> {msg.navigateTo}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function ChatPanel({ messages, suggestions, onSuggestionClick, isProcessing }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center pt-6 pb-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-3">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-base font-semibold text-gray-800">MediAssist Voice AI</h3>
            <p className="text-xs text-gray-400 mt-1 max-w-[200px] mx-auto">
              Say <span className="font-semibold text-blue-500">"Hey Medi"</span> or tap the mic to start
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}

        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-2.5"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-2.5">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-gray-400"
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {messages.length === 0 && suggestions.length > 0 && (
        <div className="px-4 pb-3 border-t border-gray-100 pt-2">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-2">Try saying</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.slice(0, 6).map((s, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick?.(s.text)}
                className="text-xs px-2.5 py-1.5 rounded-full bg-gray-50 text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition border border-gray-100"
              >
                {s.text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
