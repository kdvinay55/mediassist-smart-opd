import api, { buildApiUrl, getStoredAuthToken } from '../lib/api';
import AssistantStateMachine from './AssistantStateMachine';
import AssistantTelemetry from './AssistantTelemetry';
import AudioSessionLock, { AUDIO_SESSION_OWNERS } from './AudioSessionLock';
import LanguageSessionMemory, { defaultTranslationModeForLanguage, normalizeLanguageCode } from './LanguageSessionMemory';
import WakeWordService from './WakeWordService';
import SpeechRecognitionService from './SpeechRecognitionService';
import VoiceOutputService from './VoiceOutputService';
import buildDemoAssistantResponse from './DemoAssistantEngine';
import {
  ASSISTANT_DEMO_MODE,
  ASSISTANT_STREAMING_ENABLED,
  LANGUAGE_CONFIDENCE_THRESHOLD,
  ASSISTANT_RECOVERY_LIMITS,
  ASSISTANT_SESSION_TIMEOUT_MS,
  ASSISTANT_STATUS_EVENT_NAME,
  ASSISTANT_STATES,
  INTENT_CONFIDENCE_THRESHOLD
} from './config';

const GREETING = 'Hi, how can I help you?';
const FALLBACK_MESSAGE = "I'm sorry, I didn't understand. Please try again.";
const MAX_HISTORY = 10;
const RECORDING_TIMEOUT_MS = 7000;
const LANGUAGE_SCRIPTS = Object.freeze({
  te: /[\u0C00-\u0C7F]/,
  hi: /[\u0900-\u097F]/,
  ta: /[\u0B80-\u0BFF]/,
  kn: /[\u0C80-\u0CFF]/,
  ml: /[\u0D00-\u0D7F]/,
  en: /[A-Za-z]/
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function uniqueValues(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function readableStage(stage) {
  return String(stage || 'assistant').replace(/_/g, ' ');
}

function clampConfidence(value, fallback = 0.8) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

function textShowsTargetLanguage(text, language) {
  const normalizedLanguage = normalizeLanguageCode(language || 'en');
  const matcher = LANGUAGE_SCRIPTS[normalizedLanguage];
  return Boolean(matcher && matcher.test(String(text || '')));
}

function extractSpeechSegments(text, { force = false } = {}) {
  const buffer = String(text || '');
  if (!buffer.trim()) {
    return { segments: [], remainder: '' };
  }

  const segments = [];
  let startIndex = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    const char = buffer[index];
    if (/[.!?\n]/.test(char)) {
      const slice = buffer.slice(startIndex, index + 1).trim();
      if (slice) {
        segments.push(slice);
      }
      startIndex = index + 1;
    }
  }

  const remainder = buffer.slice(startIndex).trim();
  if (force && remainder) {
    segments.push(remainder);
    return { segments, remainder: '' };
  }

  return { segments, remainder };
}

async function* readNdjsonStream(body) {
  const reader = body?.getReader?.();
  if (!reader) {
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        yield JSON.parse(line);
      }
      newlineIndex = buffer.indexOf('\n');
    }
  }

  buffer += decoder.decode();
  const trailing = buffer.trim();
  if (trailing) {
    yield JSON.parse(trailing);
  }
}

function buildInitialSystemStatus(language) {
  return {
    startupVerified: false,
    startupChecking: false,
    assistantEnabled: true,
    voiceInputEnabled: true,
    demoModeConfigured: ASSISTANT_DEMO_MODE,
    demoModeActive: ASSISTANT_DEMO_MODE,
    demoReason: ASSISTANT_DEMO_MODE ? 'Demo mode is configured for expo-safe local fallback behavior.' : null,
    serverStatus: 'unknown',
    microphonePermission: 'unknown',
    statusMessage: ASSISTANT_DEMO_MODE ? 'Demo mode is configured.' : 'Assistant status not checked yet.',
    startupChecks: {},
    startupIssues: [],
    latencyAlerts: [],
    telemetrySnapshot: null,
    recoveryStage: null,
    recovering: false,
    sessionTimedOut: false,
    currentLanguage: language,
    lastUpdatedAt: new Date().toISOString()
  };
}

