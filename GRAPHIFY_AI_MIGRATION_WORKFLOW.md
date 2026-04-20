# Graphify AI Migration Workflow

## Goal

Complete the MediAssist AI migration without rebuilding working systems from scratch.

The target architecture is one assistant pipeline:

Wake word -> Speech -> Intent -> Action -> Response -> Voice

## Core Rules

1. Only one AI gateway must exist.
2. All AI routes must use the active assistant stack.
3. The legacy compatibility layer must not be the execution path for user-facing AI features.
4. Run one Graphify node at a time.
5. Return short structured node results.

## Single Source of Truth

Use only these backend services for AI execution:

- `server/services/assistant/OpenAIAssistantGateway.js`
- `server/services/assistant/MedicalService.js`
- `server/services/assistant/IntentService.js`
- `server/services/assistant/UnifiedAssistantService.js`

Do not route production AI behavior through `server/services/ai.js`.

## Execution Model

- Do not process the whole project at once.
- Run one node, inspect the result, then continue.
- Prefer migration over rewrite.
- Preserve working assistant paths while replacing legacy callers.

## Node Output Format

```text
Status:
Success | Failed

Files scanned:
[list]

Files modified:
[list]

Issues found:
[list]

Fix applied:
[list]

Next node:
[node name]
```

## Root Graph Prompt

```text
You are an AI systems engineer operating inside a Graphify workflow.

Your task is to stabilize and complete the AI migration for the MediAssist system.

The system currently contains two AI stacks:

New assistant stack (active)
Legacy compatibility stack (disabled)

You must safely migrate all remaining features to the new assistant stack.

Do NOT rebuild everything from scratch.
Do NOT remove working components.

# Graphify AI Reliability Workflow

## Goal

Keep the unified MediAssist AI stack intact and harden the runtime so the assistant behaves predictably in production.

The backend architecture is already correct:

Wake word -> Speech -> Intent -> Action -> Response -> Voice

The operational hardening loop is now:

Health -> Config -> State -> Audio lock -> Intent threshold -> Language memory -> Telemetry -> Smoke -> Performance -> Final validation

## Keep As-Is

These services are already the correct execution core and should not be redesigned:

- `server/services/assistant/UnifiedAssistantService.js`
- `server/services/assistant/IntentService.js`
- `server/services/assistant/MedicalService.js`
- `server/services/assistant/OpenAIAssistantGateway.js`
- `server/routes/assistant.js`
- `server/routes/transcribe.js`
- `server/routes/tts.js`

Add reliability controls around them instead of replacing them.

## Core Rules

1. Keep one backend AI execution path.
2. Treat runtime-control nodes as overlays on the unified stack, not as replacement architecture.
3. Use the compatibility layer only as a passthrough, never as a design center.
4. Run one Graphify node at a time.
5. Return short structured node results.

## Single Source of Truth

Use only these backend services for AI execution:

- `server/services/assistant/OpenAIAssistantGateway.js`
- `server/services/assistant/MedicalService.js`
- `server/services/assistant/IntentService.js`
- `server/services/assistant/UnifiedAssistantService.js`

Use only these client files for runtime reliability controls:

- `client/src/assistant/AssistantRuntime.js`
- `client/src/assistant/AssistantStateMachine.js`
- `client/src/assistant/AudioSessionLock.js`
- `client/src/assistant/LanguageSessionMemory.js`
- `client/src/assistant/AssistantTelemetry.js`

Do not route production AI behavior through `server/services/ai.js`.

## Execution Model

- Do not process the whole project at once.
- Run one node, inspect the result, then continue.
- Preserve the unified backend stack while tightening runtime control, telemetry, and smoke coverage.
- Prefer deterministic runtime behavior over adding new model complexity.

## Node Output Format

```text
Status:
Success | Failed

Files scanned:
[list]

Files modified:
[list]

Issues found:
[list]

Fix applied:
[list]

Next node:
[node name]
```

## Root Graph Prompt

```text
You are an AI systems engineer operating inside a Graphify workflow.

Your task is to harden the operational reliability of the MediAssist assistant.

The backend AI architecture is already unified.

Do NOT redesign these services:
- UnifiedAssistantService
- IntentService
- MedicalService
- OpenAIAssistantGateway

Do NOT rebuild the assistant from scratch.
Do NOT replace the unified backend stack.

