# AI System Audit Report

Generated on: 2026-04-20  
Project: Smart OPD / MediAssist  
Audit scope: frontend AI entry points, backend AI routes, assistant services, model configuration, runtime health, and migration status  
Audit method: source inspection plus local health checks and build validation  
Provider test status: live OpenAI validation executed successfully during this audit  
Secret handling: secrets are intentionally omitted from this report

## 1. Executive Summary

| Item | Status | Details |
| --- | --- | --- |
| Overall AI state | Operational | The app now uses a single active backend AI pipeline for assistant, compatibility, and business-route AI features. |
| Backend AI architecture | Unified | `UnifiedAssistantService` is the execution layer for assistant chat, medical guidance, compatibility endpoints, and migrated business routes. |
| Legacy compatibility layer | Safe passthrough | `server/services/ai.js` remains only as a compatibility wrapper and now delegates to the unified assistant service instead of returning disabled responses. |
| Migration state | Implemented | Symptom, triage, consultation, lab, wellness, and kiosk AI paths were migrated to the active stack. |
| Provider validation | Passed | Non-live and live assistant health checks both succeeded, including assistant chat, medical guidance, TTS, and STT. |
| Build validation | Passed | Client production build completed successfully after the migration changes. |
| Immediate engineering priority | Medium | Secret rotation, CI scheduling for smoke coverage, and an explicit production decision on the current `DEMO_MODE=true` deployment posture remain the main follow-up items. |

## 2. Implemented Changes in This Migration

| Area | Change made | Working result |
| --- | --- | --- |
| Backend orchestration | Introduced `UnifiedAssistantService` as the single backend AI coordinator | Assistant chat, medical guidance, compatibility routes, and business-route AI now share one execution layer. |
| General AI gateway | Added `OpenAIAssistantGateway` for assistant chat, language detection, translation, STT, and TTS | Core assistant endpoints now use one provider-facing gateway instead of scattered logic. |
| Medical reasoning path | Added `MedicalService` with cautious medical prompting and safe fallbacks | Medical-looking questions and clinical text generation now route through a dedicated medical reasoning path. |
| Operational intent handling | Added or expanded `IntentService` rule-based workflows | Appointments, queue, lab results, medications, room lookup, reminders, and navigation can resolve without an LLM when the request is structured. |
| Dedicated assistant API surface | Standardized `POST /api/assistant/command`, `POST /api/transcribe`, `POST /api/tts`, and `GET /api/assistant/health` | The floating assistant now uses explicit, purpose-built routes. |
| Compatibility route reactivation | Reworked `server/routes/ai.js` and converted `server/services/ai.js` from a disabled shim into an active wrapper | Older page-level AI consumers still work, but now execute on the unified stack. |
| Clinical route migration | Consultation, lab, wellness, and kiosk routes were moved to unified assistant methods | Previously mixed or disabled AI features are now active on the same backend stack. |
| Client runtime hardening | `AssistantRuntime`, `SpeechRecognitionService`, and `VoiceOutputService` now abort or stop safely | Canceling recording or playback no longer leaves stale transcription, command, or TTS responses running. |
| Deterministic state control | Expanded the client state machine with `WAKE_DETECTED` and `ERROR` plus fail-safe transition handling | The assistant now enforces explicit runtime states instead of relying on loosely ordered events alone. |
| Single audio ownership | Added `AudioSessionLock` to gate wake-word listening, recording, and TTS | Only one audio owner can be active at a time, which prevents dual voice playback and overlapping microphone sessions. |
| Intent confidence gating | Added an explicit intent execution threshold in assistant config and command responses | Low-confidence intent detection now falls back to the assistant reply path instead of executing the wrong action. |
| Multilingual session persistence | Added `LanguageSessionMemory` for persisted `last_language`, `confidence_score`, and `translation_mode` | The assistant now carries language state across turns and open or close cycles more predictably. |
| Runtime telemetry | Added `AssistantTelemetry` with latency and conflict counters | Wake-word, transcription, intent, TTS, errors, microphone conflicts, and duplicate requests are now measurable at runtime. |
| Streaming reply path | Added `POST /api/assistant/command/stream` plus chunked reply playback in the client runtime | The assistant can now begin speaking before the full live reply completes while still falling back to the JSON command path safely. |
| Startup health verification | Added `AssistantRuntimeStatus` and `StartupHealthVerifier` into server boot | Database, OpenAI, assistant command, STT, and TTS are now verified during startup before live assistant routes stay enabled. |
| Demo fallback mode | Added `DemoAssistantEngine` plus browser speech fallbacks for expo-safe local behavior | The assistant can still guide common appointment, queue, lab, medication, room, and notification flows when live AI routes are unavailable. |
| Silent recovery orchestration | Added `RETRY` state and bounded recovery attempts for wake word, transcription, and TTS faults | Runtime errors now try to self-heal before surfacing a fallback response. |
| Latency alert system | Added telemetry thresholds and assistant status broadcasting | Slow wake, transcription, intent, and TTS paths now surface visible UI alerts. |
| Session timeout reset | Added a 5-minute runtime inactivity reset | Idle assistant sessions now stop audio, release the mic, and reset cleanly. |
| Status indicator surface | Added `AssistantStatusIndicator` to the app shell and voice assistant panel | Users and QA can now see checking, ready, demo, recovering, mic-blocked, and offline states directly in the UI. |
| Endpoint smoke coverage | Added an authenticated smoke script for the public assistant HTTP surface | `/api/assistant/health`, `/api/assistant/command`, `/api/tts`, and `/api/transcribe` can now be checked end-to-end with one scripted entry point. |
| Wake-word simplification | Standardized the active wake-word path on Vosk and removed Porcupine from active source and dependency surfaces | Wake-word behavior is clearer and uses the same local-browser engine everywhere that matters. |
| Config alignment | Aligned active model names and supported languages across client config, server config, and production env templates | Runtime behavior now matches the documented model set and language set. |
| Health tooling | Added scripted and HTTP health checks for the assistant stack | The repo now has repeatable non-live and live verification for chat, medical, TTS, and STT. |
| Documentation cleanup | Rewrote this report to reflect the completed migration state | The report now describes the system that actually runs today rather than an earlier mid-migration state. |

## 3. High-Level Verdict

