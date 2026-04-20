# Smart OPD Graph Node Assignments

This file turns the Graphify node graph into a project-wide ownership map so the connected nodes can be understood and maintained across the codebase.

## 1. Core Hubs

### App shell and auth
- `client/src/App.jsx`
  - Owns route entry, `ProtectedRoute`, and `PublicRoute`
  - Connects authenticated routes to `AppLayout`
- `client/src/context/AuthContext.jsx`
  - Owns current user state, token restore, login/signup/OTP/logout
  - Serves as the main dependency for route guards and user-facing pages
- `client/src/components/AppLayout.jsx`
  - Owns shared sidebar, top bar, and global overlays
  - Mounts `VoiceAssistant` once for the whole authenticated UI

### MediAssist client runtime
- `client/src/assistant/VoiceAssistant.jsx`
  - Owns the visible assistant widget and interaction surface
- `client/src/assistant/AssistantRuntime.js`
  - Primary client orchestration hub
  - Connects the assistant UI to wake-word detection, recording, command execution, TTS, route navigation, telemetry, language memory, and audio locking
- `client/src/assistant/AssistantStateMachine.js`
  - Owns deterministic assistant lifecycle transitions, invalid-transition failover, and listener locking
- `client/src/assistant/AudioSessionLock.js`
  - Owns single-owner control across wake-word, microphone recording, and TTS playback
- `client/src/assistant/AssistantTelemetry.js`
  - Owns runtime metrics such as wake, transcription, intent, and TTS latency plus conflict/error counters
- `client/src/assistant/LanguageSessionMemory.js`
  - Owns persisted assistant language state across turns and sessions
- `client/src/assistant/WakeWordService.js`
  - Owns Vosk wake-word activation
- `client/src/assistant/SpeechRecognitionService.js`
  - Owns microphone recording and `/api/transcribe` submission
- `client/src/assistant/VoiceOutputService.js`
  - Owns `/api/tts` playback and interruption handling
- `client/src/assistant/config.js`
  - Owns shared client assistant constants

### MediAssist server runtime
- `server/index.js`
  - Owns backend bootstrap and route registration
  - Connects assistant endpoints into the API surface
- `server/routes/assistant.js`
  - Main voice-assistant command route
  - Connects intent execution, medical reasoning, translation, and generic assistant replies
- `server/routes/transcribe.js`
  - Receives audio uploads and delegates to the OpenAI gateway
- `server/routes/tts.js`
  - Receives text and returns synthesized assistant audio
- `server/services/assistant/OpenAIAssistantGateway.js`
  - Owns OpenAI-backed STT, translation, assistant chat, and TTS
- `server/services/assistant/IntentService.js`
  - Owns action-style requests such as booking, queue lookup, room lookup, and navigation
- `server/services/assistant/MedicalService.js`
  - Owns safe, patient-facing medical guidance and result explanation
- `server/services/assistant/config.js`
  - Owns shared assistant model and language configuration

### Clinical workflow services
- `server/routes/appointment.js`, `consultation.js`, `lab.js`, `notification.js`, `workflow.js`, `vitalsKiosk.js`
  - Own the hospital workflow APIs outside the voice assistant
- `server/services/simulationEngine.js`
  - Owns demo workflow progression, queue updates, and generated notifications
- `server/services/qr.js`
  - Owns QR token generation for kiosk-related flows
- `server/models/*.js`
  - Own persistent workflow state for appointments, consultations, labs, medications, notifications, patients, vitals, and queue/workflow tracking

## 2. Project-Wide Connection Chains

### Auth shell chain
`App.jsx`
→ `ProtectedRoute` / `PublicRoute`
→ `useAuth()` from `AuthContext.jsx`
→ `AppLayout.jsx`
→ page modules under `client/src/pages/`

This is why `useAuth()` appears as one of the most connected graph nodes.

### Voice assistant client chain
`AppLayout.jsx`
→ `VoiceAssistant.jsx`
→ `AssistantRuntime.js`
→ `AssistantStateMachine.js`, `AudioSessionLock.js`, `LanguageSessionMemory.js`, `AssistantTelemetry.js`
→ `AssistantStateMachine.js`
→ `WakeWordService.js`
→ `SpeechRecognitionService.js`
→ `VoiceOutputService.js`

