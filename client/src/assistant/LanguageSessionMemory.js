import { LANGUAGE_SESSION_STORAGE_KEY } from './config';

function clampConfidence(value) {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

export function normalizeLanguageCode(code) {
  return String(code || 'en').slice(0, 2).toLowerCase() || 'en';
}

export function defaultTranslationModeForLanguage(language) {
  return normalizeLanguageCode(language) === 'en'
    ? 'native'
    : 'same_language_response';
}

function buildState({
  lastLanguage = 'en',
  confidenceScore = 1,
  translationMode = 'native',
  updatedAt = null,
  source = 'default'
} = {}) {
  const normalizedLanguage = normalizeLanguageCode(lastLanguage);
  const normalizedConfidenceScore = clampConfidence(confidenceScore);
  const normalizedTranslationMode = translationMode || defaultTranslationModeForLanguage(normalizedLanguage);

  return {
    lastLanguage: normalizedLanguage,
    last_language: normalizedLanguage,
    confidenceScore: normalizedConfidenceScore,
    confidence_score: normalizedConfidenceScore,
    translationMode: normalizedTranslationMode,
    translation_mode: normalizedTranslationMode,
    updatedAt,
    source
  };
}

function buildDefaultState() {
  return buildState();
}

export default class LanguageSessionMemory {
  constructor({ logger } = {}) {
    this.logger = logger;
    this.state = this.load();
  }

  load() {
    if (!canUseStorage()) {
      return buildDefaultState();
    }

    try {
      const raw = window.localStorage.getItem(LANGUAGE_SESSION_STORAGE_KEY);
      if (!raw) {
        return buildDefaultState();
      }

      const parsed = JSON.parse(raw);
      return {
        ...buildState({
          lastLanguage: parsed?.last_language || parsed?.lastLanguage,
          confidenceScore: parsed?.confidence_score ?? parsed?.confidenceScore,
          translationMode: parsed?.translation_mode || parsed?.translationMode,
          updatedAt: parsed?.updatedAt || null,
          source: parsed?.source || 'storage'
        }),
        ...parsed
      };
    } catch {
      return buildDefaultState();
    }
  }

  save() {
    if (!canUseStorage()) {
      return;
    }

    try {
      window.localStorage.setItem(LANGUAGE_SESSION_STORAGE_KEY, JSON.stringify(this.state));
    } catch {}
  }

  getState() {
    return { ...this.state };
  }

  update({
    lastLanguage,
    last_language,
    confidenceScore,
    confidence_score,
    translationMode,
    translation_mode,
    source = 'runtime'
  } = {}) {
    const normalizedLanguage = normalizeLanguageCode(last_language || lastLanguage || this.state.last_language || this.state.lastLanguage);

    this.state = buildState({
      lastLanguage: normalizedLanguage,
      confidenceScore: Number.isFinite(confidence_score) ? confidence_score : confidenceScore ?? this.state.confidence_score,
      translationMode: translation_mode || translationMode || this.state.translation_mode || this.state.translationMode,
      updatedAt: new Date().toISOString(),
      source
    });

    this.save();
    this.logger?.('assistant_language_session_updated', { ...this.state });
    return this.getState();
  }

  reset() {
    this.state = buildDefaultState();
    this.save();
    this.logger?.('assistant_language_session_reset', { ...this.state });
    return this.getState();
  }
}