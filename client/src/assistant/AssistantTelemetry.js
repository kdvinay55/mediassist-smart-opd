import { ASSISTANT_LATENCY_THRESHOLDS } from './config';

export const TELEMETRY_EVENT_NAME = 'mediassist:telemetry';

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function roundMs(value) {
  return value == null ? null : Math.max(0, Math.round(value));
}

function createLatencyBucket() {
  return {
    count: 0,
    lastMs: null,
    avgMs: null,
    minMs: null,
    maxMs: null,
    totalMs: 0
  };
}

function updateLatencyBucket(bucket, durationMs) {
  const nextDuration = roundMs(durationMs);
  const nextCount = bucket.count + 1;

  bucket.count = nextCount;
  bucket.lastMs = nextDuration;
  bucket.totalMs += nextDuration;
  bucket.avgMs = roundMs(bucket.totalMs / nextCount);
  bucket.minMs = bucket.minMs === null ? nextDuration : Math.min(bucket.minMs, nextDuration);
  bucket.maxMs = bucket.maxMs === null ? nextDuration : Math.max(bucket.maxMs, nextDuration);

  return nextDuration;
}

const LATENCY_BUCKETS = Object.freeze({
  wake_word_latency: 'wakeWordLatency',
  transcription_latency: 'transcriptionLatency',
  intent_latency: 'intentLatency',
  tts_latency: 'ttsLatency',
  total_response_latency: 'totalResponseLatency'
});

const LATENCY_THRESHOLDS = Object.freeze({
  wake_word_latency: ASSISTANT_LATENCY_THRESHOLDS.wakeWord,
  transcription_latency: ASSISTANT_LATENCY_THRESHOLDS.transcription,
  intent_latency: ASSISTANT_LATENCY_THRESHOLDS.intent,
  tts_latency: ASSISTANT_LATENCY_THRESHOLDS.tts,
  total_response_latency: ASSISTANT_LATENCY_THRESHOLDS.totalResponse
});

export default class AssistantTelemetry {
  constructor({ logger, onUpdate, onAlert } = {}) {
    this.logger = logger;
    this.onUpdate = onUpdate;
    this.onAlert = onAlert;
    this.spans = new Map();
    this.sequence = 0;
    this.metrics = {
      wakeWordLatency: createLatencyBucket(),
      transcriptionLatency: createLatencyBucket(),
      intentLatency: createLatencyBucket(),
      ttsLatency: createLatencyBucket(),
      totalResponseLatency: createLatencyBucket(),
      language: {
        languageDetected: 'en',
        responseLanguage: 'en',
        confidenceScore: 1,
        translationMode: 'native',
        detectionMode: 'default',
        transcriptionResult: '',
        updatedAt: null,
        source: 'default'
      },
      counters: {
        totalOperations: 0,
        totalErrors: 0,
        errorRate: 0,
        microphoneConflicts: 0,
        duplicateRequests: 0
      },
      alerts: []
    };
    this.lastEvent = null;
  }

  startSpan(metric, meta = {}) {
    const id = `${metric}:${++this.sequence}`;
    this.spans.set(id, { metric, meta, startedAt: nowMs() });
    return id;
  }

  discardSpan(id) {
    if (!id) return false;
    return this.spans.delete(id);
  }

  finishSpan(id, extra = {}) {
    const span = this.spans.get(id);
    if (!span) return null;

    this.spans.delete(id);
    return this.recordLatency(span.metric, nowMs() - span.startedAt, { ...span.meta, ...extra });
  }

  recordLatency(metric, durationMs, meta = {}) {
    const bucketName = LATENCY_BUCKETS[metric];
    if (!bucketName) return null;

    const duration = updateLatencyBucket(this.metrics[bucketName], durationMs);
    this.emit('assistant_telemetry_latency', { metric, durationMs: duration, ...meta });
    const threshold = LATENCY_THRESHOLDS[metric];
    if (threshold && duration > threshold) {
      this.recordAlert(metric, duration, threshold, meta);
    }
    return duration;
  }