This is the active browser-side assistant path.

### Runtime reliability chain
`AssistantRuntime.js`
→ `AssistantStateMachine.js`
→ `AudioSessionLock.js`
→ `LanguageSessionMemory.js`
→ `AssistantTelemetry.js`

This is the control layer that keeps the assistant deterministic, single-owner on audio, multilingual across turns, and observable during failures.

### Voice assistant API chain
`AssistantRuntime.js`
→ `/api/assistant/command`
→ `server/routes/assistant.js`
→ `IntentService.js` and `MedicalService.js`
→ `OpenAIAssistantGateway.js`

The runtime also calls:
- `/api/transcribe` for STT
- `/api/tts` for playback audio

### Workflow data chain
`IntentService.js`
→ `Appointment`, `LabResult`, `Medication`, `Notification`, `WorkflowState`

This is the main server-side graph edge set that ties conversational intent into the actual OPD workflow.

### Branding and document chain
- `PROJECT-REPORT.md`, `DEPLOYMENT.md`, `client/README.md`
  - describe the application, deployment surface, and frontend shell
- `client/public/srm-logo.png`, `client/public/srm-logo.svg`, `client/public/favicon.svg`
  - supply the branding and shell identity nodes that appear in the graph

## 3. Community Assignments

### Community: Auth shell
Assigned files:
- `client/src/App.jsx`
- `client/src/context/AuthContext.jsx`
- `client/src/components/AppLayout.jsx`
- auth and core page files that call `useAuth()`

### Community: MediAssist runtime
Assigned files:
- `client/src/assistant/AssistantRuntime.js`
- `client/src/assistant/AssistantStateMachine.js`
- `client/src/assistant/AudioSessionLock.js`
- `client/src/assistant/AssistantTelemetry.js`
- `client/src/assistant/LanguageSessionMemory.js`
- `client/src/assistant/VoiceAssistant.jsx`
- `client/src/assistant/WakeWordService.js`
- `client/src/assistant/SpeechRecognitionService.js`
- `client/src/assistant/VoiceOutputService.js`

### Community: Assistant command execution
Assigned files:
- `server/routes/assistant.js`
- `server/services/assistant/IntentService.js`
- `server/services/assistant/MedicalService.js`
- `server/services/assistant/OpenAIAssistantGateway.js`

### Community: Clinical workflow
Assigned files:
- `server/routes/appointment.js`
- `server/routes/consultation.js`
- `server/routes/lab.js`
- `server/routes/notification.js`
- `server/routes/workflow.js`
- `server/services/simulationEngine.js`
- `server/models/*.js`

### Community: OTP and notifications
Assigned files:
- `server/services/otp.js`
- `server/routes/auth.js`
- `server/routes/notification.js`

## 4. Active vs Legacy AI Nodes

### Active assistant nodes
- `client/src/assistant/*`
- `server/routes/assistant.js`
- `server/routes/transcribe.js`
- `server/routes/tts.js`
- `server/services/assistant/*`

### Legacy compatibility nodes
- `server/services/ai.js`
- `server/routes/ai.js`

These legacy nodes stay in the project only as rebuild-safe compatibility shims. They are not the active MediAssist pipeline and should not be treated as the primary connection path.

## 5. Maintenance Rule

When adding a new feature, attach it to the graph through the correct ownership layer instead of wiring it directly across layers:

- UI feature changes go through `App.jsx`, `AppLayout.jsx`, or page modules
- Voice assistant UI changes go through `VoiceAssistant.jsx`
- Assistant behavior changes go through `AssistantRuntime.js`
- State enforcement goes through `AssistantStateMachine.js`
- Audio concurrency goes through `AudioSessionLock.js`
- Runtime observability goes through `AssistantTelemetry.js`
- Language persistence goes through `LanguageSessionMemory.js`
- Device/audio changes go through the specific assistant service in `client/src/assistant/`
- Assistant API behavior goes through `server/routes/assistant.js`
- Intentful OPD actions go through `IntentService.js`
- Medical reasoning goes through `MedicalService.js`
- OpenAI transport concerns go through `OpenAIAssistantGateway.js`

This keeps the node graph aligned with the real architecture instead of creating accidental cross-project edges.