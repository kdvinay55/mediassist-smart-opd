const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createServer } = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patient');
const appointmentRoutes = require('./routes/appointment');
const consultationRoutes = require('./routes/consultation');
const labRoutes = require('./routes/lab');
const aiRoutes = require('./routes/ai');
const adminRoutes = require('./routes/admin');
const notificationRoutes = require('./routes/notification');
const workflowRoutes = require('./routes/workflow');
const assistantRoutes = require('./routes/assistant');
const vitalsKioskRoutes = require('./routes/vitalsKiosk');
const wellnessRoutes = require('./routes/wellness');
const demoRoutes = require('./routes/demo');
const transcribeRoutes = require('./routes/transcribe');
const ttsRoutes = require('./routes/tts');
const { ASSISTANT_MODELS } = require('./services/assistant/config');
const assistantRuntimeStatus = require('./services/assistant/AssistantRuntimeStatus');
const runStartupHealthVerification = require('./services/assistant/StartupHealthVerifier');
const { initSimulation, seedDemoData } = require('./services/simulationEngine');

const app = express();
const httpServer = createServer(app);

// Production origins: comma-separated CLIENT_URL + DASHBOARD_URL
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map(u => u.trim())
  .filter(Boolean);

// Always allow Capacitor mobile origins + known production frontends
[
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
  'https://srm-mediassist.vercel.app',
].forEach(o => {
  if (!allowedOrigins.includes(o)) allowedOrigins.push(o);
});

// Allow any *.vercel.app preview deployment + Capacitor schemes via function form
const corsOriginFn = (origin, cb) => {
  if (!origin) return cb(null, true); // same-origin / curl / mobile
  if (allowedOrigins.includes(origin)) return cb(null, true);
  try {
    const host = new URL(origin).hostname;
    if (host.endsWith('.vercel.app')) return cb(null, true);
  } catch { /* ignore */ }
  return cb(new Error(`CORS blocked: ${origin}`));
};

const io = new Server(httpServer, {
  cors: {
    origin: corsOriginFn,
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: corsOriginFn, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Make io accessible to routes
app.set('io', io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/consultations', consultationRoutes);
app.use('/api/lab', labRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/vitals-kiosk', vitalsKioskRoutes);
app.use('/api/wellness', wellnessRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/transcribe', transcribeRoutes);
app.use('/api/tts', ttsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  const runtime = assistantRuntimeStatus.getStatus();
  res.json({
    status: runtime.enabled ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    assistantRuntime: runtime
  });
});

// Diagnostic endpoint — verifies which integrations are configured.
// Useful for the doctor/admin dashboard "system status" panel and CI smoke tests.
app.get('/api/health/diag', (req, res) => {
  const mongoose = require('mongoose');
  const dbState = ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';
  const has = (k) => Boolean(process.env[k] && process.env[k] !== `your_${k.toLowerCase()}_here` && !process.env[k].startsWith('replace_me'));
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    db: { state: dbState },
    openai: {
      configured: has('OPENAI_API_KEY'),
      models: {
        medical: ASSISTANT_MODELS.medicalReasoning,
        assistant: ASSISTANT_MODELS.assistantLogic,
        stt: ASSISTANT_MODELS.speechRecognition,
        tts: ASSISTANT_MODELS.voiceOutput,
        wakeWord: ASSISTANT_MODELS.wakeWord
      }
    },
    sms: { provider: 'fast2sms', configured: has('FAST2SMS_API_KEY') },
    email:  { configured: has('EMAIL_USER') && has('EMAIL_PASS') },
    kiosk:  { configured: has('KIOSK_DEVICE_KEY') },
    demoMode: process.env.DEMO_MODE === 'true',
    assistantRuntime: assistantRuntimeStatus.getStatus()
  });
});

// Serve web dashboard in production (built React app)
if (process.env.NODE_ENV === 'production') {
  const fs = require('fs');
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('{*path}', (req, res, next) => {
      // Don't serve index.html for API or socket.io routes
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        return next();
      }
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }
}

// Socket.IO
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-room', (room) => {
    socket.join(room);
  });

  // Patient apps join their own room so the kiosk can push vitals updates instantly.
  socket.on('join-patient', (patientId) => {
    if (patientId) socket.join(`patient-${patientId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 5000;

function listenOnPort(server, port) {
  return new Promise((resolve, reject) => {
    const handleError = (error) => {
      server.off('listening', handleListening);
      reject(error);
    };

    const handleListening = () => {
      server.off('error', handleError);
      resolve();
    };

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(port);
  });
}

async function startServer() {
  let databaseError = null;

  // DEMO_MODE only seeds data; assistant always runs in live/active mode

  try {
    await connectDB();
    initSimulation(io);
    if (process.env.DEMO_MODE === 'true') {
      await seedDemoData();
    }
  } catch (error) {
    databaseError = error;
    console.error('⚠️  MongoDB unavailable — server will run in degraded mode:', error.message);
  }

  assistantRuntimeStatus.beginStartupCheck({ live: true });
  try {
    const startupResult = await runStartupHealthVerification({ databaseError, live: true });
    assistantRuntimeStatus.setStartupResult(startupResult);
    if (startupResult.enabled) {
      console.log('Assistant startup health verification passed.');
    } else {
      console.error('Assistant startup health verification failed. Live assistant routes will stay disabled until health is restored.');
      startupResult.issues.forEach((issue) => console.error(`- ${issue}`));
    }
  } catch (error) {
    assistantRuntimeStatus.disableAssistant(error.message, {
      startup: {
        status: 'failed',
        checkedAt: new Date().toISOString(),
        issues: [error.message]
      }
    });
    console.error('Assistant startup health verification crashed:', error.message);
  }

  try {
    await listenOnPort(httpServer, PORT);
    console.log(`Server running on port ${PORT}`);
  } catch (error) {
    if (error?.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Another Smart OPD server instance is likely already running.`);
      console.error('Reuse the existing backend, stop the process using that port, or change PORT in server/.env before starting a new instance.');
      return;
    }

    console.error('Server failed to start:', error.message);
  }
}

void startServer();

module.exports = { app, io };
