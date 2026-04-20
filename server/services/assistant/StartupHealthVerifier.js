const mongoose = require('mongoose');
const UnifiedAssistantService = require('./UnifiedAssistantService');

function connectionStateLabel(state) {
  return ['disconnected', 'connected', 'connecting', 'disconnecting'][state] || 'unknown';
}

function startupHealthRunsLive() {
  return !['0', 'false', 'no'].includes(String(process.env.ASSISTANT_STARTUP_HEALTH_LIVE || 'true').toLowerCase());
}

async function runStartupHealthVerification({ live = startupHealthRunsLive(), databaseError = null } = {}) {
  const assistantService = new UnifiedAssistantService();
  const checkedAt = new Date().toISOString();
  const dbState = connectionStateLabel(mongoose.connection.readyState);

  const result = {
    checkedAt,
    live,
    status: 'ok',
    enabled: true,
    checks: {
      database: {
        ok: mongoose.connection.readyState === 1 && !databaseError,
        state: dbState,
        error: databaseError?.message || null
      },
      openai: {
        ok: false,
        configured: false
      },
      assistantCommand: {
        ok: false
      },
      stt: {
        ok: false
      },
      tts: {
        ok: false
      }
    },
    issues: []
  };

  if (!result.checks.database.ok) {
    result.issues.push(`Database unavailable during startup (${dbState}).`);
  }

  try {
    const health = await assistantService.runHealthCheck({ live });
    const openAiReady = live
      ? Boolean(health?.checks?.assistant?.ok && health?.checks?.medical?.ok)
      : Boolean(health?.configured);

    result.checks.openai = {
      ok: openAiReady,
      configured: Boolean(health?.configured),
      status: health?.status || 'unknown',
      models: health?.models || {}
    };
    result.checks.stt = live
      ? {
          ok: Boolean(health?.checks?.transcribe?.ok),
          ...(health?.checks?.transcribe || {})
        }
      : {
          ok: Boolean(health?.models?.stt),
          model: health?.models?.stt || null
        };
    result.checks.tts = live
      ? {
          ok: Boolean(health?.checks?.tts?.ok),
          ...(health?.checks?.tts || {})
        }
      : {
          ok: Boolean(health?.models?.tts),
          model: health?.models?.tts || null
        };

    if (!result.checks.openai.ok) {
      result.issues.push('OpenAI startup validation failed.');
    }
    if (!result.checks.stt.ok) {
      result.issues.push('Speech-to-text startup validation failed.');
    }
    if (!result.checks.tts.ok) {
      result.issues.push('Text-to-speech startup validation failed.');
    }
  } catch (error) {
    result.checks.openai = {
      ok: false,
      configured: Boolean(process.env.OPENAI_API_KEY),
      error: error.message
    };
    result.issues.push(`OpenAI startup health verification failed: ${error.message}`);
  }

  try {
    const commandResult = await assistantService.processCommand({
      text: 'What can you help me with?',
      language: 'en',
      conversationHistory: []
    });
    result.checks.assistantCommand = {
      ok: Boolean(commandResult?.response),
      type: commandResult?.type || null,
      intent: commandResult?.intent || null
    };
    if (!result.checks.assistantCommand.ok) {
      result.issues.push('Assistant command startup validation failed.');
    }
  } catch (error) {
    result.checks.assistantCommand = {
      ok: false,
      error: error.message
    };
    result.issues.push(`Assistant command startup validation failed: ${error.message}`);
  }

  if (Object.values(result.checks).some((entry) => !entry.ok)) {
    result.enabled = false;
    result.status = 'degraded';
  }

  return result;
}

module.exports = runStartupHealthVerification;