class AssistantRuntime {
  constructor() {
    this.conversationHistory = [];
    this.streamingMessage = null;
    this.recordingTimer = null;
    this.sessionTimeoutId = null;
    this.pendingCommandController = null;
    this.pendingWakeSpan = null;
    this.startupCheckPromise = null;
    this.statusInitialized = false;
    this.recoveryAttempts = {
      wake_word: 0,
      transcription: 0,
      tts: 0
    };

    this.onStateChange = null;
    this.onMessage = null;
    this.onError = null;
    this.onNavigate = null;

    this.languageMemory = new LanguageSessionMemory({ logger: this.log.bind(this) });
    const languageState = this.languageMemory.getState();
    this.sessionLanguage = languageState.last_language || languageState.lastLanguage || 'en';
    this.systemStatus = buildInitialSystemStatus(this.sessionLanguage);

    this.telemetry = new AssistantTelemetry({
      logger: this.log.bind(this),
      onUpdate: (snapshot) => this.handleTelemetryUpdate(snapshot),
      onAlert: (alert) => this.handleTelemetryAlert(alert)
    });

    this.audioLock = new AudioSessionLock({
      logger: this.log.bind(this),
      onConflict: (conflict) => this.handleAudioConflict(conflict)
    });

    this.stateMachine = new AssistantStateMachine({
      logger: this.log.bind(this),
      onStateChange: (nextState, previousState, meta) => this.onStateChange?.(nextState, previousState, meta)
    });

    this.wakeWordService = new WakeWordService({
      onWakeWord: () => this.handleWakeWord(),
      onError: (error) => this.handleError(error, { speakFallback: false }),
      logger: this.log.bind(this),
      telemetry: this.telemetry
    });
    this.speechRecognition = new SpeechRecognitionService({
      apiClient: api,
      onError: (error) => this.handleError(error, { speakFallback: false }),
      logger: this.log.bind(this),
      telemetry: this.telemetry,
      demoMode: ASSISTANT_DEMO_MODE
    });
    this.speechRecognition.setLanguageContext(languageState);
    this.voiceOutput = new VoiceOutputService({
      apiClient: api,
      onError: (error) => this.handleError(error, { speakFallback: false }),
      logger: this.log.bind(this),
      telemetry: this.telemetry,
      demoMode: ASSISTANT_DEMO_MODE
    });

    this.emitSystemStatus();
  }

  log(event, payload = {}) {
    try {
      console.log(JSON.stringify({ ts: new Date().toISOString(), assistant: event, ...payload }));
    } catch {
      console.log('assistant_event', event, payload);
    }
  }

  emitSystemStatus() {
    const snapshot = this.getSystemStatus();
    if (typeof window !== 'undefined') {
      window.__MEDIASSIST_ASSISTANT_STATUS__ = snapshot;
      try {
        window.dispatchEvent(new CustomEvent(ASSISTANT_STATUS_EVENT_NAME, { detail: snapshot }));
      } catch {}
    }
  }

  updateSystemStatus(patch = {}) {
    const nextStatus = {
      ...this.systemStatus,
      ...patch,
      lastUpdatedAt: new Date().toISOString()
    };
    this.systemStatus = nextStatus;
    this.speechRecognition.setDemoMode(nextStatus.demoModeConfigured || nextStatus.demoModeActive);
    this.voiceOutput.setDemoMode(nextStatus.demoModeConfigured || nextStatus.demoModeActive);
    this.emitSystemStatus();
    return this.getSystemStatus();
  }

  getState() {
    return this.stateMachine.getState();
  }

  getTelemetrySnapshot() {
    return this.telemetry.getSnapshot();
  }

  getLanguageSession() {
    return this.languageMemory.getState();
  }

  getSystemStatus() {
    return clone(this.systemStatus);
  }

  async initializeStatusMonitor() {
    if (this.statusInitialized) {
      return this.getSystemStatus();
    }
    this.statusInitialized = true;
    return this.verifyStartupHealth();
  }

  async checkMicrophonePermission() {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      return 'unknown';
    }

