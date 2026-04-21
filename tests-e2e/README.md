# MediAssist E2E Test Suite (Playwright)

Production-grade end-to-end tests for the entire MediAssist Smart OPD application.
Covers Phases 1–16 of the QA blueprint: auth, every role workflow, AI assistant,
UI/responsive validation, frontend↔backend sync, DB persistence, error handling,
performance budgets, RBAC, visual regression, and a full cross-role smoke flow.

## Prerequisites

- Node.js 18+ (Node 20 recommended)
- MongoDB Atlas connection (already configured in `server/.env`)
- Free TCP ports `5000` (server) and `5173` (client)

## Install

```powershell
cd smart-opd/tests-e2e
npm install
npx playwright install chromium
```

## Run

```powershell
# Full suite (boots both server + client automatically)
npm test

# Interactive UI mode (great for debugging)
npm run test:ui

# Headed (see the browser)
npm run test:headed

# A single phase
npm run test:auth         # Phase 1
npm run test:patient      # Phase 2
npm run test:reception    # Phase 3
npm run test:doctor       # Phase 4-5
npm run test:lab          # Phase 7
npm run test:assistant    # Phase 8
npm run test:ui-validation # Phase 9 (also runs in tablet+mobile projects)
npm run test:sync         # Phase 10
npm run test:db           # Phase 11
npm run test:errors       # Phase 12
npm run test:perf         # Phase 13
npm run test:rbac         # Phase 14
npm run test:visual       # Phase 15  (first run creates baselines)
npm run test:flow         # Phase 16  (full E2E)
```

After a run:

```powershell
npm run report
```

opens the HTML report at `playwright-report/index.html`.

## Environment variables

| Var               | Default                  | Purpose                                    |
| ----------------- | ------------------------ | ------------------------------------------ |
| `BASE_URL`        | `http://localhost:5173`  | Frontend URL the tests browse to           |
| `API_URL`         | `http://localhost:5000`  | Backend URL for direct API calls           |
| `SKIP_WEBSERVER`  | unset                    | If `1`, do NOT auto-launch dev servers     |
| `CI`              | unset                    | If set, retries=2 and workers=1            |

To run against an already-running stack (e.g. Render):

```powershell
$env:SKIP_WEBSERVER='1'
$env:BASE_URL='https://mediassist-client.vercel.app'
$env:API_URL='https://mediassist-api.onrender.com'
npm test
```

## Project layout

```
tests-e2e/
├── playwright.config.js     # ESM config, web servers, projects, reporters
├── global-setup.js          # waits for /api/health, seeds /api/demo/seed
├── fixtures/
│   ├── api.js               # apiLogin (cached), apiContext, seedDemoData
│   ├── ui.js                # loginAs (JWT inject), uiLogin (form), helpers
│   └── test-data.js         # USERS, DEPARTMENTS, PERFORMANCE_BUDGET
└── tests/
    ├── 01-auth.spec.js                    # Phase 1
    ├── 02-patient-workflow.spec.js        # Phase 2
    ├── 03-reception-workflow.spec.js      # Phase 3
    ├── 04-doctor-workflow.spec.js         # Phase 4-5
    ├── 05-lab-workflow.spec.js            # Phase 7
    ├── 06-ai-assistant.spec.js            # Phase 8
    ├── 07-ui-validation.spec.js           # Phase 9 (desktop+tablet+mobile)
    ├── 08-frontend-backend-sync.spec.js   # Phase 10
    ├── 09-database-validation.spec.js     # Phase 11
    ├── 10-error-handling.spec.js          # Phase 12
    ├── 11-performance.spec.js             # Phase 13
    ├── 12-access-control.spec.js          # Phase 14
    ├── 13-visual-regression.spec.js       # Phase 15
    └── 14-end-to-end-flow.spec.js         # Phase 16
```

## Test accounts (seeded automatically)

| Role         | Identifier                  | Password      |
| ------------ | --------------------------- | ------------- |
| Admin        | `demo.admin@smartopd.com`   | `demo123`     |
| Receptionist | `reception@smartopd.com`    | `reception123`|
| Lab tech     | `lab@smartopd.com`          | `lab12345`    |
| Doctor       | `dr.patel@smartopd.com`     | `doctor123`   |
| Doctor       | `dr.sharma@smartopd.com`    | `doctor123`   |
| Doctor       | `dr.reddy@smartopd.com`     | `doctor123`   |
| Patient      | `rahul@patient.com`         | `patient123`  |
| Patient      | `priya@patient.com`         | `patient123`  |
| Patient      | `amit@patient.com`          | `patient123`  |

Seeding is idempotent and runs before every full suite via `global-setup.js`.

## Visual regression baselines

The first run of `13-visual-regression.spec.js` will fail and produce baseline
screenshots under `tests/13-visual-regression.spec.js-snapshots/`. Commit those
to Git as the source of truth for future runs.

## Performance budgets

Defined in `fixtures/test-data.js`:

- Page load:    `< 2000 ms` (suite allows 2× during cold dev startup)
- API response: `< 1000 ms` (suite allows 2×)
- Navigation:  `< 3000 ms`

## Troubleshooting

- **`/api/health` never responds**: confirm `server/.env` has `MONGODB_URI` and that port 5000 is free.
- **Login tests fail with "Invalid credentials"**: run `curl -X POST http://localhost:5000/api/demo/seed` manually.
- **Visual tests always fail**: delete `*-snapshots` folders and re-run to recreate baselines on this OS / browser version.
- **Flaky socket tests**: increase the polling timeout in `08-frontend-backend-sync.spec.js`.
