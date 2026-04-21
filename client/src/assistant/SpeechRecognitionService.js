import { ASSISTANT_DEMO_MODE, SUPPORTED_LANGUAGES, TRANSCRIPTION_ENGINE } from './config';

function clampConfidence(value, fallback = 0.75) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

function defaultTranslationMode(language) {
  return String(language || 'en').slice(0, 2).toLowerCase() === 'en'
    ? 'native'
    : 'same_language_response';
}

function isMicrophoneBusyError(error) {
  return ['AbortError', 'NotReadableError', 'TrackStartError'].includes(error?.name);
}

// Voice Activity Detection thresholds
const VAD_RMS_THRESHOLD = 0.018;     // ~speech vs background noise
const VAD_SILENCE_HANGOVER_MS = 800;  // stop 800ms after speech ends
const VAD_MIN_SPEECH_MS = 400;        // ignore short clicks
const VAD_POLL_MS = 80;

export default class SpeechRecognitionService {
  constructor({ apiClient, onTranscription, onError, onSilenceDetected, logger, telemetry, demoMode = ASSISTANT_DEMO_MODE } = {}) {
    this.apiClient = apiClient;
    this.onTranscription = onTranscription;
    this.onError = onError;
    this.onSilenceDetected = onSilenceDetected;
    this.logger = logger;
    this.telemetry = telemetry;
    this.demoMode = demoMode;
    this.engine = TRANSCRIPTION_ENGINE;
    this.recording = false;
    this.requestInFlight = false;
    this.detectedLanguage = 'en';
    this.last_language = 'en';
    this.confidence_score = 1;
    this.translation_mode = 'native';
    this.detection_mode = 'default';

    this.mediaRecorder = null;
    this.audioChunks = [];
    this.audioStream = null;
    this.requestController = null;
    this.browserRecognition = null;
    this.browserTranscriptionPromise = null;
    this.resolveBrowserTranscription = null;
    this.browserTranscriptionSpan = null;

    // VAD state
    this.audioContext = null;
    this.analyser = null;
    this.vadSourceNode = null;
    this.vadInterval = null;
    this.vadStartedAt = 0;
    this.vadLastSpeechAt = 0;
    this.vadSpeechDetected = false;
  }

