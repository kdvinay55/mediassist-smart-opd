import { ASSISTANT_DEMO_MODE, TTS_ENGINE } from './config';

const DEFAULT_TTS_VOICE = import.meta.env.VITE_OPENAI_TTS_VOICE || 'alloy';

export default class VoiceOutputService {
  constructor({ apiClient, onStart, onEnd, onError, logger, telemetry, demoMode = ASSISTANT_DEMO_MODE } = {}) {
    this.apiClient = apiClient;
    this.onStart = onStart;
    this.onEnd = onEnd;
    this.onError = onError;
    this.logger = logger;
    this.telemetry = telemetry;
    this.demoMode = demoMode;
    this.engine = TTS_ENGINE;
    this.speaking = false;
    this.currentAudio = null;
    this.currentObjectUrl = null;
    this.currentResolve = null;
    this.requestController = null;
    this.playbackToken = 0;
    this.currentUtterance = null;
  }

  setDemoMode(enabled) {
    this.demoMode = Boolean(enabled);
  }

  canUseBrowserSpeech() {
    return typeof window !== 'undefined' && Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance);
  }

  async speakWithBrowser(text, options, finish, finalizeLatency) {
    if (!this.canUseBrowserSpeech()) {
      return false;
    }

    finalizeLatency({ success: true, fallback: 'browser-speech-synthesis' });

    this.currentUtterance = new SpeechSynthesisUtterance(text);
    this.currentUtterance.lang = options.language || 'en';
    this.currentUtterance.rate = options.speed || 1.0;
    this.currentUtterance.onend = () => {
      this.currentUtterance = null;
      finish({ notifyEnd: true });
    };
    this.currentUtterance.onerror = () => {
      const error = new Error('Browser speech synthesis failed');
      error.assistantStage = 'tts';
      this.currentUtterance = null;
      finish({ error });
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(this.currentUtterance);
    return true;
  }

  async speak(text, options = {}) {
    if (!text) return;

    await this.stop();
    const token = this.playbackToken;
    this.speaking = true;
    this.logger?.('voice_output_start', { engine: this.engine, chars: text.length, options });
    this.onStart?.();

    return new Promise((resolve) => {
      this.currentResolve = resolve;
      let ttsSpan = this.telemetry?.startSpan('tts_latency', {
        source: 'voice_output',
        language: options.language || 'en',
        chars: text.length
      });

      const finalizeLatency = (meta = {}) => {
        if (!ttsSpan) return;
        this.telemetry?.finishSpan(ttsSpan, {
          source: 'voice_output',
          language: options.language || 'en',
          chars: text.length,
          ...meta
        });
        ttsSpan = null;
      };

      const finish = ({ error, notifyEnd = false } = {}) => {
        const pendingResolve = this.currentResolve;
        this.currentResolve = null;
        this.requestController = null;
        this.cleanupPlayback();
        this.speaking = false;
        if (error) {
          this.logger?.('voice_output_error', { engine: this.engine, error: error.message });
          this.onError?.(error);
        } else if (notifyEnd) {
          this.onEnd?.();
        }
        pendingResolve?.();
      };

      this.requestController = new AbortController();

      void (async () => {
        try {
          let response = null;

          for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
              response = await this.apiClient.post(
                '/tts',
                {
                  text,
                  voice: options.voice || DEFAULT_TTS_VOICE,
                  format: 'mp3',
                  speed: options.speed || 1.15,
                  language: options.language || 'en'
                },
                {
                  responseType: 'blob',
                  timeout: 30000,
                  signal: this.requestController.signal
                }
              );
              break;
            } catch (error) {
              if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') {
                throw error;
              }
              this.logger?.('voice_output_retry', { engine: this.engine, attempt, error: error.message });
              if (attempt >= 2) {
                throw error;
              }
            }
          }

          if (token !== this.playbackToken) {
            finish();
            return;
          }

          if (!response?.data || response.data.size === 0) {
            throw new Error('Empty audio response');
          }

          finalizeLatency({ success: true });
          this.currentObjectUrl = URL.createObjectURL(response.data);
          this.currentAudio = new Audio(this.currentObjectUrl);
          this.currentAudio.onended = () => finish({ notifyEnd: true });
          this.currentAudio.onerror = () => finish({ error: new Error('Audio playback failed') });

          await this.currentAudio.play();

          if (token !== this.playbackToken) {
            finish();
          }
        } catch (error) {
          if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || token !== this.playbackToken) {
            if (ttsSpan) {
              this.telemetry?.discardSpan(ttsSpan);
              ttsSpan = null;
            }
            finish();
            return;
          }
          error.assistantStage = 'tts';
          if (this.demoMode && this.canUseBrowserSpeech()) {
            const spoken = await this.speakWithBrowser(text, options, finish, finalizeLatency);
            if (spoken) {
              return;
            }
          }
          finalizeLatency({ success: false });
          finish({ error });
        }
      })();
    });
  }

  async stop() {
    this.playbackToken += 1;
    if (this.requestController) {
      try {
        this.requestController.abort();
      } catch {}
    }
    if (this.currentAudio) {
      try {
        this.currentAudio.onended = null;
        this.currentAudio.onerror = null;
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {}
    }
    if (this.currentUtterance && typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    const pendingResolve = this.currentResolve;
    this.currentResolve = null;
    this.requestController = null;
    this.currentUtterance = null;
    this.cleanupPlayback();
    this.speaking = false;
    this.logger?.('voice_output_stop', { engine: this.engine });
    pendingResolve?.();
  }

  isSpeaking() {
    return this.speaking;
  }

  cleanupPlayback() {
    if (this.currentObjectUrl) {
      try {
        URL.revokeObjectURL(this.currentObjectUrl);
      } catch {}
    }
    this.currentAudio = null;
    this.currentObjectUrl = null;
  }
}
