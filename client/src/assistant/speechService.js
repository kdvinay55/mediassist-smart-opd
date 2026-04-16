// Speech Service — Whisper transcription + Porcupine wake word + Web Speech API TTS
// Falls back to Web Speech API recognition if Whisper endpoint is unavailable

import api from '../lib/api';

const SUPPORTED_LANGUAGES = [
  { code: 'en-US', label: 'English' },
  { code: 'ta-IN', label: 'Tamil' },
  { code: 'hi-IN', label: 'Hindi' }
];

const WAKE_PHRASE = 'hey medi';

// Porcupine access key — set via VITE_PORCUPINE_ACCESS_KEY env variable
const PORCUPINE_ACCESS_KEY = import.meta.env.VITE_PORCUPINE_ACCESS_KEY || '';
// Built-in keyword (custom "hey medi" can be trained at console.picovoice.ai)
const PORCUPINE_KEYWORD = import.meta.env.VITE_PORCUPINE_KEYWORD || 'jarvis';

class SpeechService {
  constructor() {
    this.recognition = null;
    this.synthesis = window.speechSynthesis;
    this.isListening = false;
    this.isSpeaking = false;
    this.language = 'en-US';
    this.onResult = null;
    this.onInterim = null;
    this.onStateChange = null;
    this.onWakeWord = null;
    this.onError = null;
    this.wakeWordMode = false;
    this.voices = [];
    this._currentUtterance = null;

    // Whisper recording state
    this._mediaRecorder = null;
    this._audioChunks = [];
    this._audioStream = null;
    this._silenceTimer = null;
    this._analyser = null;
    this._audioContext = null;
    this._silenceThreshold = 15;
    this._silenceDuration = 1800; // ms of silence before auto-stop

    // Porcupine state
    this._porcupine = null;
    this._porcupineReady = false;

    // Load voices for TTS
    if (this.synthesis) {
      this.voices = this.synthesis.getVoices();
      this.synthesis.onvoiceschanged = () => {
        this.voices = this.synthesis.getVoices();
      };
    }

    // Initialize Porcupine if access key is set
    if (PORCUPINE_ACCESS_KEY) {
      this._initPorcupine();
    }
  }

  // ─── Porcupine Wake Word Detection ───

  async _initPorcupine() {
    try {
      const { PorcupineWorker } = await import('@picovoice/porcupine-web');

      const keywordDetectionCallback = (detection) => {
        if (detection.index >= 0) {
          console.log('🎤 Porcupine wake word detected!');
          this.wakeWordMode = false;
          this.onWakeWord?.('');
          // Start Whisper recording after wake word
          this._startWhisperRecording();
        }
      };

      this._porcupine = await PorcupineWorker.create(
        PORCUPINE_ACCESS_KEY,
        { builtin: PORCUPINE_KEYWORD },
        keywordDetectionCallback
      );

      this._porcupineReady = true;
      console.log('✅ Porcupine wake word ready (keyword:', PORCUPINE_KEYWORD + ')');
    } catch (err) {
      console.warn('⚠️ Porcupine init failed, falling back to Web Speech API:', err.message);
      this._porcupineReady = false;
    }
  }

  async _startPorcupineListening() {
    if (!this._porcupineReady || !this._porcupine) return false;
    try {
      await this._porcupine.start();
      return true;
    } catch (err) {
      console.warn('Porcupine start failed:', err.message);
      return false;
    }
  }

  async _stopPorcupineListening() {
    if (this._porcupine) {
      try { await this._porcupine.stop(); } catch { /* ignore */ }
    }
  }

  // ─── Whisper Audio Recording ───

  async _startWhisperRecording() {
    try {
      this._audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Audio analysis for silence detection
      this._audioContext = new AudioContext();
      const source = this._audioContext.createMediaStreamSource(this._audioStream);
      this._analyser = this._audioContext.createAnalyser();
      this._analyser.fftSize = 512;
      source.connect(this._analyser);

      // Start MediaRecorder
      this._audioChunks = [];
      this._mediaRecorder = new MediaRecorder(this._audioStream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm'
      });

      this._mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this._audioChunks.push(e.data);
      };

