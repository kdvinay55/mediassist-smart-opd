import { ASSISTANT_STATES } from './config';

const ALLOWED_TRANSITIONS = Object.freeze({
  [ASSISTANT_STATES.IDLE]: new Set([
    ASSISTANT_STATES.WAITING_FOR_WAKE_WORD,
    ASSISTANT_STATES.LISTENING,
    ASSISTANT_STATES.RETRY,
    ASSISTANT_STATES.ERROR
  ]),
  [ASSISTANT_STATES.WAITING_FOR_WAKE_WORD]: new Set([
    ASSISTANT_STATES.WAKE_DETECTED,
    ASSISTANT_STATES.SPEAKING,
    ASSISTANT_STATES.LISTENING,
    ASSISTANT_STATES.IDLE,
    ASSISTANT_STATES.RETURN_TO_IDLE,
    ASSISTANT_STATES.ERROR
  ]),
  [ASSISTANT_STATES.WAKE_DETECTED]: new Set([
    ASSISTANT_STATES.SPEAKING,
    ASSISTANT_STATES.LISTENING,
    ASSISTANT_STATES.RETRY,
    ASSISTANT_STATES.RETURN_TO_IDLE,
    ASSISTANT_STATES.ERROR
  ]),
  [ASSISTANT_STATES.LISTENING]: new Set([
    ASSISTANT_STATES.PROCESSING,
    ASSISTANT_STATES.RETRY,
    ASSISTANT_STATES.RETURN_TO_IDLE,
    ASSISTANT_STATES.IDLE,
    ASSISTANT_STATES.ERROR
  ]),
  [ASSISTANT_STATES.PROCESSING]: new Set([
    ASSISTANT_STATES.SPEAKING,
    ASSISTANT_STATES.RETRY,
    ASSISTANT_STATES.RETURN_TO_IDLE,
    ASSISTANT_STATES.IDLE,
    ASSISTANT_STATES.ERROR
  ]),
  [ASSISTANT_STATES.SPEAKING]: new Set([
    ASSISTANT_STATES.LISTENING,
    ASSISTANT_STATES.RETRY,
    ASSISTANT_STATES.RETURN_TO_IDLE,
    ASSISTANT_STATES.WAITING_FOR_WAKE_WORD,
    ASSISTANT_STATES.IDLE,
    ASSISTANT_STATES.ERROR
  ]),
  [ASSISTANT_STATES.RETURN_TO_IDLE]: new Set([
    ASSISTANT_STATES.WAITING_FOR_WAKE_WORD,
    ASSISTANT_STATES.RETRY,
    ASSISTANT_STATES.IDLE,
    ASSISTANT_STATES.ERROR
  ]),
  [ASSISTANT_STATES.ERROR]: new Set([
    ASSISTANT_STATES.RETRY,
    ASSISTANT_STATES.RETURN_TO_IDLE,
    ASSISTANT_STATES.WAITING_FOR_WAKE_WORD,
    ASSISTANT_STATES.IDLE
  ]),
  [ASSISTANT_STATES.RETRY]: new Set([
    ASSISTANT_STATES.RETURN_TO_IDLE,
    ASSISTANT_STATES.WAITING_FOR_WAKE_WORD,
    ASSISTANT_STATES.IDLE,
    ASSISTANT_STATES.LISTENING,
    ASSISTANT_STATES.ERROR
  ])
});

export default class AssistantStateMachine {
  constructor({ logger, onStateChange } = {}) {
    this.logger = logger;
    this.onStateChange = onStateChange;
    this.state = ASSISTANT_STATES.IDLE;
    this.activeListener = null;
    this.processing = false;
    this.transitionCount = 0;
    this.lastTransition = null;
  }

  getState() {
    return this.state;
  }

  getSnapshot() {
    return {
      state: this.state,
      activeListener: this.activeListener,
      processing: this.processing,
      transitionCount: this.transitionCount,
      lastTransition: this.lastTransition ? { ...this.lastTransition } : null
    };
  }

  canTransition(nextState) {
    if (nextState === this.state) return true;
    return ALLOWED_TRANSITIONS[this.state]?.has(nextState) || false;
  }

  transition(nextState, meta = {}) {
    if (!this.canTransition(nextState)) {
      this.logger?.('assistant_state_transition_blocked', { from: this.state, to: nextState, ...meta });
      throw new Error(`Invalid assistant state transition: ${this.state} -> ${nextState}`);
    }
    const previousState = this.state;
    this.state = nextState;
    this.transitionCount += 1;
    this.lastTransition = {
      id: this.transitionCount,
      from: previousState,
      to: nextState,
      meta: { ...meta }
    };
    this.logger?.('assistant_state_transition', { from: previousState, to: nextState, transitionId: this.transitionCount, ...meta });
    this.onStateChange?.(nextState, previousState, { transitionId: this.transitionCount, ...meta });
    return this.state;
  }

  fail(error, meta = {}) {
    const previousState = this.state;
    this.activeListener = null;
    this.processing = false;
    this.state = ASSISTANT_STATES.ERROR;
    this.transitionCount += 1;
    this.lastTransition = {
      id: this.transitionCount,
      from: previousState,
      to: ASSISTANT_STATES.ERROR,
      meta: { ...meta, error: error?.message || String(error) }
    };
    this.logger?.('assistant_state_error', {
      from: previousState,
      to: ASSISTANT_STATES.ERROR,
      transitionId: this.transitionCount,
      error: error?.message || String(error),
      ...meta
    });
    this.onStateChange?.(this.state, previousState, {
      transitionId: this.transitionCount,
      error: error?.message || String(error),
      ...meta
    });
    return this.state;
  }

  claimListener(listenerName) {
    if (this.activeListener && this.activeListener !== listenerName) {
      this.logger?.('assistant_listener_claim_blocked', {
        listener: listenerName,
        activeListener: this.activeListener,
        state: this.state
      });
      return false;
    }
    this.activeListener = listenerName;
    this.logger?.('assistant_listener_claimed', { listener: listenerName });
    return true;
  }

  releaseListener(listenerName) {
    if (!this.activeListener || this.activeListener !== listenerName) {
      return false;
    }
    this.activeListener = null;
    this.logger?.('assistant_listener_released', { listener: listenerName });
    return true;
  }

  hasListener(listenerName) {
    return this.activeListener === listenerName;
  }

  isListenerActive() {
    return this.activeListener !== null;
  }

  beginProcessing() {
    if (this.processing) {
      this.logger?.('assistant_processing_blocked', { state: this.state });
      return false;
    }
    this.processing = true;
    this.logger?.('assistant_processing_begin', { state: this.state });
    return true;
  }

  endProcessing() {
    this.processing = false;
    this.logger?.('assistant_processing_end', { state: this.state });
  }

  reset() {
    const previousState = this.state;
    this.activeListener = null;
    this.processing = false;
    this.state = ASSISTANT_STATES.IDLE;
    this.transitionCount = 0;
    this.lastTransition = null;
    this.logger?.('assistant_state_reset', { state: this.state });
    this.onStateChange?.(this.state, previousState, { reset: true });
  }
}
