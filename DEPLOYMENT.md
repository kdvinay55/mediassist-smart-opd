# SRM BioVault — Deployment Guide

## Production Architecture

```
User → Internet
         │
  ┌──────┴──────┐
  │              │
  ▼              ▼
Frontend       Backend
Vercel         Render
               │
               ▼
            Database
         MongoDB Atlas
```

### Live URLs

| Service | URL |
|---------|-----|
| Frontend (Vercel) | https://srm-mediassist.vercel.app |
| Backend (Render) | https://mediassist-api.onrender.com |
| GitHub Repo | https://github.com/kdvinay55/mediassist-smart-opd |
| Expo Project | https://expo.dev/accounts/vinay35/projects/srm-mediassist |
| MongoDB Atlas | mongodb+srv://\<cluster\>.mongodb.net/smartopd |

---

## 1. Frontend — Vercel

Already deployed at **https://srm-mediassist.vercel.app**.

### Env vars (set in Vercel dashboard)

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://mediassist-api.onrender.com` |

### Redeploy

```bash
cd client
vercel --prod --yes
```

### Custom Domain

The alias `srm-mediassist.vercel.app` is active. To add a custom domain:
```bash
vercel domains add yourdomain.com
```

---

## 2. Backend — Render

### Setup (one-time)

1. Go to [render.com](https://render.com) → **New Web Service**
2. Connect GitHub repo: `kdvinay55/mediassist-smart-opd`
3. Settings:
   - **Name**: `mediassist-api`
   - **Root Directory**: (leave blank)
   - **Build Command**: `cd server && npm ci`
   - **Start Command**: `cd server && node index.js`
   - **Runtime**: Node
   - **Plan**: Free
4. Add environment variables (Dashboard → Environment):

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `MONGO_URI` | `mongodb+srv://<user>:<pass>@cluster.mongodb.net/smartopd` |
| `JWT_SECRET` | *(auto-generated or random string)* |
| `OPENAI_API_KEY` | `sk-proj-...` |
| `CLIENT_URL` | `https://srm-mediassist.vercel.app` |
| `OPENAI_MODEL_MEDICAL` | `gpt-5` |
| `OPENAI_MODEL_ASSISTANT` | `gpt-5` |
| `OPENAI_MODEL_STT` | `gpt-4o-transcribe` |
| `OPENAI_MODEL_TTS` | `gpt-4o-mini-tts` |
| `OPENAI_TTS_VOICE` | `alloy` |
| `DEMO_MODE` | `true` |
| `EMAIL_USER` | *(your SMTP email)* |
| `EMAIL_PASS` | *(your SMTP app password)* |

5. Deploy — Render auto-deploys on push to `master`

The `render.yaml` blueprint is also provided for one-click deploys via Render Blueprints.

### Health Check

```
GET https://mediassist-api.onrender.com/api/health
GET https://mediassist-api.onrender.com/api/health/diag
```

---

## 3. Database — MongoDB Atlas

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a **free M0** cluster (AWS / any region)
3. Create database user (e.g., `smartopd_user` / strong password)
4. Network Access → Allow `0.0.0.0/0` (required for Render)
5. Get connection string → paste as `MONGO_URI` in Render env vars:
   ```
   mongodb+srv://smartopd_user:<password>@cluster0.xxxxx.mongodb.net/smartopd?retryWrites=true&w=majority
   ```

---

## 4. Expo / Mobile App

The project is registered on Expo at **@vinay35/srm-mediassist**.

**Note:** The app uses **Capacitor** (not React Native/Expo SDK), so EAS Build won't produce native binaries. For Android APK builds, use Capacitor:

### Build Android APK (via Capacitor)

```bash
cd client

# Set backend URL for mobile
cp .env.mobile .env.local
npm run build
npx cap sync android
npx cap open android
```

In Android Studio: Build → Generate Signed Bundle/APK → APK → release.

### Expo Account

| Field | Value |
|-------|-------|
| Email | olymp356812@gmail.com |
| Username | vinay35 |
| Project | @vinay35/srm-mediassist |

---

## 5. Deployment Validation

Before deploying, run the assistant health + multilingual checks:

```bash
npm run validate:assistant:deploy
```

This executes:
```bash
npm --prefix server run health:assistant:live
npm --prefix server run validate:assistant:multilingual
```

---

## 6. Environment Variables Reference

### Server (`server/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 5000) |
| `NODE_ENV` | Yes | `production` for deployment |
| `MONGO_URI` | Yes | MongoDB Atlas connection string |
| `JWT_SECRET` | Yes | Secret for JWT signing |
| `OPENAI_API_KEY` | No | OpenAI API key for AI features |
| `CLIENT_URL` | Yes | Frontend Vercel URL for CORS |
| `DEMO_MODE` | No | `true` to auto-seed demo data |

### Client (`client/.env.production`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | Render backend URL |

---

## 7. Quick Start (Local Development)

```bash
# Terminal 1 — Backend
cd server
npm install
npm run dev

# Terminal 2 — Frontend
cd client
npm install
npm run dev
```

Web dashboard: `http://localhost:5173` | API: `http://localhost:5000`

---

## 8. Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Patient | rahul@patient.com | patient123 |
| Doctor | dr.priya@smartopd.com | doctor123 |
| Reception | reception@smartopd.com | reception123 |
| Lab | lab@smartopd.com | lab12345 |