Instead, enforce runtime control and observability around the existing path.

SYSTEM GOAL

Maintain one stable assistant pipeline:

Wake word -> Speech -> Intent -> Action -> Response -> Voice

RUNTIME HARDENING GOAL

Add:
- deterministic state transitions
- single audio-session control
- intent confidence gating
- language session persistence
- runtime telemetry
- endpoint smoke coverage

EXECUTION MODEL

Run one node at a time.
Return short structured responses.
Never process the entire project at once.
```

## Final Node Sequence

### NODE_0_SYSTEM_HEALTH_CHECK

Purpose:

Verify that the unified assistant stack is healthy before changing runtime controls.

Run:

- `npm run health:assistant`
- `npm run health:assistant:live`

Check:

- assistant chat
- medical guidance
- text-to-speech
- speech-to-text

### NODE_1_CONFIG_VALIDATION

Purpose:

Keep runtime configuration explicit and aligned across client, server, and production templates.

Check:

- active assistant models
- supported languages
- intent confidence threshold
- Vosk wake-word configuration

### NODE_2_STATE_MACHINE_ENFORCEMENT

Purpose:

Enforce deterministic assistant transitions and a single active state at all times.

Required states:

- `IDLE`
- `WAITING_FOR_WAKE_WORD`
- `WAKE_DETECTED`
- `LISTENING`
- `PROCESSING`
- `SPEAKING`
- `RETURN_TO_IDLE`
- `ERROR`

Files:

- `client/src/assistant/AssistantStateMachine.js`
- `client/src/assistant/AssistantRuntime.js`

Success:

- invalid transitions fail safe
- only one state is active at a time
- error recovery returns cleanly to idle or wake waiting

### NODE_3_AUDIO_LOCK_CONTROL

Purpose:

Allow only one audio owner at a time across wake-word listening, recording, and TTS playback.

Files:

- `client/src/assistant/AudioSessionLock.js`
- `client/src/assistant/AssistantRuntime.js`
- `client/src/assistant/WakeWordService.js`
- `client/src/assistant/SpeechRecognitionService.js`
- `client/src/assistant/VoiceOutputService.js`

Success:

- no dual voice playback
- no overlapping microphone sessions
- no parallel audio command loops

### NODE_4_INTENT_CONFIDENCE_CONTROL

Purpose:

Require structured intents to clear an explicit confidence threshold before executing actions.

Files:

- `server/services/assistant/config.js`
- `server/services/assistant/UnifiedAssistantService.js`

Rule:

- if confidence < threshold -> fall back to assistant chat path

### NODE_5_LANGUAGE_SESSION_MEMORY

Purpose:

Persist multilingual session state so the assistant stays consistent across turns.

Store:

- `last_language`
- `confidence_score`
- `translation_mode`

Files:

- `client/src/assistant/LanguageSessionMemory.js`
- `client/src/assistant/AssistantRuntime.js`

### NODE_6_RUNTIME_TELEMETRY

Purpose:

Collect real runtime metrics for observability and debugging.

Track:

- `wake_word_latency`
- `transcription_latency`
- `intent_latency`
- `tts_latency`
- `error_rate`
- `microphone_conflicts`
- `duplicate_requests`

Files:

- `client/src/assistant/AssistantTelemetry.js`
- `client/src/assistant/AssistantRuntime.js`
- `client/src/assistant/WakeWordService.js`
- `client/src/assistant/SpeechRecognitionService.js`
- `client/src/assistant/VoiceOutputService.js`

### NODE_7_ENDPOINT_SMOKE_TEST

Purpose:

Validate the authenticated HTTP assistant surface, not just service-level logic.

Run:

- `npm run smoke:assistant:endpoints`

Check:

- `/api/assistant/health`
- `/api/assistant/command`
- `/api/tts`
- `/api/transcribe`

### NODE_8_PERFORMANCE_VALIDATION

Purpose:

Check runtime latency and bundle impact after reliability controls are added.

Check:

- wake-word responsiveness
- command round-trip timing
- TTS generation timing
- Vosk bundle size warning status

### NODE_9_FINAL_ASSISTANT_VALIDATION

Purpose:

Verify the complete production assistant loop.

Validate:

- wake word
- typed command
- appointment command
- multilingual reply
- voice output
- cancel-and-recover path