function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export const AUDIO_SESSION_OWNERS = Object.freeze({
  WAKE: 'wake',
  SPEECH: 'speech',
  TTS: 'tts'
});

export default class AudioSessionLock {
  constructor({ logger, onConflict } = {}) {
    this.logger = logger;
    this.onConflict = onConflict;
    this.activeOwner = null;
    this.startedAt = 0;
    this.sessionId = 0;
  }

  getOwner() {
    return this.activeOwner;
  }

  isLocked() {
    return Boolean(this.activeOwner);
  }

  acquire(owner, meta = {}) {
    if (!owner) {
      throw new Error('Audio session owner is required');
    }

    if (this.activeOwner && this.activeOwner !== owner) {
      const conflict = {
        activeOwner: this.activeOwner,
        requestedOwner: owner,
        lockedForMs: Math.round(nowMs() - this.startedAt),
        ...meta
      };
      this.logger?.('audio_session_conflict', conflict);
      this.onConflict?.(conflict);
      return false;
    }

    if (!this.activeOwner) {
      this.activeOwner = owner;
      this.startedAt = nowMs();
      this.sessionId += 1;
      this.logger?.('audio_session_acquired', { owner, sessionId: this.sessionId, ...meta });
    }

    return true;
  }

  release(owner, meta = {}) {
    if (!this.activeOwner) {
      return true;
    }

    if (owner && this.activeOwner !== owner) {
      const conflict = {
        activeOwner: this.activeOwner,
        requestedOwner: owner,
        ...meta
      };
      this.logger?.('audio_session_release_conflict', conflict);
      this.onConflict?.(conflict);
      return false;
    }

    const releasedOwner = this.activeOwner;
    const durationMs = Math.round(nowMs() - this.startedAt);
    this.activeOwner = null;
    this.startedAt = 0;
    this.logger?.('audio_session_released', { owner: releasedOwner, durationMs, ...meta });
    return true;
  }

  reset(meta = {}) {
    if (!this.activeOwner) {
      return false;
    }

    const releasedOwner = this.activeOwner;
    const durationMs = Math.round(nowMs() - this.startedAt);
    this.activeOwner = null;
    this.startedAt = 0;
    this.logger?.('audio_session_reset', { owner: releasedOwner, durationMs, ...meta });
    return true;
  }
}