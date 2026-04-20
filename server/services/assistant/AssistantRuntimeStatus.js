const runtimeState = {
  enabled: true,
  demoMode: false,
  mode: 'active',
  reasons: [],
  startup: {
    checked: false,
    running: false,
    live: false,
    status: 'pending',
    checkedAt: null,
    checks: {},
    issues: []
  },
  updatedAt: new Date().toISOString()
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function touch() {
  runtimeState.updatedAt = new Date().toISOString();
}

function beginStartupCheck({ live = false } = {}) {
  runtimeState.startup = {
    checked: false,
    running: true,
    live,
    status: 'running',
    checkedAt: null,
    checks: {},
    issues: []
  };
  if (!runtimeState.demoMode) {
    runtimeState.enabled = false;
    runtimeState.mode = 'starting';
  }
  touch();
  return getStatus();
}

function setStartupResult(result = {}) {
  const issues = Array.isArray(result.issues) ? result.issues : [];

  runtimeState.startup = {
    checked: true,
    running: false,
    live: Boolean(result.live),
    status: result.status || (issues.length > 0 ? 'degraded' : 'ok'),
    checkedAt: result.checkedAt || new Date().toISOString(),
    checks: result.checks || {},
    issues
  };
  runtimeState.enabled = Boolean(result.enabled);
  runtimeState.reasons = issues;
  runtimeState.mode = runtimeState.demoMode ? 'demo' : runtimeState.enabled ? 'active' : 'disabled';
  touch();
  return getStatus();
}

function setDemoMode(enabled, reason) {
  runtimeState.demoMode = Boolean(enabled);
  if (reason) {
    runtimeState.reasons = Array.from(new Set([...runtimeState.reasons, reason]));
  }
  runtimeState.mode = runtimeState.demoMode ? 'demo' : runtimeState.enabled ? 'active' : 'disabled';
  touch();
  return getStatus();
}

function disableAssistant(reason, extra = {}) {
  runtimeState.enabled = false;
  if (reason) {
    runtimeState.reasons = Array.from(new Set([...runtimeState.reasons, reason]));
  }
  if (extra.startup) {
    runtimeState.startup = {
      ...runtimeState.startup,
      ...extra.startup,
      checked: true,
      running: false,
      issues: Array.from(new Set([...(runtimeState.startup.issues || []), ...(extra.startup.issues || [])]))
    };
  }
  runtimeState.mode = runtimeState.demoMode ? 'demo' : 'disabled';
  touch();
  return getStatus();
}

function enableAssistant(extra = {}) {
  runtimeState.enabled = true;
  if (extra.clearReasons) {
    runtimeState.reasons = [];
  }
  runtimeState.mode = runtimeState.demoMode ? 'demo' : 'active';
  touch();
  return getStatus();
}

function getStatus() {
  return clone({
    ...runtimeState,
    available: runtimeState.enabled || runtimeState.demoMode
  });
}

function isLiveAssistantEnabled() {
  return runtimeState.enabled;
}

function isDemoMode() {
  return runtimeState.demoMode;
}

module.exports = {
  beginStartupCheck,
  setStartupResult,
  setDemoMode,
  disableAssistant,
  enableAssistant,
  getStatus,
  isLiveAssistantEnabled,
  isDemoMode
};