| Area | Verdict | Why |
| --- | --- | --- |
| Global voice assistant | Working path | Uses active `/api/assistant`, `/api/assistant/command/stream`, `/api/transcribe`, and `/api/tts` routes. |
| Wake word detection | Working path | Runs locally in the browser with Vosk. |
| General chat replies | Working path | Routed through `OpenAIAssistantGateway` using `gpt-5` with forced same-language replies. |
| Medical guidance replies | Working path | Routed through `MedicalService` using `gpt-5`. |
| Speech-to-text | Working path | Audio is uploaded to backend transcription using `gpt-4o-transcribe`. |
| Text-to-speech | Working path | Backend synthesizes audio using `gpt-4o-mini-tts` and the client plays it safely. |
| Symptom checker AI | Working path | Calls `/api/ai/chat`, which now delegates into the unified assistant service. |
| Vitals triage AI | Working path | Calls `/api/ai/triage`, which now delegates into the unified assistant service. |
| Consultation AI | Working path | Diagnosis, chat, referral, and history summary routes now use `UnifiedAssistantService`. |
| Lab interpretation AI | Working path | Uses `UnifiedAssistantService.interpretLabResults()`. |
| Wellness plan AI | Working path | Uses `UnifiedAssistantService.generateWellnessPlan()`. |
| Kiosk AI summary and triage | Working path | Uses the unified assistant service for both summary and triage generation. |
| Consultation room voice dictation | Separate browser feature | Uses browser `SpeechRecognition`, not the OpenAI-backed assistant pipeline. |

## 4. Runtime Architecture

| Layer | Primary purpose | Primary files | Current status | Used by |
| --- | --- | --- | --- | --- |
| Client assistant runtime | Wake, listen, process, speak state machine | `client/src/assistant/*` | Active | Floating assistant widget mounted in app layout |
| Runtime reliability controls | State enforcement, audio concurrency control, language persistence, telemetry | `client/src/assistant/AssistantStateMachine.js`, `client/src/assistant/AudioSessionLock.js`, `client/src/assistant/LanguageSessionMemory.js`, `client/src/assistant/AssistantTelemetry.js` | Active | Floating assistant widget and runtime diagnostics |
| Startup runtime control | Boot-time assistant verification and live-route gating | `server/services/assistant/AssistantRuntimeStatus.js`, `server/services/assistant/StartupHealthVerifier.js`, `server/index.js` | Active | `/api/health`, `/api/health/diag`, and live assistant route availability |
| Unified assistant stack | Assistant chat, medical guidance, STT, TTS, triage, diagnoses, referrals, summaries, wellness, treatment plans | `server/services/assistant/UnifiedAssistantService.js`, `server/services/assistant/*` | Active | Assistant widget plus migrated business routes |
| Assistant API surface | Main AI endpoints | `server/routes/assistant.js`, `server/routes/transcribe.js`, `server/routes/tts.js` | Active | Voice assistant widget and health checks |
| Compatibility API surface | Backward-compatible AI endpoints | `server/routes/ai.js`, `server/services/ai.js` | Active passthrough | Symptom checker, vitals entry, and defensive compatibility |
| Business-route AI consumers | Consultation, lab, wellness, and kiosk AI features | `server/routes/consultation.js`, `server/routes/lab.js`, `server/routes/wellness.js`, `server/routes/vitalsKiosk.js` | Active | Doctor, patient, and kiosk workflows |
| Browser dictation path | Doctor note dictation inside consultation room | `client/src/pages/ConsultationRoom.jsx` | Independent browser feature | Consultation room only |

## 5. Feature Status Matrix

