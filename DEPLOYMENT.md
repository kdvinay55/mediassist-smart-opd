# SRM BioVault — Deployment Guide

This project has **3 deployment targets**:

| Target | Audience | Platform |
|--------|----------|----------|
| Backend API | — | Render / Railway / Docker |
| Web Dashboard | Hospital Staff (Doctor, Lab, Reception) | Browser (same origin as backend) |
| Patient App | Patients | Android / iOS (Capacitor) |

---

## 1. Backend + Web Dashboard Deployment

The backend serves the API **and** the web dashboard (from `client/dist`).

### Option A: Deploy to Render (Recommended)

1. Push your code to GitHub
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your GitHub repo
4. Settings:
   - **Build Command**: `npm run deploy:build`
   - **Start Command**: `cd server && node index.js`
   - **Environment**: Node
5. Add environment variables:
   ```
   NODE_ENV=production
   MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/smartopd
   JWT_SECRET=<random-string>
   OPENAI_API_KEY=<your-key>
   CLIENT_URL=https://your-app.onrender.com,capacitor://localhost
   ```
   The build now blocks deployment if `npm run health:assistant:live` or `npm run validate:assistant:multilingual` fails.
6. Deploy — the web dashboard is available at the Render URL

### Option B: Deploy to Railway

1. Push to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → Deploy from GitHub
3. Add a **MongoDB** plugin (or use MongoDB Atlas)
4. Set the same environment variables as above
5. Railway auto-detects the Dockerfile, or set:
   - **Build**: `npm run deploy:build`
   - **Start**: `cd server && node index.js`

### Deployment Validation Command

For any CI or deployment platform, `npm run validate:assistant:deploy` runs the two blocking assistant checks that now gate Render builds:

```bash
npm run validate:assistant:deploy
```

This executes:

```bash
npm --prefix server run health:assistant:live
npm --prefix server run validate:assistant:multilingual
```

### Option C: Docker

```bash
docker build -t srm-biovault .
docker run -p 5000:5000 \
  -e NODE_ENV=production \
  -e MONGO_URI=mongodb+srv://... \
  -e JWT_SECRET=secret \
  -e OPENAI_API_KEY=sk-... \
  -e CLIENT_URL=https://yourdomain.com \
  srm-biovault
```

### MongoDB Atlas Setup

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a free M0 cluster
3. Create a database user
4. Whitelist `0.0.0.0/0` (allow from anywhere) for cloud deployment
5. Get connection string → use as `MONGO_URI`

---

## 2. Patient Mobile App (Android)

The patient app is the same React frontend wrapped with Capacitor.

### Prerequisites
- [Android Studio](https://developer.android.com/studio) installed
- Java 17+ installed
- Android SDK installed via Android Studio

### Build Steps

```bash
cd client

# Set the backend URL for the mobile build
# Edit .env.mobile with your deployed backend URL:
#   VITE_API_URL=https://your-app.onrender.com

# Build with mobile env
cp .env.mobile .env.local
npm run build

# Sync web assets to Android project
npx cap sync android

# Open in Android Studio
npx cap open android
```

In Android Studio:
1. Wait for Gradle sync to complete
2. Connect an Android device or start an emulator
3. Click **Run** (green play button)

### Generate APK for Distribution

In Android Studio:
1. **Build** → **Generate Signed Bundle / APK**
2. Choose **APK**
3. Create or select a keystore
4. Build **release** variant
5. APK will be at `android/app/build/outputs/apk/release/`

### Live Reload During Development

For testing on a physical device connected to the same network:

```bash
cd client
# Temporarily point to your local dev server
npx cap run android --livereload --external
```

---

## 3. Environment Variables Reference

### Server (`server/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 5000) |
| `NODE_ENV` | Yes | `production` for deployment |
| `MONGO_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Secret for JWT signing |
| `OPENAI_API_KEY` | No | OpenAI API key for AI features |
| `OPENAI_MODEL_MEDICAL` | No | Model for medical analysis (default: gpt-5) |
| `OPENAI_MODEL_ASSISTANT` | No | Preferred model for assistant reasoning and multilingual replies (default: gpt-5) |
| `OPENAI_MODEL_NORMAL` | No | Backward-compatible assistant model override (default: gpt-5) |
| `CLIENT_URL` | Yes | Comma-separated allowed origins for CORS |
| `EMAIL_HOST` | No | SMTP host for email notifications |
| `EMAIL_PORT` | No | SMTP port |
| `EMAIL_USER` | No | SMTP username |
| `EMAIL_PASS` | No | SMTP password |

### Client (`client/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Mobile only | Backend URL (leave empty for web dashboard) |
| `VITE_PORCUPINE_ACCESS_KEY` | No | Picovoice key for wake word |
| `VITE_PORCUPINE_KEYWORD` | No | Wake word (default: jarvis) |

---

## 4. Architecture

```
┌──────────────────────────────────────────────────┐
│                   Render / Railway                │
│  ┌─────────────┐    ┌──────────────────────────┐ │
│  │  Express API │    │  Static Files (dist/)    │ │
│  │  /api/*      │    │  Web Dashboard           │ │
│  │  Socket.IO   │    │  (Hospital Staff)        │ │
│  └──────┬───────┘    └──────────────────────────┘ │
│         │                                         │
│         ▼                                         │
│  ┌─────────────┐                                  │
│  │ MongoDB Atlas│                                  │
│  └─────────────┘                                  │
└──────────────────────────────────────────────────┘
          ▲                        ▲
          │ HTTPS API              │ HTTPS (same origin)
          │                        │
┌─────────┴──────┐    ┌───────────┴──────────┐
│  Patient App   │    │  Hospital Browser     │
│  (Android/iOS) │    │  (Chrome/Safari)      │
│  Capacitor     │    │                       │
└────────────────┘    └──────────────────────┘
```

---

## Quick Start (Local Development)

```bash
# Terminal 1 — Backend
cd server
cp .env.production .env   # edit with your values
npm install
npm run dev

# Terminal 2 — Frontend
cd client
npm install
npm run dev
```

Web dashboard at `http://localhost:5173`, API at `http://localhost:5000`.
