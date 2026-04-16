// MediAssist Voice AI — Assistant Service
// Orchestrates speech recognition, Ollama AI, and command execution

import api from '../lib/api';
import speechService from './speechService';

const MAX_HISTORY = 10;

class AssistantService {
  constructor() {
    this.state = 'idle'; // idle | listening | processing | speaking
    this.conversationHistory = [];
    this.onStateChange = null;
    this.onMessage = null;      // { role: 'user'|'assistant', content, timestamp }
    this.onInterim = null;      // live transcription text
    this.onNavigate = null;     // navigation callback
    this.onError = null;

    // Wire speech service callbacks
    speechService.onResult = (text) => this._handleSpeechResult(text);
    speechService.onInterim = (text) => this.onInterim?.(text);
    speechService.onWakeWord = (afterWake) => this._handleWakeWord(afterWake);
    speechService.onStateChange = (s) => {
      if (s === 'speaking') this._setState('speaking');
    };
    speechService.onError = (err) => this.onError?.(err);
  }

  _setState(state) {
    this.state = state;
    this.onStateChange?.(state);
  }

  // Start listening for voice input
  listen() {
    speechService.startListening(false);
    this._setState('listening');
  }

  // Start wake word detection ("Hey Medi")
  startWakeWordDetection() {
    speechService.startListening(true);
    this._setState('wake-listening');
  }

  // Stop everything
  stop() {
    speechService.stopListening();
    speechService.stopSpeaking();
    this._setState('idle');
  }

  // Stop speaking only (voice interrupt)
  interruptSpeech() {
    speechService.stopSpeaking();
    this._setState('idle');
  }

  // Handle wake word detected
  _handleWakeWord(afterWake) {
    this._setState('listening');
    if (!afterWake) {
      const promptText = 'How can I help you?';
      const assistantMsg = { role: 'assistant', content: promptText, timestamp: Date.now() };
      this.conversationHistory.push(assistantMsg);
      if (this.conversationHistory.length > MAX_HISTORY) {
        this.conversationHistory = this.conversationHistory.slice(-MAX_HISTORY);
      }
      this.onMessage?.(assistantMsg);
      this.speakResponse(promptText, { restartListening: true });
    }
    // Otherwise, direct command text will be handled by onResult.
  }