| Feature | Frontend entry point | Backend path | Current status | Notes |
| --- | --- | --- | --- | --- |
| Floating voice assistant widget | `client/src/assistant/VoiceAssistant.jsx` mounted from `client/src/components/AppLayout.jsx` | `/api/assistant`, `/api/assistant/command/stream`, `/api/transcribe`, `/api/tts` | Active | This remains the main AI experience and now performs startup preflight, recovery, timeout reset, visible status reporting, and streamed live replies. |
| Wake word: "Hey Medi" | `client/src/assistant/WakeWordService.js` | None, local browser processing | Active | Uses Vosk in browser, not OpenAI. |
| Spoken transcription | `client/src/assistant/SpeechRecognitionService.js` | `POST /api/transcribe` | Active | Uses backend transcription in normal mode and browser speech recognition fallback in demo mode, with retries and cancel support. |
| Assistant command execution | `client/src/assistant/AssistantRuntime.js` | `POST /api/assistant/command/stream` with fallback to `POST /api/assistant/command` | Active | Uses rule-based intent detection first, then chat or medical routing, and prefers the streaming route when live AI is available. |
| Spoken reply output | `client/src/assistant/VoiceOutputService.js` | `POST /api/tts` | Active | Stale TTS playback is canceled cleanly, streamed replies are spoken in sentence-sized chunks, and browser speech synthesis is available as a demo fallback. |
| Assistant state controller | `client/src/assistant/AssistantRuntime.js`, `client/src/assistant/AssistantStateMachine.js` | None, local runtime control | Active | Deterministic transitions now cover waiting, wake detected, listening, processing, speaking, return to idle, and error recovery. |
| Audio session lock | `client/src/assistant/AssistantRuntime.js`, `client/src/assistant/AudioSessionLock.js` | None, local runtime control | Active | Ensures wake word, recording, and TTS never own the audio pipeline at the same time. |
| Language session memory | `client/src/assistant/AssistantRuntime.js`, `client/src/assistant/LanguageSessionMemory.js` | Local browser storage | Active | Persists `last_language`, `confidence_score`, and `translation_mode` between assistant turns. |
| Runtime telemetry metrics | `client/src/assistant/AssistantTelemetry.js` and assistant services | Browser telemetry event and runtime snapshot | Active | Tracks wake-word, transcription, intent, TTS, and total response latency plus detected language, response language, confidence score, error rate, microphone conflicts, and duplicate requests through `window.__MEDIASSIST_TELEMETRY__` and the `mediassist:telemetry` browser event. |
| Startup verification status | `client/src/assistant/AssistantRuntime.js`, `client/src/assistant/AssistantStatusIndicator.jsx` | `/api/health/diag`, `/api/assistant/health` | Active | Assistant readiness, demo mode, microphone permission, and recovery status are surfaced to users and QA. |
| Demo fallback mode | `client/src/assistant/DemoAssistantEngine.js` and runtime services | Local client fallback plus degraded route signaling | Active | Expo or offline demos can still answer common assistant requests without live AI routes. |
| Latency alerting | `client/src/assistant/AssistantTelemetry.js`, `client/src/assistant/AssistantStatusIndicator.jsx` | Browser event and runtime snapshot | Active | Wake over 500 ms, transcription or intent over 1500 ms, TTS over 1000 ms, and total response time over 3000 ms now produce visible assistant status alerts. |
| Session timeout reset | `client/src/assistant/AssistantRuntime.js` | None, local runtime control | Active | After 5 minutes of inactivity, the assistant stops audio, releases locks, and resets to a clean state. |
| Assistant suggestions | Assistant UI | `GET /api/assistant/suggestions` | Active | Static suggestion list. |
| Assistant health endpoint | Admin and diagnostics flow | `GET /api/assistant/health` | Active | Supports config checks and live provider validation. |
| Assistant endpoint smoke script | Repo script and deployment diagnostics | `npm run smoke:assistant:endpoints` | Active | Requires `ASSISTANT_SMOKE_TOKEN` and checks `/api/assistant/health`, `/api/assistant/command`, `/api/tts`, and `/api/transcribe` end-to-end. |
| Symptom checker AI response | `client/src/pages/SymptomChecker.jsx` | `POST /api/ai/chat` | Active | Compatibility route delegates to unified assistant analysis. |
| Vitals entry AI triage | `client/src/pages/VitalsEntry.jsx` | `POST /api/ai/triage` | Active | Compatibility route delegates to unified assistant triage. |
| Consultation AI diagnosis | `client/src/pages/Consultations.jsx` and consultation routes | `POST /api/consultations/:id/ai-diagnosis` | Active | Route now uses `UnifiedAssistantService.generateConsultationDiagnosis()`. |
| Consultation AI chat | `client/src/pages/ConsultationRoom.jsx` | `POST /api/consultations/:id/chat` | Active | Route now uses `UnifiedAssistantService.chatForConsultation()`. |
| Consultation referral letter | Consultation routes | `POST /api/consultations/:id/referral` | Active | Route now uses `UnifiedAssistantService.generateReferralLetter()`. |
| Patient history summary | Consultation routes | `GET /api/consultations/:id/patient-history` | Active | Route now uses `UnifiedAssistantService.summarizePatientHistory()`. |
| Lab AI interpretation | `client/src/pages/LabResults.jsx`, `client/src/pages/LabDashboard.jsx` | `POST /api/lab/:id/ai-interpret` | Active | Route now uses `UnifiedAssistantService.interpretLabResults()`. |
| Wellness plan generation | `client/src/pages/WellnessPlan.jsx` | `GET /api/wellness/plan` | Active | Route now uses `UnifiedAssistantService.generateWellnessPlan()`. |
| Kiosk background AI summary | Kiosk flow | `POST /api/vitals-kiosk/:appointmentId/save` | Active | Uses `UnifiedAssistantService.generateKioskSummary()`. |
| Kiosk device-scan AI triage | Kiosk flow | `POST /api/vitals-kiosk/device-scan` | Active | Uses `UnifiedAssistantService.triageVitals()`. |
| Consultation room voice dictation | `client/src/pages/ConsultationRoom.jsx` | None, browser speech API | Separate local feature | Useful for dictation, but not part of the OpenAI-backed assistant stack. |

## 6. Models and Engines

| Function | Engine or model | Source of truth | Where used | Current status | Notes |
| --- | --- | --- | --- | --- | --- |
| Wake word detection | Vosk | `client/src/assistant/config.js`, `server/services/assistant/config.js` | `WakeWordService` | Active | Runs locally in browser via WebAssembly model. |
| Intent routing | Rule-based logic | `server/services/assistant/IntentService.js` | `/api/assistant/command` | Active | No LLM needed for structured actions such as appointments, queue, labs, medications, room lookup, and notifications. |
| General assistant chat | `gpt-5` | `server/services/assistant/config.js` | `OpenAIAssistantGateway` | Active | Used for assistant conversations, multilingual replies, and streamed live responses. |
| Medical guidance | `gpt-5` | `server/services/assistant/config.js` | `MedicalService` | Active | Used for cautious medical reasoning and clinical-style text generation. |
| Speech-to-text | `gpt-4o-transcribe` | `server/.env`, `server/.env.production`, `server/services/assistant/config.js` | `POST /api/transcribe` and live health checks | Active | Live health check successfully transcribed generated speech. |
| Text-to-speech | `gpt-4o-mini-tts` | `server/.env`, `server/.env.production`, `server/services/assistant/config.js` | `POST /api/tts` and live health checks | Active | Default voice resolves to `alloy`. |
| Browser consultation dictation | Web Speech API | Browser support in `ConsultationRoom.jsx` | Consultation room dictation | Separate | Not backed by backend transcription. |
| Legacy compatibility exports | Active assistant config | `server/services/ai.js` | Defensive compatibility only | Active passthrough | The old compatibility service now forwards into the unified assistant stack. |
| Porcupine fallback | Removed | Client package and env cleanup | None | Removed | The current wake-word implementation is Vosk-only. |

## 7. Supported Languages

| Code | Language |
| --- | --- |
| `en` | English |
| `hi` | Hindi |
| `te` | Telugu |
| `ta` | Tamil |
| `kn` | Kannada |
| `ml` | Malayalam |

## 8. Active Assistant Flow

