import { WAKE_ENGINE, WAKE_PHRASE } from './config';

const VOSK_MODEL_URL = import.meta.env.VITE_VOSK_MODEL_URL || '';

function normalizeWakeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMicrophoneBusyError(error) {
  return ['AbortError', 'NotReadableError', 'TrackStartError'].includes(error?.name);
}

export default class WakeWordService {
  constructor({ onWakeWord, onError, logger, telemetry } = {}) {
    this.onWakeWord = onWakeWord;
    this.onError = onError;
    this.logger = logger;
    this.telemetry = telemetry;
    this.engine = WAKE_ENGINE;
    this.phrase = normalizeWakeText(WAKE_PHRASE);
    this.active = false;
    this.starting = false;
    this.wakeTriggered = false;

    this.model = null;
    this.recognizer = null;
    this.audioContext = null;
    this.audioNode = null;
    this.stream = null;
  }

  async ensureModel() {
    if (this.model) return this.model;
    if (!VOSK_MODEL_URL) {
      throw new Error('VITE_VOSK_MODEL_URL is not configured');
    }
    const { createModel } = await import('vosk-browser');
    this.model = await createModel(VOSK_MODEL_URL);
    this.logger?.('wake_word_model_ready', { engine: this.engine, phrase: this.phrase });
    return this.model;
  }

  async start() {
    if (this.active || this.starting) {
      this.telemetry?.recordDuplicateRequest({ source: 'wake_word_start' });
      return false;
    }

    if (!VOSK_MODEL_URL) {
      // Wake word engine isn't configured for this build — skip silently so the
      // user can still tap the mic to talk. No error, no state machine fail.
      this.logger?.('wake_word_disabled', { engine: this.engine, reason: 'no_model_url' });
      return false;
    }

    this.starting = true;
    this.wakeTriggered = false;

    try {
      await this.ensureModel();

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      this.recognizer = new this.model.KaldiRecognizer(this.audioContext.sampleRate);
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.audioNode = this.audioContext.createScriptProcessor(4096, 1, 1);

      const handleTranscript = (value, mode) => {
        if (!this.active || this.wakeTriggered) return;
        const normalized = normalizeWakeText(value);
        if (!normalized || !normalized.includes(this.phrase)) return;

        this.wakeTriggered = true;
        this.logger?.('wake_word_detected', { engine: this.engine, mode, text: normalized });
        this.onWakeWord?.();
      };

      this.recognizer.on('result', (payload) => {
        handleTranscript(payload?.result?.text, 'final');
      });
      this.recognizer.on('partialresult', (payload) => {
        handleTranscript(payload?.result?.partial, 'partial');
      });

      this.audioNode.onaudioprocess = (event) => {
        if (!this.recognizer || !this.active) return;
        try {
          this.recognizer.acceptWaveform(event.inputBuffer);
        } catch (error) {
          this.logger?.('wake_word_audio_error', { error: error.message });
        }
      };

      source.connect(this.audioNode);
      this.audioNode.connect(this.audioContext.destination);
      this.active = true;
      this.logger?.('wake_word_start', { engine: this.engine, phrase: this.phrase });
      return true;
    } catch (error) {
      error.assistantStage = 'wake_word';
      if (isMicrophoneBusyError(error)) {
        this.telemetry?.recordMicrophoneConflict({ source: 'wake_word_start', error: error.message });
      }
      this.logger?.('wake_word_error', { engine: this.engine, error: error.message });
      this.onError?.(error);
      await this.stop();
      return false;
    } finally {
      this.starting = false;
    }
  }

  async stop() {
    this.active = false;
    this.starting = false;
    this.wakeTriggered = false;

    try {
      if (this.audioNode) {
        this.audioNode.disconnect();
      }
    } catch {}

    try {
      if (this.audioContext) {
        await this.audioContext.close();
      }
    } catch {}

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
    }

    this.audioNode = null;
    this.audioContext = null;
    this.recognizer = null;
    this.stream = null;
    this.logger?.('wake_word_stop', { engine: this.engine });
  }

  isActive() {
    return this.active;
  }
}