  normalizeSpeechText(text) {
    if (!text) return text;
    let spoken = text.trim();

    // Remove markdown-style formatting
    spoken = spoken.replace(/\*\*/g, '');
    spoken = spoken.replace(/\*/g, '');
    spoken = spoken.replace(/#{1,6}\s*/g, '');
    spoken = spoken.replace(/`/g, '');

    // Convert numbered list items (e.g. "1. ENT — April 14 — cancelled") into natural speech
    const ordinals = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
    spoken = spoken.replace(/^\s*(\d+)\.\s*(.+)$/gm, (_, num, content) => {
      const ord = ordinals[parseInt(num, 10) - 1] || `number ${num}`;
      return `The ${ord} one is ${content.trim()}`;
    });

    // Remove bullet points
    spoken = spoken.replace(/^[\u2022\*\-]\s*/gm, '');

    // Replace newlines with pauses
    spoken = spoken.split(/\r?\n+/).map(l => l.trim()).filter(Boolean).join('. ');

    // Replace em-dash / en-dash / pipe separators with natural pauses
    spoken = spoken.replace(/\s*[—–]\s*/g, ', ');
    spoken = spoken.replace(/\s*\|\s*/g, ', ');

    // Replace date formats with natural language
    // ISO format: 2026-04-14
    spoken = spoken.replace(/(\d{4})-(\d{1,2})-(\d{1,2})/g, (_, y, m, d) => {
      const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      return isNaN(date.getTime()) ? `${y}-${m}-${d}` : new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date);
    });
    // Slash format: 14/4/2026 or 4/14/2026
    spoken = spoken.replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g, (_, a, b, y) => {
      // Try DD/MM/YYYY first
      let date = new Date(parseInt(y), parseInt(b) - 1, parseInt(a));
      if (isNaN(date.getTime())) date = new Date(parseInt(y), parseInt(a) - 1, parseInt(b));
      return isNaN(date.getTime()) ? `${a}/${b}/${y}` : new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date);
    });

    // Replace check marks and special chars
    spoken = spoken.replace(/✓/g, ', completed');
    spoken = spoken.replace(/✗|✘/g, ', pending');
    spoken = spoken.replace(/N\/A/gi, 'not available');

    // Clean up double periods and extra spaces
    spoken = spoken.replace(/\.\s*\./g, '.');
    spoken = spoken.replace(/,\s*,/g, ',');
    spoken = spoken.replace(/\s{2,}/g, ' ');
    spoken = spoken.replace(/\s+([.,!?])/g, '$1');

    // End with a period
    if (spoken && !/[.!?]$/.test(spoken)) {
      spoken += '.';
    }

    return spoken.trim();
  }

  // Handle final speech result
  async _handleSpeechResult(text) {
    if (!text || text.trim().length === 0) return;

    // Stop listening while processing
    speechService.stopListening();
    this.onInterim?.('');

    // Add user message
    const userMsg = { role: 'user', content: text.trim(), timestamp: Date.now() };
    this.conversationHistory.push(userMsg);
    if (this.conversationHistory.length > MAX_HISTORY) {
      this.conversationHistory = this.conversationHistory.slice(-MAX_HISTORY);
    }
    this.onMessage?.(userMsg);

    // Process through backend
    await this.processCommand(text.trim());
  }

  // Process a command (can be called from voice or text input)
  async processCommand(text) {
    this._setState('processing');
    console.log('🎙️ ProcessCommand called:', text);

    try {
      console.log('📤 Sending to backend:', { text, historyLength: this.conversationHistory.length });
      const { data } = await api.post('/assistant/command', {
        text,
        conversationHistory: this.conversationHistory.slice(-8)
      });

      console.log('📥 Backend response:', data);
      const assistantMsg = {
        role: 'assistant',
        content: data.response,
        timestamp: Date.now(),
        intent: data.intent,
        action: data.action,
        navigateTo: data.navigateTo,
        success: data.success
      };

      this.conversationHistory.push(assistantMsg);
      if (this.conversationHistory.length > MAX_HISTORY) {
        this.conversationHistory = this.conversationHistory.slice(-MAX_HISTORY);
      }
      this.onMessage?.(assistantMsg);

      // Speak the response
      await this.speakResponse(data.response);

      // Execute navigation if needed
      if (data.action === 'NAVIGATE' && data.navigateTo) {
        this.onNavigate?.(data.navigateTo);
      }
    } catch (err) {
      const errorMsg = {
        role: 'assistant',
        content: 'I couldn\'t complete that request right now. Please try again or type your question.',
        timestamp: Date.now(),
        success: false
      };
      this.conversationHistory.push(errorMsg);
      this.onMessage?.(errorMsg);
      await this.speakResponse(errorMsg.content);
    }
  }

  // Speak a response
  async speakResponse(text, options = {}) {
    if (!text) return;
    this._setState('speaking');
    const speakText = this.normalizeSpeechText(text);
    await speechService.speak(speakText, options);
    if (!options.restartListening) {
      this._setState('idle');
    }
  }

  // Set language
  setLanguage(langCode) {
    speechService.setLanguage(langCode);
  }

  getLanguages() {
    return speechService.getLanguages();
  }

  // Clear conversation
  clearHistory() {
    this.conversationHistory = [];
  }

  // Check browser support
  isSupported() {
    return speechService.isSupported();
  }

  isTTSSupported() {
    return speechService.isTTSSupported();
  }
}

const assistantService = new AssistantService();
export default assistantService;