| Step | Component | File or route | What happens |
| --- | --- | --- | --- |
| 1 | Voice assistant UI mounts globally | `client/src/components/AppLayout.jsx` | The floating assistant and shell-level status indicator are available across the app shell. |
| 2 | Startup preflight runs | `client/src/assistant/AssistantRuntime.js` | The runtime checks `/api/health/diag`, `/api/assistant/health`, and browser microphone permission before enabling voice interaction. |
| 3 | Live assistant status is resolved | `server/index.js`, `server/services/assistant/StartupHealthVerifier.js` | Boot-time verification decides whether live assistant routes stay enabled and exposes that result through `assistantRuntime` diagnostics. |
| 4 | Runtime arms wake waiting or demo readiness | `client/src/assistant/AssistantRuntime.js` | The runtime clears previous audio activity, moves to `WAITING_FOR_WAKE_WORD`, acquires the wake audio lock, and starts a wake-word latency span when voice input is allowed. |
| 5 | Wake word listener starts | `client/src/assistant/WakeWordService.js` | Browser microphone listens for "hey medi" using Vosk while the wake audio lock is active. |
| 6 | Wake is detected | `client/src/assistant/AssistantRuntime.js` | State moves to `WAKE_DETECTED`, wake latency telemetry is finalized, the wake lock is released, and the assistant prepares the greeting. |
| 7 | Greeting is spoken | `client/src/assistant/VoiceOutputService.js` | The runtime acquires the TTS audio lock, speaks the greeting, then releases the lock before listening. |
| 8 | Runtime enters listening | `client/src/assistant/AssistantRuntime.js` | State moves to `LISTENING`, the speech audio lock is acquired, and a bounded recording window starts. |
| 9 | Audio is captured | `client/src/assistant/SpeechRecognitionService.js` | Normal mode records with `MediaRecorder`; demo mode can use browser speech recognition instead; duplicate microphone requests are blocked and conflicts are counted. |
| 10 | Audio is transcribed | `POST /api/transcribe` or browser fallback | Backend route calls `OpenAIAssistantGateway.transcribeAudio()` in live mode, while demo mode can stay local; the client records transcription latency telemetry either way. |
| 11 | Language session is updated | `client/src/assistant/LanguageSessionMemory.js` | The detected language is persisted as `last_language` with a confidence score and translation mode for the session. |
| 12 | Command is submitted | `POST /api/assistant/command/stream` with JSON fallback | Client sends text, session language, confidence score, translation mode, and recent conversation history while tracking intent latency. |
| 13 | Unified orchestration runs | `server/services/assistant/UnifiedAssistantService.js` | Server normalizes language, falls back to automatic language detection when confidence is low, translates to English only when needed for rule-based intent detection, and forces the final reply language to match the active language. |
| 14 | Intent threshold is applied | `server/services/assistant/UnifiedAssistantService.js` | Structured actions execute only when confidence is at least `0.75`; otherwise the request falls through to assistant chat or medical guidance. |
| 15 | Demo fallback may activate | `client/src/assistant/DemoAssistantEngine.js` | If live AI is unavailable and demo mode is enabled, the runtime answers common assistant tasks locally instead of failing closed. |
| 16 | Reply language and telemetry are updated | `client/src/assistant/AssistantRuntime.js`, `client/src/assistant/AssistantTelemetry.js` | The reply language is persisted, telemetry counters are updated, and latency alerts are generated when thresholds are exceeded. |
| 17 | Audio reply is generated | `POST /api/tts` or browser fallback | Backend synthesizes audio in live mode; streamed replies are synthesized in chunks as sentences arrive, and demo mode can still fall back to browser speech synthesis while the TTS audio lock is held. |
| 18 | Recovery and timeout safeguards stay armed | `AssistantRuntime`, `AssistantStateMachine` | Wake word, transcription, and TTS errors can enter `RETRY`, and a 5-minute inactivity timer can reset the assistant to a clean state. |
| 19 | Reply is played and runtime resets | `client/src/assistant/VoiceOutputService.js` and `AssistantRuntime.js` | Assistant finishes speaking, releases the lock, transitions through `RETURN_TO_IDLE`, and re-arms wake-word waiting without stale playback. |

## 9. How Each AI Path Works

| AI path | Frontend or caller | Backend entry | Unified method or service | Stored side effects | User-visible result |
| --- | --- | --- | --- | --- | --- |
| Main voice assistant | `VoiceAssistant` and `AssistantRuntime` | `POST /api/assistant/command/stream` with fallback to `POST /api/assistant/command` | `UnifiedAssistantService.streamCommand()` and `UnifiedAssistantService.processCommand()` | Conversation history stays in client runtime; session language is persisted in browser storage; structured actions may trigger navigation; telemetry counters and status events are updated | Short reply is spoken back to the user, and live mode can start speaking before the full response completes |
| Speech-to-text | `SpeechRecognitionService` | `POST /api/transcribe` or browser fallback | `OpenAIAssistantGateway.transcribeAudio()` when live; browser speech recognition in demo mode | Detected language is fed into `LanguageSessionMemory`; transcription latency and retry behavior are recorded | Recorded audio becomes text plus detected language |
| Text-to-speech | `VoiceOutputService` | `POST /api/tts` or browser fallback | `OpenAIAssistantGateway.synthesizeSpeech()` when live; browser speech synthesis in demo mode | TTS latency is recorded, retries are bounded, and playback is guarded by the single audio-session lock | Reply text becomes playable audio |
| Symptom checker | `client/src/pages/SymptomChecker.jsx` | `POST /api/ai/chat` | `UnifiedAssistantService.analyzeSymptoms()` | None | Patient gets short medical-style guidance via compatibility route |
| Vitals entry triage | `client/src/pages/VitalsEntry.jsx` | `POST /api/ai/triage` | `UnifiedAssistantService.triageVitals()` | None | Patient sees triage-style assessment via compatibility route |
| Consultation diagnosis | Doctor consultation flows | `POST /api/consultations/:id/ai-diagnosis` | `UnifiedAssistantService.generateConsultationDiagnosis()` | `consultation.aiSuggestedDiagnosis` is saved | Doctor gets AI differential suggestions and raw response |
| Consultation chat | Consultation room | `POST /api/consultations/:id/chat` | `UnifiedAssistantService.chatForConsultation()` | Conversation is appended to `consultation.aiChatHistory` | Doctor gets contextual consultation assistance |
| Referral letter generation | Consultation route | `POST /api/consultations/:id/referral` | `UnifiedAssistantService.generateReferralLetter()` | Referral object and generated letter are saved on consultation | Doctor gets specialist referral text |
| Patient history summary | Consultation route | `GET /api/consultations/:id/patient-history` | `UnifiedAssistantService.summarizePatientHistory()` | No direct write beyond normal route response | Doctor gets a compressed summary built from patient, consult, meds, vitals, and labs |
| Lab interpretation | Lab results pages | `POST /api/lab/:id/ai-interpret` | `UnifiedAssistantService.interpretLabResults()` | `lab.aiInterpretation` is saved | Patient or doctor gets plain-language explanation of lab results |
| Wellness planning | Wellness page | `GET /api/wellness/plan` | `UnifiedAssistantService.generateWellnessPlan()` | No persistent write in this route | Patient gets a generated wellness plan plus patient summary |
| Kiosk save flow | Kiosk scan or assisted capture | `POST /api/vitals-kiosk/:appointmentId/save` | Immediate rule-based triage first, then `UnifiedAssistantService.generateKioskSummary()` in background | New vitals row is saved immediately; AI summary may update later | User gets instant triage feedback fast, then a richer AI summary can arrive asynchronously |
| Kiosk device-scan flow | Raspberry Pi or device client | `POST /api/vitals-kiosk/device-scan` with `X-Kiosk-Key` | `UnifiedAssistantService.triageVitals()` after QR and sensor validation | New vitals row is saved and appointment advances to `vitals-done` | Unattended kiosk can record vitals and attach AI triage without patient login |
| Legacy helper imports | Older server code using `server/services/ai.js` | Direct helper call | Compatibility wrapper forwards to unified service or gateway | No separate legacy state | Old helper names still work, but there is no second backend AI stack anymore |

