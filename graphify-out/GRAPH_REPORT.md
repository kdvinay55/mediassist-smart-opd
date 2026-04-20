# Graph Report - C:\Users\kdvvi\Desktop\MEDICAL\smart-opd  (2026-04-20)

## Corpus Check
- 95 files · ~63,350 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 294 nodes · 583 edges · 15 communities detected
- Extraction: 50% EXTRACTED · 50% INFERRED · 0% AMBIGUOUS · INFERRED: 293 edges (avg confidence: 0.55)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]

## God Nodes (most connected - your core abstractions)
1. `AssistantRuntime` - 18 edges
2. `IntentService` - 17 edges
3. `useAuth()` - 14 edges
4. `logAi()` - 14 edges
5. `AssistantStateMachine` - 12 edges
6. `SpeechRecognitionService` - 9 edges
7. `OpenAIAssistantGateway` - 8 edges
8. `MedicalService` - 7 edges
9. `VoiceOutputService` - 6 edges
10. `WakeWordService` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Client Icon Sprite` --supplies iconography to--> `Web Dashboard`  [INFERRED]
  client/public/icons.svg → DEPLOYMENT.md
- `Client Hero Illustration` --supports visuals for--> `Web Dashboard`  [INFERRED]
  client/src/assets/hero.png → DEPLOYMENT.md
- `SRM BioVault Brand` --brands--> `Web Dashboard`  [INFERRED]
  client/public/srm-logo.svg → DEPLOYMENT.md
- `SRM BioVault Brand` --brands--> `Patient Mobile App`  [INFERRED]
  client/public/srm-logo.svg → DEPLOYMENT.md
- `ProtectedRoute()` --calls--> `useAuth()`  [INFERRED]
  client\src\App.jsx → client\src\context\AuthContext.jsx

## Communities

### Community 0 - "Community 0"
Cohesion: 0.0
Nodes (0): 

### Community 1 - "Community 1"
Cohesion: 0.0
Nodes (17): ProtectedRoute(), PublicRoute(), AppLayout(), Appointments(), useAuth(), Consultations(), Dashboard(), LabResults() (+9 more)

### Community 2 - "Community 2"
Cohesion: 0.0
Nodes (4): AssistantRuntime, AssistantStateMachine, has(), parseVitalsFromText()

### Community 3 - "Community 3"
Cohesion: 0.0
Nodes (5): SpeechRecognitionService, VoiceAssistant(), VoiceOutputService, normalizeWakeText(), WakeWordService

### Community 4 - "Community 4"
Cohesion: 0.0
Nodes (9): extractBookingEntities(), formatDateForSpeech(), IntentService, pickAvailableSlot(), ruleBasedIntent(), generateQrToken(), qrPayload(), toBuffer() (+1 more)

### Community 5 - "Community 5"
Cohesion: 0.0
Nodes (3): MedicalService, inferLanguageFromScript(), OpenAIAssistantGateway

### Community 6 - "Community 6"
Cohesion: 0.0
Nodes (9): connectDB(), assignQueue(), checkMedicationReminders(), createNotification(), generateSimulatedResults(), initSimulation(), notifyLabStatus(), scheduleFollowUp() (+1 more)

### Community 7 - "Community 7"
Cohesion: 0.0
Nodes (13): chatWithAI(), generateDiagnosis(), generatePatientHistorySummary(), generateReferralLetter(), generateTreatmentPlan(), generateTriageAssessment(), generateWellnessPlan(), interpretLabResults() (+5 more)

### Community 8 - "Community 8"
Cohesion: 0.0
Nodes (12): Client HTML Shell, Backend API, Patient Mobile App, Service Worker, SRM BioVault Brand, Web Dashboard, Deployment Guide, Client Hero Illustration (+4 more)

### Community 9 - "Community 9"
Cohesion: 0.0
Nodes (4): sendEmailOTP(), sendOTP(), sendSMSOTP(), toFast2SmsNumber()

### Community 10 - "Community 10"
Cohesion: 0.0
Nodes (7): App Shell, Assistant API Surface, Auth Shell, Clinical Workflow, MediAssist Runtime, Graph Node Assignments, Project Report

### Community 11 - "Community 11"
Cohesion: 0.0
Nodes (5): React, Vite, Client README, React Logo, Vite Logo

### Community 12 - "Community 12"
Cohesion: 0.0
Nodes (0): 

### Community 13 - "Community 13"
Cohesion: 0.0
Nodes (0): 

### Community 14 - "Community 14"
Cohesion: 0.0
Nodes (0): 

## Knowledge Gaps
- **8 isolated node(s):** `SRM BioVault Favicon`, `Client Icon Sprite`, `SRM Institute Seal SVG`, `Client Hero Illustration`, `React Logo` (+3 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 12`** (1 nodes): `eslint.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (1 nodes): `vite.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (1 nodes): `sw.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.