    try {
      const permission = await navigator.permissions.query({ name: 'microphone' });
      return permission?.state || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  async verifyStartupHealth({ force = false } = {}) {
    if (this.startupCheckPromise && !force) {
      return this.startupCheckPromise;
    }

    this.updateSystemStatus({
      startupChecking: true,
      statusMessage: 'Running assistant startup verification...'
    });

    this.startupCheckPromise = (async () => {
      const microphonePermission = await this.checkMicrophonePermission();
      let diagData = null;
      let assistantHealth = null;
      let serverError = null;

      const [diagResult, healthResult] = await Promise.allSettled([
        api.get('/health/diag'),
        api.get('/assistant/health')
      ]);

      if (diagResult.status === 'fulfilled') {
        diagData = diagResult.value?.data || null;
      } else {
        serverError = diagResult.reason;
      }

      if (healthResult.status === 'fulfilled') {
        assistantHealth = healthResult.value?.data || null;
      } else {
        assistantHealth = healthResult.reason?.response?.data || null;
        serverError = serverError || healthResult.reason;
      }

      const runtime = diagData?.assistantRuntime || assistantHealth?.runtime || {};
      const startup = runtime.startup || {};
      const startupIssues = uniqueValues([
        ...(startup.issues || []),
        serverError ? `Server assistant status unreachable: ${serverError.message}` : null,
        microphonePermission === 'denied' ? 'Microphone permission is blocked in this browser.' : null
      ]);
      const demoModeConfigured = Boolean(ASSISTANT_DEMO_MODE || runtime.demoMode);
      const demoModeActive = demoModeConfigured || runtime.mode === 'demo';
      const assistantEnabled = Boolean(runtime.enabled !== false) || demoModeActive;
      const voiceInputEnabled = microphonePermission !== 'denied';
      const statusMessage = demoModeActive
        ? startupIssues[0] || 'Demo mode is active. Local fallback logic is ready.'
        : startupIssues[0] || 'Assistant startup verification passed.';

      return this.updateSystemStatus({
        startupVerified: true,
        startupChecking: false,
        assistantEnabled,
        voiceInputEnabled,
        demoModeConfigured,
        demoModeActive,
        demoReason: demoModeActive ? statusMessage : null,
        serverStatus: runtime.mode || assistantHealth?.status || (serverError ? 'offline' : 'active'),
        microphonePermission,
        statusMessage,
        startupChecks: startup.checks || {},
        startupIssues,
        currentLanguage: this.sessionLanguage,
        sessionTimedOut: false
      });
    })().finally(() => {
      this.startupCheckPromise = null;
    });

    return this.startupCheckPromise;
  }

  markActivity(reason) {
    this.clearSessionTimeout();
    this.sessionTimeoutId = window.setTimeout(() => {
      void this.handleSessionTimeout();
    }, ASSISTANT_SESSION_TIMEOUT_MS);

    if (this.systemStatus.sessionTimedOut || this.systemStatus.statusMessage.includes('timed out')) {
      this.updateSystemStatus({
        sessionTimedOut: false,
        statusMessage: reason === 'startup_check'
          ? this.systemStatus.statusMessage
          : this.systemStatus.demoModeActive
            ? 'Demo mode is active. Local fallback logic is ready.'
            : 'Assistant ready.'
      });
    }
  }

  clearSessionTimeout() {
    if (this.sessionTimeoutId) {
      window.clearTimeout(this.sessionTimeoutId);
      this.sessionTimeoutId = null;
    }
  }

  async handleSessionTimeout() {
    await this.stop();
    this.updateSystemStatus({
      sessionTimedOut: true,
      statusMessage: 'Assistant session timed out after 5 minutes of inactivity. Tap the mic to restart.'
    });
  }

  updateSessionLanguage(language, { confidenceScore = 0.8, translationMode, source = 'runtime' } = {}) {
    const previousLanguage = this.sessionLanguage;
    const nextLanguage = normalizeLanguageCode(language || this.sessionLanguage || 'en');
    this.sessionLanguage = nextLanguage;
    const resolvedConfidenceScore = clampConfidence(confidenceScore, nextLanguage === previousLanguage ? 0.85 : 0.75);
    const state = this.languageMemory.update({
      last_language: nextLanguage,
      confidence_score: resolvedConfidenceScore,
      translationMode: translationMode || defaultTranslationModeForLanguage(nextLanguage),
      source
    });
    this.speechRecognition.setLanguageContext(state);
    this.telemetry.recordLanguageDetection({
      languageDetected: state.last_language,
      responseLanguage: source === 'assistant_reply' || source === 'stream_meta' ? state.last_language : undefined,
      confidenceScore: state.confidence_score,
      translationMode: state.translation_mode,
      detectionMode: source,
      source
    });
    if (source === 'assistant_reply' || source === 'stream_meta') {
      this.telemetry.recordResponseLanguage({
        responseLanguage: state.last_language,
        confidenceScore: state.confidence_score,
        translationMode: state.translation_mode,
        source
      });
    }
    this.updateSystemStatus({ currentLanguage: nextLanguage });
    return state;
  }

  transitionState(nextState, meta = {}) {
    try {
      return this.stateMachine.transition(nextState, meta);
    } catch (error) {
      this.telemetry.recordError(error, {
        kind: 'state_transition',
        currentState: this.getState(),
        requestedState: nextState
      });
      this.stateMachine.fail(error, { ...meta, requestedState: nextState });
      return this.stateMachine.getState();
    }
  }

  clearWakeSpan({ record = false, meta = {} } = {}) {
    if (!this.pendingWakeSpan) {
      return;
    }

    if (record) {
      this.telemetry.finishSpan(this.pendingWakeSpan, meta);
    } else {
      this.telemetry.discardSpan(this.pendingWakeSpan);
    }
    this.pendingWakeSpan = null;
  }

  handleAudioConflict(conflict) {
    if ([AUDIO_SESSION_OWNERS.WAKE, AUDIO_SESSION_OWNERS.SPEECH].includes(conflict.requestedOwner)) {
      this.telemetry.recordMicrophoneConflict(conflict);
      this.updateSystemStatus({
        statusMessage: 'Microphone conflict detected. Recovering audio session...'
      });
      return;
    }

    this.telemetry.recordDuplicateRequest(conflict);
  }

  handleTelemetryUpdate(snapshot) {
    this.updateSystemStatus({
      telemetrySnapshot: snapshot,
      latencyAlerts: snapshot.alerts || []
    });
  }

  handleTelemetryAlert(alert) {
    this.updateSystemStatus({
      latencyAlerts: [...(this.systemStatus.latencyAlerts || []), alert].slice(-3),
      statusMessage: alert.message
    });
  }

  resetRecovery(stage) {
    if (stage) {
      this.recoveryAttempts[stage] = 0;
      return;
    }

    this.recoveryAttempts = {
      wake_word: 0,
      transcription: 0,
      tts: 0
    };
  }

  async resetAudioPipeline(reason) {
    await this.wakeWordService.stop();
    await this.speechRecognition.cancelRecording();
    await this.voiceOutput.stop();
    this.audioLock.reset({ reason });
  }

  async start() {
    await this.initializeStatusMonitor();
    this.markActivity('start');

    if (![ASSISTANT_STATES.IDLE, ASSISTANT_STATES.RETURN_TO_IDLE, ASSISTANT_STATES.ERROR].includes(this.getState())) {
      return false;
    }

    if (!this.systemStatus.voiceInputEnabled) {
      this.updateSystemStatus({
        statusMessage: 'Microphone access is blocked. Type a command or enable microphone permission.'
      });
      return false;
    }

    if (!this.systemStatus.assistantEnabled && !this.systemStatus.demoModeActive) {
      this.updateSystemStatus({
        statusMessage: 'Assistant startup verification failed. Live assistant is disabled.'
      });
      return false;
    }

    await this.armWakeWord();
    return true;
  }

  async armWakeWord() {
    this.markActivity('arm_wake_word');
    if (!this.systemStatus.voiceInputEnabled) {
      return false;
    }

    this.clearRecordingTimer();
    this.clearWakeSpan();
    await this.resetAudioPipeline('arm_wake_word');
    this.stateMachine.releaseListener('speech');
    this.stateMachine.releaseListener('wake');
    if (this.stateMachine.processing) {
      this.stateMachine.endProcessing();
    }
    if (this.getState() !== ASSISTANT_STATES.WAITING_FOR_WAKE_WORD) {
      this.transitionState(ASSISTANT_STATES.WAITING_FOR_WAKE_WORD, { reason: 'arm_wake_word' });
    }
    if (!this.stateMachine.claimListener('wake')) {
      this.telemetry.recordDuplicateRequest({ source: 'wake_listener_claim' });
      return false;
    }
    if (!this.audioLock.acquire(AUDIO_SESSION_OWNERS.WAKE, { reason: 'arm_wake_word' })) {
      this.stateMachine.releaseListener('wake');
      return false;
    }
    const started = await this.wakeWordService.start();
    if (!started) {
      this.audioLock.reset({ reason: 'wake_start_failed' });
      this.stateMachine.releaseListener('wake');
      return false;
    }
    this.resetRecovery('wake_word');
    this.pendingWakeSpan = this.telemetry.startSpan('wake_word_latency', { source: 'wake_word' });
    this.updateSystemStatus({ statusMessage: 'Listening for “Hey Medi”.' });
    return true;
  }

  async handleWakeWord() {
    this.markActivity('wake_detected');
    if (this.getState() !== ASSISTANT_STATES.WAITING_FOR_WAKE_WORD) {
      return;
    }

    this.clearWakeSpan({
      record: true,
      meta: { source: 'wake_word', success: true }
    });
    this.transitionState(ASSISTANT_STATES.WAKE_DETECTED, { reason: 'wake_detected' });
    this.stateMachine.releaseListener('wake');
    await this.wakeWordService.stop();
    this.audioLock.release(AUDIO_SESSION_OWNERS.WAKE, { reason: 'wake_detected' });
    this.pushAssistantMessage(GREETING);
    this.transitionState(ASSISTANT_STATES.SPEAKING, { reason: 'wake_greeting' });
    if (!this.audioLock.acquire(AUDIO_SESSION_OWNERS.TTS, { reason: 'wake_greeting' })) {
      await this.armWakeWord();
      return;
    }
    await this.voiceOutput.speak(GREETING, { language: this.sessionLanguage });
    this.resetRecovery('tts');
    this.audioLock.release(AUDIO_SESSION_OWNERS.TTS, { reason: 'wake_greeting_complete' });
    if ([ASSISTANT_STATES.IDLE, ASSISTANT_STATES.ERROR].includes(this.getState())) {
      return;
    }
    await this.listenNow();
  }

  async listenNow() {
    await this.initializeStatusMonitor();
    this.markActivity('listen_now');
    if (!this.systemStatus.voiceInputEnabled) {
      this.updateSystemStatus({
        statusMessage: 'Microphone access is blocked. Type a command or enable microphone permission.'
      });
      return false;
    }

    this.clearRecordingTimer();
    this.clearWakeSpan();
    await this.wakeWordService.stop();
    await this.voiceOutput.stop();
    this.audioLock.reset({ reason: 'listen_now' });
    this.stateMachine.releaseListener('wake');
    if ([ASSISTANT_STATES.RETURN_TO_IDLE, ASSISTANT_STATES.ERROR, ASSISTANT_STATES.RETRY].includes(this.getState())) {
      this.transitionState(ASSISTANT_STATES.WAITING_FOR_WAKE_WORD, { reason: 'manual_listen_reset' });
    }
    if (this.getState() !== ASSISTANT_STATES.LISTENING) {
      this.transitionState(ASSISTANT_STATES.LISTENING, { reason: 'listen_now' });
    }
    if (!this.stateMachine.claimListener('speech')) {
      this.telemetry.recordDuplicateRequest({ source: 'speech_listener_claim' });
      return false;
    }
    if (!this.audioLock.acquire(AUDIO_SESSION_OWNERS.SPEECH, { reason: 'listen_now' })) {
      this.stateMachine.releaseListener('speech');
      return false;
    }
    const started = await this.speechRecognition.startRecording();
    if (!started) {
      this.audioLock.release(AUDIO_SESSION_OWNERS.SPEECH, { reason: 'speech_start_failed' });
      this.stateMachine.releaseListener('speech');
      await this.armWakeWord();
      return false;
    }
    this.recordingTimer = window.setTimeout(() => {
      void this.finishListening();
    }, RECORDING_TIMEOUT_MS);
    this.updateSystemStatus({ statusMessage: 'Listening for your command...' });
    return true;
  }

  async finishListening() {
    this.markActivity('finish_listening');
    this.clearRecordingTimer();
    const hadSpeechListener = this.stateMachine.hasListener('speech');
    const transcription = await this.speechRecognition.stopRecording();
    this.audioLock.release(AUDIO_SESSION_OWNERS.SPEECH, { reason: 'finish_listening' });
    if (hadSpeechListener) {
      this.stateMachine.releaseListener('speech');
    }

    if (!transcription?.text) {
      this.transitionState(ASSISTANT_STATES.RETURN_TO_IDLE, { reason: 'empty_transcription' });
      await this.armWakeWord();
      return null;
    }

    this.resetRecovery('transcription');
    this.updateSessionLanguage(transcription.language || this.sessionLanguage, {
      confidenceScore: transcription.confidenceScore ?? transcription.confidence_score ?? 0.75,
      translationMode: transcription.translationMode || transcription.translation_mode,
      source: 'transcription'
    });

    return this.processCommand(transcription.text, {
      language: transcription.language || null,
      confidenceScore: transcription.confidenceScore ?? transcription.confidence_score ?? 0.75,
      translationMode: transcription.translationMode || transcription.translation_mode
    });
  }

  async submitText(text) {
    await this.initializeStatusMonitor();
    this.markActivity('submit_text');
    const value = String(text || '').trim();
    if (!value) return null;

    if (!this.systemStatus.assistantEnabled && !this.systemStatus.demoModeActive) {
      this.pushAssistantMessage('Assistant is currently unavailable. Please check the status indicator and startup health report.', { success: false });
      return null;
    }

    return this.processCommand(value, {
      language: null,
      confidenceScore: this.languageMemory.getState().confidence_score ?? 0.55,
      translationMode: this.languageMemory.getState().translation_mode
    });
  }

  async applyAssistantResponse(data, replyLanguage, { totalResponseSpan = null, skipSpeech = false } = {}) {
    const replyText = data.response || FALLBACK_MESSAGE;
    this.updateSessionLanguage(replyLanguage, {
      confidenceScore: data.confidenceScore ?? data.confidence_score ?? (replyLanguage === this.sessionLanguage ? 0.85 : 0.75),
      translationMode: data.translationMode || data.translation_mode,
      source: 'assistant_reply'
    });
    this.pushAssistantMessage(replyText, {
      intent: data.intent,
      action: data.action,
      navigateTo: data.navigateTo,
      success: data.success,
      confidence: data.confidence,
      intentThreshold: data.intentThreshold || INTENT_CONFIDENCE_THRESHOLD,
      demoMode: Boolean(data.demoMode)
    });

    if (!skipSpeech) {
      this.transitionState(ASSISTANT_STATES.SPEAKING, { reason: data.demoMode ? 'assistant_reply_demo' : 'assistant_reply' });
      if (!this.audioLock.acquire(AUDIO_SESSION_OWNERS.TTS, { reason: 'assistant_reply' })) {
        await this.armWakeWord();
        return null;
      }
      await this.voiceOutput.speak(replyText, { language: replyLanguage });
      this.resetRecovery('tts');
      this.audioLock.release(AUDIO_SESSION_OWNERS.TTS, { reason: 'assistant_reply_complete' });
    }
    if (data.action === 'NAVIGATE' && data.navigateTo) {
      this.onNavigate?.(data.navigateTo);
    }
    this.telemetry.recordOperation({
      kind: data.demoMode ? 'assistant_command_demo' : 'assistant_command',
      success: data.success !== false,
      meta: {
        type: data.type || 'chat',
        intent: data.intent || 'GENERAL_CHAT',
        confidence: data.confidence,
        language: replyLanguage,
        demoMode: Boolean(data.demoMode)
      }
    });
    if (totalResponseSpan) {
      this.telemetry.finishSpan(totalResponseSpan, {
        source: data.demoMode ? 'assistant_command_demo' : 'assistant_command',
        language: replyLanguage,
        success: data.success !== false,
        streaming: skipSpeech
      });
    }
    this.updateSystemStatus({
      statusMessage: data.demoMode
        ? 'Demo mode handled the last request successfully.'
        : 'Assistant replied successfully.'
    });
    return data;
  }

  async useDemoFallback(text, detectedLanguage, reason) {
    this.updateSystemStatus({
      demoModeActive: true,
      demoReason: reason,
      assistantEnabled: true,
      statusMessage: 'Demo mode is active. Live AI or network is unavailable.'
    });
    const demoResponse = buildDemoAssistantResponse(text, {
      language: normalizeLanguageCode(detectedLanguage || this.sessionLanguage || 'en'),
      reason
    });
    return this.applyAssistantResponse(demoResponse, demoResponse.language || this.sessionLanguage);
  }

  async streamAssistantCommand({ text, language, confidenceScore, translationMode, intentSpan, totalResponseSpan }) {
    const token = getStoredAuthToken();
    const response = await fetch(buildApiUrl('/assistant/command/stream'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        text,
        language,
        sessionLanguage: this.sessionLanguage,
        confidenceScore,
        translationMode,
        conversationHistory: this.conversationHistory.slice(-8)
      }),
      signal: this.pendingCommandController.signal
    });

    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(errorText || 'Assistant streaming request failed');
      error.response = { status: response.status };
      throw error;
    }

    if (!response.body) {
      return null;
    }

    let streamMeta = null;
    let finalData = null;
    let replyText = '';
    let speechBuffer = '';
    let speechQueue = [];
    let speechPlaying = false;
    let speechStarted = false;
    let speechPromise = Promise.resolve();
    let firstReplyEventSeen = false;

    const startSpeechPlayback = (targetLanguage) => {
      if (speechPlaying || speechQueue.length === 0) {
        return;
      }

      speechPlaying = true;
      speechPromise = (async () => {
        if (!this.audioLock.acquire(AUDIO_SESSION_OWNERS.TTS, { reason: 'assistant_stream_reply' })) {
          speechQueue = [];
          return;
        }

        try {
          while (speechQueue.length > 0) {
            const segment = speechQueue.shift();
            this.transitionState(ASSISTANT_STATES.SPEAKING, { reason: 'assistant_stream_reply' });
            await this.voiceOutput.speak(segment, { language: targetLanguage || this.sessionLanguage });
            speechStarted = true;
          }
          this.resetRecovery('tts');
        } finally {
          this.audioLock.release(AUDIO_SESSION_OWNERS.TTS, { reason: 'assistant_stream_reply_complete' });
          speechPlaying = false;
          if (speechQueue.length > 0) {
            startSpeechPlayback(targetLanguage);
          }
        }
      })();
    };

    const queueSpeechSegments = (segments, targetLanguage) => {
      const eligibleSegments = segments.filter((segment) => {
        if (normalizeLanguageCode(targetLanguage || 'en') === 'en') {
          return true;
        }
        return textShowsTargetLanguage(segment, targetLanguage) || textShowsTargetLanguage(replyText, targetLanguage);
      });
      if (!eligibleSegments.length) {
        return;
      }
      speechQueue = [...speechQueue, ...eligibleSegments];
      startSpeechPlayback(targetLanguage);
    };

    for await (const event of readNdjsonStream(response.body)) {
      if (event.type === 'error') {
        throw new Error(event.error || 'Assistant streaming failed');
      }

      if (event.type === 'meta') {
        streamMeta = event;
        this.updateSessionLanguage(event.responseLanguage || event.response_language || event.detectedLanguage || this.sessionLanguage, {
          confidenceScore: event.confidenceScore ?? event.confidence_score ?? confidenceScore,
          translationMode: event.translationMode || event.translation_mode || translationMode,
          source: 'stream_meta'
        });
        continue;
      }

      if (event.type === 'delta') {
        if (!firstReplyEventSeen) {
          this.telemetry.finishSpan(intentSpan, {
            source: 'assistant_command_stream',
            language: streamMeta?.responseLanguage || streamMeta?.response_language || this.sessionLanguage,
            success: true,
            streaming: true
          });
          this.beginStreamingAssistantMessage();
          firstReplyEventSeen = true;
        }

        const delta = String(event.delta || '');
        if (!delta) {
          continue;
        }
        replyText += delta;
        this.appendStreamingDelta(delta);
        speechBuffer += delta;
        const { segments, remainder } = extractSpeechSegments(speechBuffer);
        speechBuffer = remainder;
        queueSpeechSegments(segments, streamMeta?.responseLanguage || streamMeta?.response_language || this.sessionLanguage);
        continue;
      }

      if (event.type === 'done') {
        finalData = event.data || null;
      }
    }

    if (!firstReplyEventSeen) {
      this.telemetry.finishSpan(intentSpan, {
        source: 'assistant_command_stream',
        language: streamMeta?.responseLanguage || streamMeta?.response_language || this.sessionLanguage,
        success: Boolean(finalData),
        streaming: true
      });
    }

    if (speechBuffer.trim()) {
      const finalLanguage = normalizeLanguageCode(finalData?.responseLanguage || finalData?.response_language || streamMeta?.responseLanguage || this.sessionLanguage);
      const { segments } = extractSpeechSegments(speechBuffer, { force: true });
      queueSpeechSegments(segments, finalLanguage);
    }

    await speechPromise;

    if (!finalData) {
      return null;
    }

    const replyLanguage = normalizeLanguageCode(finalData.language || finalData.responseLanguage || finalData.response_language || this.sessionLanguage || 'en');
    return this.applyAssistantResponse(finalData, replyLanguage, {
      totalResponseSpan,
      skipSpeech: speechStarted
    });
  }

  async processCommand(text, commandMeta = {}) {
    await this.initializeStatusMonitor();
    this.markActivity('process_command');
    if (!this.stateMachine.beginProcessing()) {
      this.telemetry.recordDuplicateRequest({ source: 'process_command_busy' });
      return null;
    }

    const resolvedLanguage = typeof commandMeta === 'string' ? commandMeta : commandMeta?.language || null;
    const resolvedConfidenceScore = clampConfidence(
      typeof commandMeta === 'string'
        ? 0.8
        : commandMeta?.confidenceScore ?? commandMeta?.confidence_score,
      resolvedLanguage ? 0.8 : this.languageMemory.getState().confidence_score ?? 0.55
    );
    const resolvedTranslationMode = typeof commandMeta === 'string'
      ? defaultTranslationModeForLanguage(resolvedLanguage)
      : commandMeta?.translationMode || commandMeta?.translation_mode || this.languageMemory.getState().translation_mode;
    const sessionLanguage = this.languageMemory.getState().last_language || this.sessionLanguage;
    const trustedLanguage = resolvedLanguage && resolvedConfidenceScore >= LANGUAGE_CONFIDENCE_THRESHOLD
      ? resolvedLanguage
      : null;

    if (trustedLanguage) {
      this.updateSessionLanguage(trustedLanguage, {
        confidenceScore: resolvedConfidenceScore,
        translationMode: resolvedTranslationMode,
        source: 'command_input'
      });
    }
    this.pushUserMessage(text);
    if (this.getState() !== ASSISTANT_STATES.PROCESSING) {
      this.transitionState(ASSISTANT_STATES.PROCESSING, { reason: 'process_command' });
    }

    let intentSpan = null;
    let totalResponseSpan = null;
    try {
      this.pendingCommandController = new AbortController();
      intentSpan = this.telemetry.startSpan('intent_latency', {
        source: 'assistant_command',
        language: trustedLanguage || sessionLanguage || this.sessionLanguage
      });
      totalResponseSpan = this.telemetry.startSpan('total_response_latency', {
        source: 'assistant_command',
        language: trustedLanguage || sessionLanguage || this.sessionLanguage
      });

      if (ASSISTANT_STREAMING_ENABLED && !this.systemStatus.demoModeActive && typeof fetch === 'function') {
        try {
          const streamedResponse = await this.streamAssistantCommand({
            text,
            language: trustedLanguage,
            confidenceScore: resolvedConfidenceScore,
            translationMode: resolvedTranslationMode,
            intentSpan,
            totalResponseSpan
          });
          if (streamedResponse) {
            return streamedResponse;
          }
        } catch (streamError) {
          if (streamError?.code === 'ERR_CANCELED' || streamError?.name === 'CanceledError') {
            throw streamError;
          }
          this.telemetry.discardSpan(intentSpan);
          intentSpan = this.telemetry.startSpan('intent_latency', {
            source: 'assistant_command_fallback',
            language: trustedLanguage || sessionLanguage || this.sessionLanguage
          });
          this.log('assistant_stream_fallback', { error: streamError.message });
        }
      }

      const response = await api.post('/assistant/command', {
        text,
        language: trustedLanguage,
        sessionLanguage,
        confidenceScore: resolvedConfidenceScore,
        translationMode: resolvedTranslationMode,
        conversationHistory: this.conversationHistory.slice(-8)
      }, { signal: this.pendingCommandController.signal });

      this.telemetry.finishSpan(intentSpan, {
        source: 'assistant_command',
        language: this.sessionLanguage,
        success: true
      });

      if (!this.pendingCommandController || this.pendingCommandController.signal.aborted) {
        return null;
      }

      const data = response?.data || {};
      if (data.demoMode === true && data.success === false) {
        this.telemetry.discardSpan(totalResponseSpan);
        return this.useDemoFallback(text, trustedLanguage, data.response || 'server_demo_fallback');
      }

      const replyLanguage = normalizeLanguageCode(data.language || this.sessionLanguage || 'en');
      return this.applyAssistantResponse(data, replyLanguage, { totalResponseSpan });
    } catch (error) {
      if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') {
        this.telemetry.discardSpan(intentSpan);
        this.telemetry.discardSpan(totalResponseSpan);
        return null;
      }

      this.telemetry.finishSpan(intentSpan, {
        source: 'assistant_command',
        language: this.sessionLanguage,
        success: false
      });

      const shouldUseDemo = this.systemStatus.demoModeActive
        || this.systemStatus.demoModeConfigured
        || error?.response?.data?.demoMode === true
        || error?.response?.data?.assistantStatus?.demoMode === true;

      if (shouldUseDemo) {
        this.telemetry.discardSpan(totalResponseSpan);
        return this.useDemoFallback(text, trustedLanguage, error?.message || 'live_ai_unavailable');
      }

      this.telemetry.finishSpan(totalResponseSpan, {
        source: 'assistant_command',
        language: trustedLanguage || sessionLanguage || this.sessionLanguage,
        success: false
      });

      await this.handleError(error, { stage: 'assistant_command', speakFallback: true });
      return null;
    } finally {
      this.pendingCommandController = null;
      this.audioLock.release(AUDIO_SESSION_OWNERS.TTS, { reason: 'process_command_cleanup' });
      if (this.stateMachine.processing) {
        this.stateMachine.endProcessing();
      }
      if (this.getState() !== ASSISTANT_STATES.IDLE) {
        this.transitionState(ASSISTANT_STATES.RETURN_TO_IDLE, { reason: 'command_complete' });
        if (this.systemStatus.voiceInputEnabled) {
          await this.armWakeWord();
        }
      }
    }
  }

  async attemptAutomaticRecovery(stage) {
    const stageKey = ['wake_word', 'transcription', 'tts'].includes(stage) ? stage : null;
    if (!stageKey) {
      this.transitionState(ASSISTANT_STATES.RETRY, { reason: 'generic_auto_recovery', stage });
      this.transitionState(ASSISTANT_STATES.RETURN_TO_IDLE, { reason: 'generic_auto_recovery_complete', stage });
      if (this.systemStatus.voiceInputEnabled) {
        await this.armWakeWord();
      }
      return true;
    }

    const allowedRetries = ASSISTANT_RECOVERY_LIMITS[stageKey] ?? 0;
    const attempts = this.recoveryAttempts[stageKey] ?? 0;
    if (attempts >= allowedRetries) {
      return false;
    }

    this.recoveryAttempts[stageKey] = attempts + 1;
    this.updateSystemStatus({
      recovering: true,
      recoveryStage: stageKey,
      statusMessage: `Recovering ${readableStage(stageKey)} automatically (${this.recoveryAttempts[stageKey]}/${allowedRetries})...`
    });
    this.transitionState(ASSISTANT_STATES.RETRY, {
      reason: 'auto_recovery',
      stage: stageKey,
      attempt: this.recoveryAttempts[stageKey]
    });
    this.transitionState(ASSISTANT_STATES.RETURN_TO_IDLE, {
      reason: 'auto_recovery_reset',
      stage: stageKey,
      attempt: this.recoveryAttempts[stageKey]
    });
    if (this.systemStatus.voiceInputEnabled) {
      await this.armWakeWord();
    }
    this.updateSystemStatus({
      recovering: false,
      recoveryStage: null,
      statusMessage: `Recovered from ${readableStage(stageKey)} issue.`
    });
    return true;
  }

  async stopCurrentAction() {
    this.markActivity('stop_current_action');
    this.clearRecordingTimer();
    this.clearWakeSpan();
    if (this.pendingCommandController) {
      try {
        this.pendingCommandController.abort();
      } catch {}
      this.pendingCommandController = null;
    }
    await this.resetAudioPipeline('stop_current_action');
    this.stateMachine.releaseListener('wake');
    this.stateMachine.releaseListener('speech');
    if (this.stateMachine.processing) {
      this.stateMachine.endProcessing();
    }
    if (this.getState() !== ASSISTANT_STATES.IDLE) {
      this.transitionState(ASSISTANT_STATES.RETURN_TO_IDLE, { reason: 'stop_current_action' });
      if (this.systemStatus.voiceInputEnabled) {
        await this.armWakeWord();
      }
    }
  }

  async stop() {
    this.clearRecordingTimer();
    this.clearWakeSpan();
    this.clearSessionTimeout();
    if (this.pendingCommandController) {
      try {
        this.pendingCommandController.abort();
      } catch {}
      this.pendingCommandController = null;
    }
    await this.resetAudioPipeline('stop_runtime');
    this.stateMachine.reset();
  }

  async handleError(error, { speakFallback = true, stage } = {}) {
    if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') {
      return;
    }

    const resolvedStage = stage || error?.assistantStage || 'runtime';
    this.clearWakeSpan();
    this.telemetry.recordError(error, { kind: 'assistant_runtime', state: this.getState(), stage: resolvedStage });
    this.log('assistant_error', { error: error?.message || String(error), stage: resolvedStage });
    this.stateMachine.fail(error, { reason: 'assistant_runtime_error', stage: resolvedStage });

    const recovered = await this.attemptAutomaticRecovery(resolvedStage);
    if (recovered) {
      return;
    }

    this.updateSystemStatus({
      recovering: false,
      recoveryStage: null,
      statusMessage: error?.message || FALLBACK_MESSAGE
    });
    this.pushAssistantMessage(FALLBACK_MESSAGE, { success: false });
    this.onError?.(FALLBACK_MESSAGE);

    if (speakFallback && this.getState() !== ASSISTANT_STATES.IDLE) {
      this.audioLock.reset({ reason: 'fallback_error' });
      if (this.audioLock.acquire(AUDIO_SESSION_OWNERS.TTS, { reason: 'fallback_error' })) {
        await this.voiceOutput.speak(FALLBACK_MESSAGE, { language: this.sessionLanguage });
        this.audioLock.release(AUDIO_SESSION_OWNERS.TTS, { reason: 'fallback_error_complete' });
      }
    }
  }

  clearRecordingTimer() {
    if (this.recordingTimer) {
      window.clearTimeout(this.recordingTimer);
      this.recordingTimer = null;
    }
  }

  pushUserMessage(content) {
    this.pushMessage({ role: 'user', content, timestamp: Date.now() });
  }

  pushAssistantMessage(content, extra = {}) {
    if (this.streamingMessage) {
      this.streamingMessage.content = content;
      Object.assign(this.streamingMessage, extra, { streaming: false });
      this.streamingMessage = null;
      this.onMessage?.(this.conversationHistory[this.conversationHistory.length - 1], [...this.conversationHistory]);
      return;
    }
    this.pushMessage({ role: 'assistant', content, timestamp: Date.now(), ...extra });
  }

  beginStreamingAssistantMessage() {
    const message = { role: 'assistant', content: '', timestamp: Date.now(), streaming: true };
    this.streamingMessage = message;
    this.conversationHistory.push(message);
    if (this.conversationHistory.length > MAX_HISTORY) {
      this.conversationHistory = this.conversationHistory.slice(-MAX_HISTORY);
      this.streamingMessage = this.conversationHistory[this.conversationHistory.length - 1];
    }
    this.onMessage?.(message, [...this.conversationHistory]);
  }

  appendStreamingDelta(delta) {
    if (!this.streamingMessage) {
      this.beginStreamingAssistantMessage();
    }
    this.streamingMessage.content += delta;
    this.onMessage?.(this.streamingMessage, [...this.conversationHistory]);
  }

  pushMessage(message) {
    this.conversationHistory.push(message);
    if (this.conversationHistory.length > MAX_HISTORY) {
      this.conversationHistory = this.conversationHistory.slice(-MAX_HISTORY);
    }
    this.onMessage?.(message, [...this.conversationHistory]);
  }
}

const assistantRuntime = new AssistantRuntime();
export default assistantRuntime;