## 10. Public AI Endpoint Inventory

### 10.1 Active core AI endpoints

| Public endpoint | Route file | Purpose | Backing implementation | Status |
| --- | --- | --- | --- | --- |
| `POST /api/assistant/command` | `server/routes/assistant.js` | Main assistant command and chat entry point | `UnifiedAssistantService` | Active |
| `GET /api/assistant/suggestions` | `server/routes/assistant.js` | Quick suggestion list for UI | Static list in route | Active |
| `GET /api/assistant/health` | `server/routes/assistant.js` | Configuration and live AI health checks | `UnifiedAssistantService.runHealthCheck()` | Active |
| `GET /api/health/diag` | `server/index.js` | Startup and runtime assistant diagnostics | `AssistantRuntimeStatus` plus app diagnostics | Active |
| `POST /api/transcribe` | `server/routes/transcribe.js` | Speech-to-text for uploaded audio | `OpenAIAssistantGateway.transcribeAudio()` | Active |
| `POST /api/tts` | `server/routes/tts.js` | Text-to-speech synthesis | `OpenAIAssistantGateway.synthesizeSpeech()` | Active |

### 10.2 Compatibility AI endpoints

| Public endpoint | Route file | Purpose | Actual behavior | Status |
| --- | --- | --- | --- | --- |
| `POST /api/ai/chat` | `server/routes/ai.js` | Compatibility chat and symptom analysis path | Delegates to `UnifiedAssistantService.analyzeSymptoms()` | Active |
| `POST /api/ai/triage` | `server/routes/ai.js` | Compatibility vitals triage path | Delegates to `UnifiedAssistantService.triageVitals()` | Active |
| `POST /api/ai/treatment-plan` | `server/routes/ai.js` | Compatibility treatment-plan path | Delegates to `UnifiedAssistantService.generateTreatmentPlan()` | Active |

### 10.3 AI-dependent business endpoints

| Public endpoint | Route file | Active call | Current state |
| --- | --- | --- | --- |
| `POST /api/consultations/:id/ai-diagnosis` | `server/routes/consultation.js` | `generateConsultationDiagnosis()` | Active |
| `POST /api/consultations/:id/chat` | `server/routes/consultation.js` | `chatForConsultation()` | Active |
| `POST /api/consultations/:id/referral` | `server/routes/consultation.js` | `generateReferralLetter()` | Active |
| `GET /api/consultations/:id/patient-history` | `server/routes/consultation.js` | `summarizePatientHistory()` | Active |
| `POST /api/lab/:id/ai-interpret` | `server/routes/lab.js` | `interpretLabResults()` | Active |
| `GET /api/wellness/plan` | `server/routes/wellness.js` | `generateWellnessPlan()` | Active |
| `POST /api/vitals-kiosk/:appointmentId/save` | `server/routes/vitalsKiosk.js` | `generateKioskSummary()` | Active |
| `POST /api/vitals-kiosk/device-scan` | `server/routes/vitalsKiosk.js` | `triageVitals()` | Active |

## 11. Frontend Entry Point Inventory

| Frontend file | User-facing role | Backend calls | Real AI stack behind it | Current state |
| --- | --- | --- | --- | --- |
| `client/src/assistant/VoiceAssistant.jsx` | Floating assistant UI | `/assistant/command`, `/transcribe`, `/tts` | Unified assistant stack | Active |
| `client/src/assistant/AssistantRuntime.js` | Orchestrates wake, listen, process, speak | `/assistant/command`, `/transcribe`, `/tts` | Unified assistant stack | Active |
| `client/src/pages/SymptomChecker.jsx` | Symptom question flow | `/ai/chat` | Compatibility route backed by unified assistant | Active |
| `client/src/pages/VitalsEntry.jsx` | Vitals capture plus AI triage | `/ai/triage` | Compatibility route backed by unified assistant | Active |
| `client/src/pages/ConsultationRoom.jsx` | Consultation AI chat and dictation | `/consultations/:id/chat` plus browser speech API | Unified assistant for chat, browser API for dictation | Mixed by design |
| `client/src/pages/Consultations.jsx` | Consultation AI diagnosis trigger | `/consultations/:id/ai-diagnosis` | Unified assistant stack | Active |
| `client/src/pages/LabResults.jsx` | Lab interpretation request | `/lab/:id/ai-interpret` | Unified assistant stack | Active |
| `client/src/pages/LabDashboard.jsx` | Lab interpretation trigger | `/lab/:id/ai-interpret` | Unified assistant stack | Active |
| `client/src/pages/WellnessPlan.jsx` | Wellness plan generation | `/wellness/plan` | Unified assistant stack | Active |

## 12. Key Backend Services

| Service | File | Role | Current status | Notes |
| --- | --- | --- | --- | --- |
| Unified assistant service | `server/services/assistant/UnifiedAssistantService.js` | Single orchestration layer for assistant, medical, triage, diagnosis, compatibility, and health checks | Active | This is the core backend AI entry point. |
| Assistant gateway | `server/services/assistant/OpenAIAssistantGateway.js` | General assistant chat, language detection, translation, STT, TTS | Active | Supports MIME-aware transcription input and aligned default voice handling. |
| Medical service | `server/services/assistant/MedicalService.js` | Cautious medical guidance | Active | Uses the medical reasoning model. |
| Intent service | `server/services/assistant/IntentService.js` | Rule-based operational intents | Active | Handles appointments, queue, room lookup, labs, medications, and notifications without an LLM. |
| Assistant config | `server/services/assistant/config.js` | Shared assistant constants | Active | Language list and model defaults are aligned across client and server. |
| Compatibility wrapper | `server/services/ai.js` | Old catch-all AI interface | Active passthrough | Kept for backward compatibility only; new code should use `UnifiedAssistantService` directly. |