  recordAlert(metric, durationMs, thresholdMs, meta = {}) {
    const alert = {
      metric,
      durationMs,
      thresholdMs,
      message: `Slow response detected: ${metric.replace(/_/g, ' ')} took ${durationMs} ms (threshold ${thresholdMs} ms).`,
      at: new Date().toISOString(),
      ...meta
    };
    this.metrics.alerts = [...this.metrics.alerts, alert].slice(-10);
    this.emit('assistant_telemetry_alert', alert);
    this.onAlert?.(alert, this.getSnapshot());
    return alert;
  }

  recordOperation({ kind = 'runtime', success = true, meta = {} } = {}) {
    const counters = this.metrics.counters;
    counters.totalOperations += 1;
    if (!success) {
      counters.totalErrors += 1;
    }
    counters.errorRate = Number((counters.totalErrors / counters.totalOperations).toFixed(3));

    this.emit('assistant_telemetry_operation', {
      kind,
      success,
      errorRate: counters.errorRate,
      ...meta
    });

    return counters.errorRate;
  }

  recordMicrophoneConflict(meta = {}) {
    this.metrics.counters.microphoneConflicts += 1;
    this.emit('assistant_telemetry_counter', {
      metric: 'microphone_conflicts',
      value: this.metrics.counters.microphoneConflicts,
      ...meta
    });
  }

  recordDuplicateRequest(meta = {}) {
    this.metrics.counters.duplicateRequests += 1;
    this.emit('assistant_telemetry_counter', {
      metric: 'duplicate_requests',
      value: this.metrics.counters.duplicateRequests,
      ...meta
    });
  }

  recordError(error, meta = {}) {
    const message = error?.message || String(error);
    this.recordOperation({
      kind: meta.kind || 'runtime_error',
      success: false,
      meta: {
        ...meta,
        error: message
      }
    });
  }

  recordLanguageDetection({
    languageDetected,
    responseLanguage,
    confidenceScore,
    translationMode,
    detectionMode,
    transcriptionResult,
    source = 'runtime'
  } = {}) {
    this.metrics.language = {
      ...this.metrics.language,
      languageDetected: languageDetected || this.metrics.language.languageDetected,
      responseLanguage: responseLanguage || this.metrics.language.responseLanguage,
      confidenceScore: Number.isFinite(confidenceScore)
        ? Number(Math.max(0, Math.min(1, confidenceScore)).toFixed(2))
        : this.metrics.language.confidenceScore,
      translationMode: translationMode || this.metrics.language.translationMode,
      detectionMode: detectionMode || this.metrics.language.detectionMode,
      transcriptionResult: transcriptionResult ?? this.metrics.language.transcriptionResult,
      updatedAt: new Date().toISOString(),
      source
    };

    this.emit('assistant_telemetry_language', { ...this.metrics.language });
    return { ...this.metrics.language };
  }

  recordResponseLanguage({ responseLanguage, confidenceScore, translationMode, source = 'assistant_reply' } = {}) {
    return this.recordLanguageDetection({
      responseLanguage,
      confidenceScore,
      translationMode,
      source
    });
  }

  getSnapshot() {
    return {
      latencies: {
        wakeWordLatency: { ...this.metrics.wakeWordLatency },
        transcriptionLatency: { ...this.metrics.transcriptionLatency },
        intentLatency: { ...this.metrics.intentLatency },
        ttsLatency: { ...this.metrics.ttsLatency },
        totalResponseLatency: { ...this.metrics.totalResponseLatency }
      },
      language: { ...this.metrics.language },
      counters: { ...this.metrics.counters },
      alerts: [...this.metrics.alerts],
      lastEvent: this.lastEvent
    };
  }

  emit(type, payload = {}) {
    this.lastEvent = {
      type,
      payload,
      at: new Date().toISOString()
    };

    const snapshot = this.getSnapshot();

    if (typeof window !== 'undefined') {
      window.__MEDIASSIST_TELEMETRY__ = snapshot;
      try {
        window.dispatchEvent(new CustomEvent(TELEMETRY_EVENT_NAME, { detail: snapshot }));
      } catch {}
    }

    this.logger?.('assistant_telemetry', { eventType: type, ...payload });
    this.onUpdate?.(snapshot);
  }
}