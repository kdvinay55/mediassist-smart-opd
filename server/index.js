require('dotenv').config();
const express = require('express');
const path = require('path');
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
const { initSimulation, seedDemoData } = require('./services/simulationEngine');

const app = express();
const httpServer = createServer(app);

// Production origins: comma-separated CLIENT_URL + DASHBOARD_URL
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map(u => u.trim())
  .filter(Boolean);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: allowedOrigins, credentials: true }));
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve web dashboard in production (built React app)
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Socket.IO
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-room', (room) => {
    socket.join(room);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 5000;

connectDB().then(async () => {
  // Initialize simulation engine
  initSimulation(io);

  // Seed demo data if DEMO_MODE is enabled
  if (process.env.DEMO_MODE === 'true') {
    await seedDemoData();
  }

  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});

module.exports = { app, io };