## 13. Configuration Findings

| Finding | Evidence | Impact |
| --- | --- | --- |
| A real OpenAI API key exists in dev env | Present in `server/.env` during audit; value omitted from this report | If this file was committed or shared, the key should be rotated immediately. |
| Dev and production templates now align on STT and TTS | `server/.env.production` now uses `gpt-4o-transcribe` and `gpt-4o-mini-tts` | Deployment drift between local and production templates was reduced. |
| Intent execution now uses an explicit threshold | `server/services/assistant/config.js` exposes an intent threshold and `UnifiedAssistantService` returns it in command responses | Wrong-intent execution risk is lower and routing behavior is easier to inspect; the active threshold is `0.75` unless overridden by env. |
| Diagnostics now reflect active runtime model configuration | `/api/health/diag` now reports assistant config model values | Runtime visibility is more accurate. |
| Assistant health scripts were added | `npm run health:assistant` and `npm run health:assistant:live` exist in `server/package.json` | Repeatable AI validation is now part of the repo. |
| Endpoint smoke coverage is now scripted | `npm run smoke:assistant:endpoints` calls `scripts/assistant_endpoint_smoke.js` | Authenticated HTTP assistant checks can be run end-to-end without handcrafting requests; the script expects `ASSISTANT_SMOKE_TOKEN` and can take base URL and sample text overrides from env. |
| Startup assistant status is now exposed at runtime | `/api/health` and `/api/health/diag` now include `assistantRuntime` | Deployment and frontend runtime checks can now see whether live routes were enabled, disabled, or put into demo mode at boot. |
| Demo mode is currently enabled in the inspected runtime | Live `/api/health/diag` returned `demoMode: true` and `assistantRuntime.mode: demo` during this audit | Expo fallback logic is active right now, so production expectations should be set explicitly rather than assumed. |
| Assistant status is queryable from the browser runtime | `AssistantRuntime` writes to `window.__MEDIASSIST_ASSISTANT_STATUS__` and dispatches `mediassist:status` | UI surfaces and QA tooling can inspect startup, recovery, demo, microphone, and timeout state without scraping console logs. |
| Supported languages are aligned to the active set | Client and server assistant configs now expose `en`, `hi`, `te`, `ta`, `kn`, `ml` | Removed stale inactive language entries. |
| Language session state now persists in the browser | `client/src/assistant/LanguageSessionMemory.js` stores `last_language`, `confidence_score`, and `translation_mode` in local storage | Multilingual assistant behavior is more stable across turns and assistant restarts, including reopening the assistant widget. |
| Telemetry is queryable from the browser runtime | `AssistantTelemetry` writes to `window.__MEDIASSIST_TELEMETRY__` and dispatches `mediassist:telemetry` | QA and staging can inspect real runtime assistant metrics and alert thresholds without scraping console logs. |
| Client dependency surface is now Vosk-only for wake-word behavior | `client/package.json` contains `vosk-browser` and no Picovoice package | Active source and package manifests now match the intended wake-word engine. |
| Porcupine was removed from active source, but stale generated Android assets still contain old strings | Matches remain under generated `client/android/.../assets/...` outputs, not active source | Audits of generated build artifacts can still look noisy until those outputs are cleaned or rebuilt. |
| Client build still carries a large Vosk bundle warning | Production build completed with a large chunk warning | Functionality is intact, but bundle size could be improved later. |

## 14. Validation Performed During Audit

| Check | Result | Notes |
| --- | --- | --- |
| Source audit of AI frontend files | Passed | Assistant runtime, wake word, STT, TTS, UI mount points, and page-level AI calls were inspected. |
| Source audit of runtime-control modules | Passed | Deterministic state handling, audio locking, language session persistence, and telemetry modules were inspected. |
| Source audit of backend routes | Passed | Assistant, transcribe, tts, ai, consultation, lab, wellness, and kiosk routes were inspected. |
| Source audit of backend services | Passed | Gateway, medical service, intent service, unified assistant service, and compatibility layer were inspected. |
| Remaining server imports of `server/services/ai.js` | Passed | No server routes still import the legacy compatibility file directly. |
| Active Porcupine references in source and dependency surfaces | Passed | No active Porcupine usage remained in current source or package manifests; remaining matches are confined to generated Android outputs. |
| Compatibility wrapper runtime load check | Passed | Requiring `server/services/ai.js` reported active assistant and medical models plus the six-language set. |
| Intent threshold routing check | Passed | `UnifiedAssistantService.processCommand()` now uses an explicit configured threshold before executing action-style intents. |
| Stale rebuild markers and removed-language drift | Passed | Active surfaces no longer advertise the old rebuild shim behavior or inactive `mr` and `bn` language entries. |
| Non-live assistant health check | Passed | Returned `status: ok` with assistant `gpt-5`, medical `gpt-5`, STT `gpt-4o-transcribe`, TTS `gpt-4o-mini-tts`, wake-word `vosk`, and six supported languages. |
| Live assistant health check | Passed | Assistant reply, medical reply, TTS generation, and STT transcription all completed successfully. |
| Startup health verification on backend boot | Passed | Live `/api/health/diag` reported database, OpenAI, assistant command, STT, and TTS checks all `ok` under `assistantRuntime.startup.checks`. |
| Backend dev server launch | Passed | Backend responded on `http://localhost:5000/api/health/diag` during this audit. |
| Frontend dev server launch | Passed | Vite served the client on `http://localhost:5173/` during this audit. |
| Client production build | Passed | Vite build succeeded; only a large Vosk chunk warning remained. |
| Multilingual validation script | Passed | `npm --prefix server run validate:assistant:multilingual` passed English, Telugu, Tamil, low-confidence language-switch, and streamed Telugu-response scenarios. |
| Deployment assistant validation wiring | Passed | Root script `npm run validate:assistant:deploy` now runs `npm --prefix server run health:assistant:live` and `npm --prefix server run validate:assistant:multilingual`, and `render.yaml` uses `npm run deploy:build` so Render blocks deploys on assistant validation failures. |

## 15. Runtime Safeguards and Residual Drift