  startSilenceDetection() {
    if (typeof window === 'undefined' || !this.audioStream) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      this.audioContext = new Ctx();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.vadSourceNode = this.audioContext.createMediaStreamSource(this.audioStream);
      this.vadSourceNode.connect(this.analyser);
      const buf = new Float32Array(this.analyser.fftSize);
      this.vadStartedAt = Date.now();
      this.vadLastSpeechAt = 0;
      this.vadSpeechDetected = false;
      this.vadInterval = window.setInterval(() => {
        if (!this.analyser) return;
        this.analyser.getFloatTimeDomainData(buf);
        let sumSq = 0;
        for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
        const rms = Math.sqrt(sumSq / buf.length);
        const now = Date.now();
        if (rms > VAD_RMS_THRESHOLD) {
          this.vadLastSpeechAt = now;
          this.vadSpeechDetected = true;
        }
        if (this.vadSpeechDetected
          && (now - this.vadLastSpeechAt) > VAD_SILENCE_HANGOVER_MS
          && (this.vadLastSpeechAt - this.vadStartedAt) > VAD_MIN_SPEECH_MS) {
          this.stopSilenceDetection();
          this.logger?.('vad_silence_detected', { speechMs: this.vadLastSpeechAt - this.vadStartedAt });
          this.onSilenceDetected?.();
        }
      }, VAD_POLL_MS);
    } catch (error) {
      this.logger?.('vad_init_failed', { error: error.message });
    }
  }

  stopSilenceDetection() {
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    try { this.vadSourceNode?.disconnect(); } catch {}
    try { this.analyser?.disconnect(); } catch {}
    try { this.audioContext?.close(); } catch {}
    this.vadSourceNode = null;
    this.analyser = null;
    this.audioContext = null;
    this.vadSpeechDetected = false;
  }

  getSupportedLanguages() {
    return SUPPORTED_LANGUAGES;
  }

  setDemoMode(enabled) {
    this.demoMode = Boolean(enabled);
  }

  setLanguageContext({
    lastLanguage,
    last_language,
    confidenceScore,
    confidence_score,
    translationMode,
    translation_mode,
    detectionMode,
    detection_mode
  } = {}) {
    const language = String(last_language || lastLanguage || this.last_language || this.detectedLanguage || 'en').slice(0, 2).toLowerCase();
    this.detectedLanguage = language;
    this.last_language = language;
    this.confidence_score = clampConfidence(confidence_score ?? confidenceScore, this.confidence_score);
    this.translation_mode = translation_mode || translationMode || this.translation_mode || defaultTranslationMode(language);
    this.detection_mode = detection_mode || detectionMode || this.detection_mode;
  }

  browserSpeechSupported() {
    return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  localeForLanguage(code) {
    return SUPPORTED_LANGUAGES.find((entry) => entry.code === code)?.locale || 'en-US';
  }

  async startBrowserSpeechRecognition() {
    const BrowserSpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!BrowserSpeechRecognition) {
      return false;
    }

    const recognition = new BrowserSpeechRecognition();
    recognition.lang = this.localeForLanguage(this.last_language || this.detectedLanguage || 'en');
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    this.browserRecognition = recognition;
    this.browserTranscriptionSpan = this.telemetry?.startSpan('transcription_latency', { source: 'browser_transcription' });
    this.browserTranscriptionPromise = new Promise((resolve) => {
      this.resolveBrowserTranscription = resolve;
    });

    recognition.onresult = (event) => {
      const text = Array.from(event.results || [])
        .map((result) => result?.[0]?.transcript || '')
        .join(' ')
        .trim();
      const language = (recognition.lang || 'en').slice(0, 2).toLowerCase();
      this.setLanguageContext({
        last_language: language,
        confidence_score: 0.7,
        translation_mode: defaultTranslationMode(language),
        detection_mode: 'browser_locale'
      });
      this.telemetry?.finishSpan(this.browserTranscriptionSpan, {
        source: 'browser_transcription',
        language,
        chars: text.length,
        success: Boolean(text)
      });
      this.telemetry?.recordLanguageDetection({
        languageDetected: language,
        confidenceScore: 0.7,
        translationMode: this.translation_mode,
        detectionMode: this.detection_mode,
        transcriptionResult: text,
        source: 'browser_transcription'
      });
      this.browserTranscriptionSpan = null;
      this.resolveBrowserTranscription?.({
        text,
        language,
        duration: null,
        confidenceScore: this.confidence_score,
        confidence_score: this.confidence_score,
        translationMode: this.translation_mode,
        translation_mode: this.translation_mode,
        detectionMode: this.detection_mode,
        detection_mode: this.detection_mode
      });
      this.resolveBrowserTranscription = null;
    };

    recognition.onerror = (event) => {
      const error = new Error(event?.error || 'Browser speech recognition failed');
      error.assistantStage = 'transcription';
      this.telemetry?.finishSpan(this.browserTranscriptionSpan, {
        source: 'browser_transcription',
        success: false
      });
      this.browserTranscriptionSpan = null;
      this.onError?.(error);
      this.resolveBrowserTranscription?.(null);
      this.resolveBrowserTranscription = null;
    };

    recognition.onend = () => {
      this.recording = false;
    };

    recognition.start();
    this.recording = true;
    this.logger?.('speech_recording_start', { engine: 'browser-speech-recognition' });
    return true;
  }

  async startRecording() {
    if (this.recording || this.requestInFlight) {
      this.telemetry?.recordDuplicateRequest({ source: 'speech_recording_start' });
      return false;
    }

    if (this.demoMode && this.browserSpeechSupported()) {
      return this.startBrowserSpeechRecognition();
    }

    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(this.audioStream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm'
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(200);
      this.recording = true;
      this.startSilenceDetection();
      this.logger?.('speech_recording_start', { engine: this.engine });
      return true;
    } catch (error) {
      if (isMicrophoneBusyError(error)) {
        this.telemetry?.recordMicrophoneConflict({ source: 'speech_recording_start', error: error.message });
      }
      this.logger?.('speech_recording_error', { engine: this.engine, error: error.message });
      this.onError?.(error);
      await this.stopRecording();
      return false;
    }
  }

  async stopRecording() {
    if (this.browserRecognition) {
      const recognition = this.browserRecognition;
      this.browserRecognition = null;
      try {
        recognition.stop();
      } catch {}
      const result = await this.browserTranscriptionPromise;
      this.browserTranscriptionPromise = null;
      this.logger?.('speech_recording_stop', { engine: 'browser-speech-recognition' });
      if (result?.text) {
        this.onTranscription?.(result);
      }
      return result;
    }

    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
      this.recording = false;
      this.releaseMedia();
      return null;
    }

    const result = await new Promise((resolve) => {
      this.mediaRecorder.onstop = async () => {
        this.recording = false;
        this.logger?.('speech_recording_stop', { engine: this.engine });
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.audioChunks = [];
        this.releaseMedia();
        const transcription = await this.transcribe(blob);
        resolve(transcription);
      };
      this.mediaRecorder.stop();
    });

    return result;
  }

  async cancelRecording() {
    if (this.requestInFlight && this.requestController) {
      try {
        this.requestController.abort();
      } catch {}
    }

    if (this.browserRecognition) {
      try {
        this.browserRecognition.onresult = null;
        this.browserRecognition.onerror = null;
        this.browserRecognition.stop();
      } catch {}
      this.browserRecognition = null;
      this.recording = false;
      if (this.browserTranscriptionSpan) {
        this.telemetry?.discardSpan(this.browserTranscriptionSpan);
        this.browserTranscriptionSpan = null;
      }
      this.resolveBrowserTranscription?.(null);
      this.resolveBrowserTranscription = null;
      this.browserTranscriptionPromise = null;
      return;
    }

    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
      this.recording = false;
      this.audioChunks = [];
      this.releaseMedia();
      return;
    }

    this.mediaRecorder.onstop = null;
    this.mediaRecorder.stop();
    this.recording = false;
    this.audioChunks = [];
    this.releaseMedia();
    this.logger?.('speech_recording_cancelled', { engine: this.engine });
  }

  isRecording() {
    return this.recording;
  }

  async transcribe(audioBlob) {
    if (!audioBlob || this.requestInFlight) {
      this.telemetry?.recordDuplicateRequest({ source: 'speech_transcription' });
      return null;
    }

    this.requestInFlight = true;
    this.requestController = new AbortController();
    const transcriptionSpan = this.telemetry?.startSpan('transcription_latency', { source: 'speech_transcription' });
    try {
      let lastError = null;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, 'assistant-command.webm');
          // Intentionally NOT sending languageHint: Whisper auto-detects each turn.
          // Sending a stale hint causes Tamil audio to be transcribed as Telugu (and vice versa)
          // when the previous turn was in a different Dravidian language.
          formData.append('confidenceScore', String(this.confidence_score));
          formData.append('translationMode', this.translation_mode || defaultTranslationMode(this.last_language));
          const response = await this.apiClient.post('/transcribe', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 30000,
            signal: this.requestController.signal
          });
          const text = response?.data?.text?.trim() || '';
          const language = response?.data?.language || 'en';
          const confidenceScore = response?.data?.confidenceScore ?? response?.data?.confidence_score ?? 0.75;
          const translationMode = response?.data?.translationMode || response?.data?.translation_mode || defaultTranslationMode(language);
          const detectionMode = response?.data?.detectionMode || response?.data?.detection_mode || 'automatic';
          this.setLanguageContext({
            last_language: language,
            confidence_score: confidenceScore,
            translation_mode: translationMode,
            detection_mode: detectionMode
          });
          this.telemetry?.finishSpan(transcriptionSpan, {
            source: 'speech_transcription',
            language,
            chars: text.length,
            success: Boolean(text)
          });
          this.telemetry?.recordLanguageDetection({
            languageDetected: language,
            confidenceScore: this.confidence_score,
            translationMode: this.translation_mode,
            detectionMode: this.detection_mode,
            transcriptionResult: text,
            source: 'speech_transcription'
          });
          this.logger?.('speech_transcribed', { engine: this.engine, language, chars: text.length, attempt });
          if (text) {
            this.onTranscription?.({
              text,
              language,
              duration: response?.data?.duration || null,
              confidenceScore: this.confidence_score,
              confidence_score: this.confidence_score,
              translationMode: this.translation_mode,
              translation_mode: this.translation_mode,
              detectionMode: this.detection_mode,
              detection_mode: this.detection_mode
            });
          }
          return {
            text,
            language,
            duration: response?.data?.duration || null,
            confidenceScore: this.confidence_score,
            confidence_score: this.confidence_score,
            translationMode: this.translation_mode,
            translation_mode: this.translation_mode,
            detectionMode: this.detection_mode,
            detection_mode: this.detection_mode
          };
        } catch (error) {
          if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') {
            throw error;
          }
          lastError = error;
          this.logger?.('speech_transcription_retry', { engine: this.engine, attempt, error: error.message });
          if (attempt >= 3) {
            throw lastError;
          }
        }
      }

      return null;
    } catch (error) {
      if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') {
        this.telemetry?.discardSpan(transcriptionSpan);
        return null;
      }
      error.assistantStage = 'transcription';
      this.telemetry?.finishSpan(transcriptionSpan, {
        source: 'speech_transcription',
        success: false
      });
      this.logger?.('speech_transcription_error', { engine: this.engine, error: error.message });
      this.onError?.(error);
      return null;
    } finally {
      this.requestInFlight = false;
      this.requestController = null;
    }
  }

  releaseMedia() {
    this.stopSilenceDetection();
    if (this.audioStream) {
      this.audioStream.getTracks().forEach((track) => track.stop());
    }
    this.audioStream = null;
    this.mediaRecorder = null;
    this.browserRecognition = null;
  }
}