      this._mediaRecorder.onstop = async () => {
        this._cleanupRecording();
        if (this._audioChunks.length === 0) return;

        const audioBlob = new Blob(this._audioChunks, { type: 'audio/webm' });
        this._audioChunks = [];

        // Send to Whisper
        this.onInterim?.('Transcribing...');
        const text = await this._transcribeWithWhisper(audioBlob);
        this.onInterim?.('');

        if (text && text.trim()) {
          if (this.wakeWordMode) {
            const lower = text.toLowerCase();
            if (lower.includes(WAKE_PHRASE)) {
              const afterWake = lower.split(WAKE_PHRASE).pop().trim();
              this.wakeWordMode = false;
              this.onWakeWord?.(afterWake);
              if (afterWake) this.onResult?.(afterWake);
              return;
            }
            return;
          }
          this.onResult?.(text.trim());
        }
      };

      this._mediaRecorder.start(250);
      this.isListening = true;
      this.onStateChange?.(this.wakeWordMode ? 'wake-listening' : 'listening');

      this._startSilenceDetection();
    } catch (err) {
      console.error('Whisper recording failed:', err);
      this.onError?.('Microphone access denied or unavailable');
      // Fallback to Web Speech API
      this._startWebSpeechRecognition(this.wakeWordMode);
    }
  }

  _startSilenceDetection() {
    if (!this._analyser) return;
    const dataArray = new Uint8Array(this._analyser.fftSize);
    let silentSince = null;

    const check = () => {
      if (!this._mediaRecorder || this._mediaRecorder.state !== 'recording') return;

      this._analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const val = (dataArray[i] - 128) / 128;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / dataArray.length) * 100;

      if (rms < this._silenceThreshold) {
        if (!silentSince) silentSince = Date.now();
        if (Date.now() - silentSince > this._silenceDuration) {
          this._stopWhisperRecording();
          return;
        }
      } else {
        silentSince = null;
      }

      this._silenceTimer = requestAnimationFrame(check);
    };

    this._silenceTimer = requestAnimationFrame(check);
  }

  _stopWhisperRecording() {
    if (this._silenceTimer) {
      cancelAnimationFrame(this._silenceTimer);
      this._silenceTimer = null;
    }
    if (this._mediaRecorder && this._mediaRecorder.state === 'recording') {
      this._mediaRecorder.stop();
    }
  }

  _cleanupRecording() {
    if (this._silenceTimer) {
      cancelAnimationFrame(this._silenceTimer);
      this._silenceTimer = null;
    }
    if (this._audioStream) {
      this._audioStream.getTracks().forEach(t => t.stop());
      this._audioStream = null;
    }
    if (this._audioContext) {
      try { this._audioContext.close(); } catch { /* ignore */ }
      this._audioContext = null;
    }
    this._mediaRecorder = null;
    this._analyser = null;
  }

  async _transcribeWithWhisper(audioBlob) {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const response = await api.post('/transcribe', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000
      });

      return response.data?.text || null;
    } catch (err) {
      console.error('Whisper transcription failed:', err.message);
      return null;
    }
  }

  // ─── Web Speech API (Fallback Recognition) ───

  isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition) || !!navigator.mediaDevices;
  }

  isTTSSupported() {
    return !!window.speechSynthesis;
  }

  _initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = this.language;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (this.wakeWordMode) {
        const combined = (finalTranscript + interimTranscript).toLowerCase();
        if (combined.includes(WAKE_PHRASE)) {
          const afterWake = combined.split(WAKE_PHRASE).pop().trim();
          this.wakeWordMode = false;
          this.onWakeWord?.(afterWake);
          if (afterWake) this.onResult?.(afterWake);
          return;
        }
        this.onInterim?.(interimTranscript);
        return;
      }

      if (interimTranscript) this.onInterim?.(interimTranscript);
      if (finalTranscript) this.onResult?.(finalTranscript.trim());
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      this.onError?.(event.error);
    };

    recognition.onend = () => {
      if (this.isListening && this.recognition) {
        try { this.recognition.start(); } catch { /* Already started */ }
      }
    };

    return recognition;
  }

  _startWebSpeechRecognition(wakeWordMode) {
    this.wakeWordMode = wakeWordMode;
    this.recognition = this._initRecognition();
    if (!this.recognition) return false;

    try {
      this.recognition.start();
      this.isListening = true;
      this.onStateChange?.(wakeWordMode ? 'wake-listening' : 'listening');
      return true;
    } catch {
      return false;
    }
  }

  // ─── Public API ───

  startListening(wakeWordMode = false) {
    this.stopSpeaking();
    this.wakeWordMode = wakeWordMode;

    // Wake word: use Porcupine if available
    if (wakeWordMode && this._porcupineReady) {
      this._startPorcupineListening();
      this.isListening = true;
      this.onStateChange?.('wake-listening');
      return true;
    }

    // Active listening: use Whisper via MediaRecorder
    if (!wakeWordMode && navigator.mediaDevices) {
      this._startWhisperRecording();
      return true;
    }

    // Fallback: Web Speech API
    return this._startWebSpeechRecognition(wakeWordMode);
  }

  stopListening() {
    this.isListening = false;
    this.wakeWordMode = false;

    this._stopPorcupineListening();
    this._stopWhisperRecording();
    this._cleanupRecording();

    if (this.recognition) {
      try { this.recognition.stop(); } catch { /* ignore */ }
      this.recognition = null;
    }

    this.onStateChange?.('idle');
  }

  // ─── Text-to-Speech (Web Speech API) ───

  speak(text, options = {}) {
    return new Promise((resolve) => {
      if (!this.isTTSSupported() || !text) {
        resolve();
        return;
      }

      const wasListening = this.isListening;
      if (wasListening) this.stopListening();

      this.synthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.language;
      utterance.rate = options.rate || 1.0;
      utterance.pitch = options.pitch || 1.0;
      utterance.volume = options.volume || 1.0;

      const voice = this._pickVoice();
      if (voice) utterance.voice = voice;

      this._currentUtterance = utterance;
      this.isSpeaking = true;
      this.onStateChange?.('speaking');

      utterance.onend = () => {
        this.isSpeaking = false;
        this._currentUtterance = null;
        this.onStateChange?.('idle');
        if (options.restartListening) this.startListening(false);
        resolve();
      };

      utterance.onerror = () => {
        this.isSpeaking = false;
        this._currentUtterance = null;
        this.onStateChange?.('idle');
        if (options.restartListening) this.startListening(false);
        resolve();
      };

      this.synthesis.speak(utterance);
    });
  }

  stopSpeaking() {
    if (this.synthesis) this.synthesis.cancel();
    this.isSpeaking = false;
    this._currentUtterance = null;
  }

  _pickVoice() {
    if (this.voices.length === 0) return null;
    const langPrefix = this.language.split('-')[0];
    const preferred = this.voices.find(v => v.lang.startsWith(langPrefix) && v.name.includes('Google'));
    if (preferred) return preferred;
    const match = this.voices.find(v => v.lang.startsWith(langPrefix));
    if (match) return match;
    return this.voices.find(v => v.lang.startsWith('en'));
  }

  setLanguage(langCode) {
    this.language = langCode;
    if (this.isListening) {
      this.stopListening();
      this.startListening(this.wakeWordMode);
    }
  }

  getLanguages() {
    return SUPPORTED_LANGUAGES;
  }
}

const speechService = new SpeechService();
export default speechService;