| Situation | Current behavior | Where implemented | Why it matters |
| --- | --- | --- | --- |
| Invalid or out-of-order assistant transitions occur | The runtime blocks the transition and fails safe into `ERROR`, then resets through `RETURN_TO_IDLE` | `AssistantStateMachine`, `AssistantRuntime` | Prevents event-order glitches from leaving the assistant in an undefined state. |
| Two runtime audio owners compete | A single audio lock allows only one owner across wake-word listening, recording, and TTS playback | `AudioSessionLock`, `AssistantRuntime` | Prevents dual voice playback, microphone overlap, and parallel audio loops. |
| User stops or cancels the assistant mid-flow | Pending command requests are aborted, recording is canceled, and TTS playback is stopped | `AssistantRuntime`, `SpeechRecognitionService`, `VoiceOutputService` | Prevents stale replies, duplicate audio, and late UI updates after cancel. |
| Empty or failed transcription | The runtime returns to wake-word waiting instead of sending an empty assistant command | `AssistantRuntime.finishListening()` | Keeps the assistant loop stable when audio capture produces no usable text. |
| Intent detection is uncertain | Structured actions execute only when confidence clears the explicit threshold; otherwise the request falls back to the chat path | `server/services/assistant/config.js`, `UnifiedAssistantService.processCommand()` | Reduces incorrect appointment, queue, room, or navigation actions caused by weak rule matches. |
| Multilingual context shifts between turns | The assistant stores `last_language`, `confidence_score`, and `translation_mode` in browser state and reloads that session language on restart | `LanguageSessionMemory`, `AssistantRuntime` | Keeps multilingual interactions more consistent across follow-up turns. |
| Debugging requires live assistant timing data | Runtime telemetry emits latency and conflict snapshots for wake word, transcription, intent, TTS, errors, microphone conflicts, and duplicate requests | `AssistantTelemetry`, `AssistantRuntime`, assistant client services | Moves observability beyond plain logs and into measurable assistant behavior. |
| Startup verification fails at boot | Live assistant routes return disabled or degraded status while runtime diagnostics still expose the failure state | `AssistantRuntimeStatus`, `StartupHealthVerifier`, `server/routes/assistant.js`, `server/routes/transcribe.js`, `server/routes/tts.js` | Prevents a half-configured assistant from accepting live requests silently. |
| Expo or offline demo needs to keep working | The runtime can switch to `DemoAssistantEngine`, browser speech recognition, and browser speech synthesis when demo mode is active | `AssistantRuntime`, `DemoAssistantEngine`, `SpeechRecognitionService`, `VoiceOutputService` | The assistant can still demonstrate core workflows even when live AI routes are unavailable. |
| Wake, transcription, intent, or TTS becomes slow | Telemetry thresholds generate latency alerts and the UI shows a slow-path status | `AssistantTelemetry`, `AssistantStatusIndicator` | Performance regressions become visible without opening dev tools. |
| Assistant sits idle for too long | A 5-minute inactivity timer stops audio, releases locks, and resets runtime state | `AssistantRuntime`, `AudioSessionLock`, `AssistantStateMachine` | Prevents stale microphone and playback ownership from surviving long idle periods. |
| User needs visible readiness or failure state | Status indicators show checking, ready, demo, recovering, mic-blocked, slow-path, or offline states | `AssistantStatusIndicator`, `AssistantRuntime` | Users and QA can understand runtime health without guessing. |
| OpenAI client is unavailable | Gateway and medical paths degrade to safe null or fallback responses instead of crashing the route | `OpenAIAssistantGateway`, `MedicalService`, `UnifiedAssistantService` fallback builders | The app can fail soft rather than hard when provider configuration is missing. |
| AI generation fails for clinical helpers | Triage, diagnosis, history summary, wellness plan, and referral generation fall back to conservative text or deterministic summaries | `UnifiedAssistantService` helper-specific fallback builders | Clinical workflows still return something usable enough for manual continuation. |
| Live health check is requested | Route allows config-only health to normal users but restricts live provider checks to admin users | `server/routes/assistant.js` | Prevents uncontrolled provider calls from any authenticated user. |
| Kiosk save path needs fast response | The route saves vitals and returns an instant rule-based summary first, then runs richer AI summary generation in the background | `server/routes/vitalsKiosk.js` | Keeps kiosk response time fast while still enriching the saved record later. |
| Old Porcupine code appears during repo-wide search | Only generated Android assets still show those strings; active source uses Vosk | Generated Android asset folders under `client/android` | This is cleanup debt, not evidence of a second active wake-word implementation. |

## 16. Runtime Reliability Controls

| Control | Implementation | Current status |
| --- | --- | --- |
| Assistant state machine enforced | `AssistantStateMachine` plus guarded transitions in `AssistantRuntime` | Implemented |
| Single audio session lock implemented | `AudioSessionLock` gates wake-word, recording, and TTS ownership | Implemented |
| Intent confidence threshold validation enabled | `UnifiedAssistantService` uses an explicit configured threshold before executing intents | Implemented |
| Language session persistence enabled | `LanguageSessionMemory` stores `last_language`, `confidence_score`, and `translation_mode` | Implemented |
| Runtime telemetry metrics collected | `AssistantTelemetry` tracks latency and conflict counters and emits runtime snapshots | Implemented |
| Startup health verification enforced | `StartupHealthVerifier` and `AssistantRuntimeStatus` validate boot-time readiness and gate live routes | Implemented |
| Demo fallback behavior enabled | `DemoAssistantEngine` plus browser STT and TTS fallbacks keep expo-safe behavior available | Implemented |
| Silent recovery flow enabled | `RETRY` state plus bounded retry counts handle wake word, transcription, and TTS faults | Implemented |
| Latency alert thresholds enabled | Wake, transcription, intent, and TTS spans now trigger alerts over configured thresholds | Implemented |
| Session timeout reset enabled | `AssistantRuntime` resets after 5 minutes of inactivity | Implemented |
| UI status indicator enabled | `AssistantStatusIndicator` surfaces runtime health inside the shell and assistant panel | Implemented |
| Automated endpoint smoke tests scripted | `npm run smoke:assistant:endpoints` runs authenticated assistant endpoint checks | Implemented as a script; scheduling still depends on CI or deployment wiring |
| Live assistant deployment validation enabled | Root script `npm run validate:assistant:deploy` and Render build command `npm run deploy:build` | Implemented |

### 16.1 How The Runtime Controls Work Together

| Runtime stage | Control that acts first | Follow-up control | Working result |
| --- | --- | --- | --- |
| Wake waiting | `AssistantStateMachine` moves to `WAITING_FOR_WAKE_WORD` | `AudioSessionLock` grants wake ownership and `AssistantTelemetry` starts wake latency timing | The assistant listens only when the runtime is clean and unlocked. |
| Startup preflight | `AssistantRuntime` reads health diagnostics and microphone permission | `AssistantStatusIndicator` surfaces checking, ready, demo, or offline state | Live voice interaction only starts when the runtime knows its startup posture. |
| Wake detection | `AssistantStateMachine` moves to `WAKE_DETECTED` | Wake lock is released and greeting TTS takes over the lock | Wake detection cannot overlap with recording or stale playback. |
| Recording | `AudioSessionLock` grants speech ownership | `SpeechRecognitionService` blocks duplicate mic requests and telemetry counts conflicts | Only one microphone session can run at a time. |
| Command execution | `LanguageSessionMemory` provides the current session language | `UnifiedAssistantService` applies the `0.75` intent threshold and chooses action, assistant, or medical path | Low-confidence commands fail safe to chat instead of executing the wrong action. |
| Reply playback | `AudioSessionLock` grants TTS ownership | `AssistantTelemetry` records TTS timing and `LanguageSessionMemory` persists the reply language | Spoken output stays single-owner and consistent with the session language. |
| Demo fallback | `AssistantRuntime` activates `DemoAssistantEngine` when live AI is unavailable in demo mode | Browser speech recognition and browser speech synthesis can replace live STT and TTS | Expo or offline demos can continue through common assistant flows instead of stopping. |
| Latency monitoring | `AssistantTelemetry` compares each latency span to configured thresholds | `AssistantStatusIndicator` surfaces a slow-path warning | Performance regressions become visible in the UI during QA and demos. |
| Idle reset | `AssistantRuntime` inactivity timer triggers a stop after 5 minutes | `AudioSessionLock` and `AssistantStateMachine` release ownership and return to a clean state | Long idle periods do not leave stale mic or playback resources running. |
| Error recovery | `AssistantStateMachine` fails into `ERROR` and `RETRY` | `AssistantRuntime` clears audio, emits telemetry, attempts bounded recovery, and returns through `RETURN_TO_IDLE` | Runtime faults recover predictably instead of leaving the assistant stuck. |

## 17. Engineering Conclusions

| Conclusion | Meaning |
| --- | --- |
| The mid-migration dual-stack problem was materially resolved | A single backend AI execution path now serves assistant, compatibility, and business-route AI flows. |
| Compatibility no longer means disabled behavior | Old compatibility routes and exports now forward into the active assistant system. |
| Audio stability improved at the client runtime layer | TTS, STT, and command requests now support cancellation to prevent stale playback and late responses. |
| Runtime reliability is now explicitly controlled | Deterministic state enforcement, single-owner audio locking, intent thresholding, language session memory, and telemetry are now built into the assistant runtime. |
| Startup and demo posture are now explicit instead of implicit | Boot-time verification, degraded-route gating, runtime status broadcasting, and demo fallback make assistant availability inspectable. |
| Expo resilience improved materially | Demo-mode browser fallbacks now let the assistant keep functioning for common flows even when live AI is unavailable. |
| Operational confidence is higher than the earlier audit state | Live provider validation and a successful production build now back the migration claims. |
| Remaining risk is mostly operational, not architectural | Secret hygiene, CI scheduling for smoke checks, deciding when `DEMO_MODE` should be active, bundle-size tuning, and cleanup of generated mobile assets are the main remaining concerns. |

## 18. Recommended Actions

| Priority | Action | Why |
| --- | --- | --- |
| P0 | Rotate the OpenAI key found in `server/.env` if it has been committed, shared, or exposed | Secret hygiene risk remains the most concrete unresolved issue. |
| P1 | Wire `npm run smoke:assistant:endpoints` into CI or deployment monitoring | The smoke script now exists, but it should run automatically to provide real operational coverage. |
| P1 | Review failures from `npm run validate:assistant:deploy` in deployment logs promptly | Live assistant health and multilingual validation are now automated during Render builds, so failed deploys should be triaged quickly. |
| P1 | Decide whether `DEMO_MODE=true` is appropriate for each environment | The inspected runtime is currently in demo mode, which is useful for expo resilience but should be explicit in production operations. |
| P1 | Review telemetry snapshots during QA and staging voice tests | The new runtime metrics are only useful if they are actually observed and baselined. |
| P2 | Clean or regenerate generated Android asset outputs before using them for code audits | This will remove stale Porcupine strings that are still present in built mobile artifacts. |
| P2 | Consider code splitting or lazy-loading around Vosk assets | This addresses the large bundle warning without affecting the AI migration itself. |
| P2 | Keep new code on `UnifiedAssistantService` rather than `server/services/ai.js` | The compatibility wrapper is now safe, but it should remain a fallback layer rather than the design center. |

## 19. Final Assessment

| Question | Answer |
| --- | --- |
| Is AI present in the codebase? | Yes, extensively. |
| Is the unified assistant stack implemented? | Yes. |
| Is the unified assistant stack configured to use real models? | Yes. |
| Was the stack proven with a live provider request in this audit? | Yes. |
| Are the formerly disabled symptom, triage, consultation, lab, wellness, and kiosk AI paths now migrated? | Yes. |
| Is there still a second active backend AI runtime? | No. Backend execution is unified; what remains from the older system is a compatibility wrapper, not a separate live stack. |
| Are runtime reliability controls now implemented around the unified stack? | Yes. Deterministic state enforcement, audio locking, intent thresholding, language session memory, telemetry, startup health verification, demo fallback, silent recovery, timeout reset, and scripted endpoint smoke coverage are now in place. |
| Are the latest startup, demo, recovery, latency-alert, timeout-reset, and status-indicator features implemented? | Yes. They are present in source, passed build and health validation, and were observed through the running frontend and backend during this audit. |
| What should be treated as the real AI system going forward? | The unified assistant stack under `server/services/assistant/*`, centered on `UnifiedAssistantService`. |
| Does a compatibility layer still exist? | Yes, but it now forwards into the active stack instead of acting as a disabled shim. |
| What is intentionally separate from the backend AI stack? | Browser wake-word detection with Vosk and consultation-room dictation using Web Speech remain local client features by design. |
