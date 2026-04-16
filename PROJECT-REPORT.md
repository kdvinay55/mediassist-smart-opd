# Smart OPD Project Report

## 1. Overview
`smart-opd` is a full-stack hospital/clinic management web application built with:
- **Frontend:** React 19 + Vite + Tailwind CSS + Framer Motion
- **Backend:** Express + Node.js + MongoDB + Mongoose
- **Realtime:** Socket.IO
- **AI/Automation:** custom AI services and lab interpretation hooks
- **Auth:** email/phone OTP verification + JWT

The app targets a multi-role workflow with patients, doctors, reception staff, lab technicians, and admin users.

## 2. Project Structure

### Root
- `client/` — React frontend application
- `server/` — Express backend API server
- `CREDENTIALS.md` — seeded demo user credentials and workflow description
- `CREDENTIALS-report.md` — existing generated credentials analysis

### Client
- `src/App.jsx` — main routing and protected route handling
- `src/main.jsx` — app bootstrap
- `src/context/AuthContext.jsx` — authentication state, login/signup, OTP verify, logout
- `src/lib/api.js` — Axios wrapper with JWT token injection and 401 handling
- `src/components/AppLayout.jsx` — shared layout, sidebar, navigation
- `src/pages/` — page components for patient, doctor, lab, admin, notifications, follow-up, etc.
- `public/` — static assets and icons

### Server
- `index.js` — app bootstrap, DB connect, Socket.IO, route registration
- `config/db.js` — MongoDB connection wrapper
- `middleware/auth.js` — JWT auth middleware and role authorization
- `models/` — Mongoose schemas for users, appointments, consultations, labs, vitals, etc.
- `routes/` — REST API endpoints for auth, patients, appointments, consultations, lab, notifications, workflow, etc.
- `services/` — AI helpers, OTP/sms/email, simulation engine, notifications

## 3. Backend Architecture

### 3.1 Entry point
`server/index.js`:
- Loads `.env` config
- Configures Express middleware: `helmet`, `cors`, JSON/urlencoded parsing
- Exposes Socket.IO object via `app.set('io', io)` for route use
- Connects MongoDB through `config/db.js`
- Initializes simulation engine and demo data if `DEMO_MODE=true`
- Starts HTTP server on port from `PORT` env or `5000`

### 3.2 Core middleware
`server/middleware/auth.js`:
- `auth`: verifies `Authorization: Bearer <token>` header using JWT secret
- `authorize(...roles)`: allows only specific user roles to access endpoints

### 3.3 Database schema
Key models:
- `User.js` — base user identity, role, doctor fields, verification, onboarding
- `Patient.js` — medical metadata, address, allergies, medications, insurance, history
- `Appointment.js` — appointment scheduling, queue state, follow-up tracking, status
- `Consultation.js` — doctor notes, diagnosis, prescriptions, lab links, referrals, AI chat history
- `LabResult.js` — lab orders, batch queueing, consent, processing state, results, AI interpretation
- `Vitals.js` — vital measurements, triage metrics
- `WorkflowState.js` — queue state and room assignment tracking

### 3.4 Auth routes
`server/routes/auth.js` manages:
- Signup with email/phone and OTP generation
- Login with email/phone and password
- OTP verification and account activation
- Resend OTP
- Forgot password / reset password
- `auth/me` route likely exists to validate stored tokens and refresh user data

### 3.5 Appointment routes
`server/routes/appointment.js` supports:
- Search available slots by date and department
- Book appointments
- List appointments by user role and filter
- Department queue view
- Update appointment status and vitals
- Get appointment details and full patient profile for admin/doctor
- Verify and auto-assign doctor with load balancing and workflow state
- Fetch vitals summary for consultation room
- Get doctor’s assigned patients for today with enriched vitals, workflow, and consultation IDs

### 3.6 Consultation routes
`server/routes/consultation.js` supports:
- Create or return existing consultation for an appointment
- Update consultation notes and diagnosis
- AI-assisted diagnosis, patient history summary, and referral generation
- Consultation completion and status updates
- Chat interactions / AI chat history
- Likely endpoints for prescriptions and follow-up details

### 3.7 Lab routes
`server/routes/lab.js` supports the full lab lifecycle:
- Doctor orders single or batch lab tests
- Patient accepts/declines batch or single lab order
- Lab tech accepts patient group and collects samples
- Update sample status, enter results, request AI interpretation
- Patient follow-up appointment creation from lab results
- Lab queue listing grouped by orderGroup
- Lab result lookup filtered by patient or consultation

### 3.8 Notification and AI services
- `server/services/simulationEngine.js` handles notifications and demo workflows
- `server/services/ai.js` provides AI diagnosis generation, lab interpretation, patient history summary, and referral letters
- `server/services/otp.js` supports OTP generation, normalization, and sending via email/SMS

## 4. Frontend Architecture

### 4.1 App shell and routing
`client/src/App.jsx`:
- `AuthProvider` wraps the whole app
- `ProtectedRoute` guards authenticated pages and redirects to login
- `PublicRoute` prevents logged-in users from revisiting auth pages
- Lazy loads many pages for performance
- Organizes pages into modules:
  - Entry: symptom checker, check-in, traffic
  - Pre OPD: queue, vitals entry, kiosk
  - OPD: consultation room, doctor patients, navigation
  - Post OPD: sample tracking, notifications
  - After hospital: meds, follow-ups, wellness, tracking
  - Admin/reception/lab dashboards

### 4.2 Auth context
`client/src/context/AuthContext.jsx`:
- Stores current user and loading state
- Restores token/user from localStorage
- Verifies token on app start with `/auth/me`
- Provides login, signup, OTP verify, resend OTP, logout, user update

### 4.3 API wrapper
`client/src/lib/api.js`:
- Axios with base URL `/api`
- Adds JWT Authorization header on each request
- Logs out and redirects to login on 401 responses

### 4.4 Main pages and features
Key pages include:
- `Dashboard.jsx` — home dashboard for logged-in users
- `Appointments.jsx` — appointment booking and status
- `Consultations.jsx` — doctor consultations list
- `ConsultationRoom.jsx` — detailed consultation interface with notes, prescriptions, labs, history, referrals, AI chat
- `DoctorPatients.jsx` — doctor patient queue and start/continue consultation
- `LabResults.jsx` — patient lab status and follow-up booking
- `LabDashboard.jsx` — lab technician order queue, sample tracking, result entry
- `FollowUpBooking.jsx` — patient follow-up scheduling
- `VitalsKiosk.jsx` — patient vital capture workflow
- `SymptomChecker.jsx` — patient entry symptom collection
- `Profile.jsx` — patient profile editing and medical data
- `Notifications.jsx` — notifications center
- `MedicationReminders.jsx`, `WellnessPlan.jsx`, `HealthTracking.jsx` — post-discharge care
- `ReceptionDashboard.jsx` — reception staff appointment verification and doctor assignment

### 4.5 UI and branding
- Uses Tailwind CSS utility classes across the app
- Animations via Framer Motion
- Icons from lucide-react
- Many pages are organized around a card-based dashboard layout

## 5. Feature Flow Summary

### Patient flow
1. Register / verify OTP
2. Book appointment by department, date, time slot
3. Receive doctor assignment notification
4. Arrive at clinic, perform vitals at kiosk
5. Wait in queue and enter consultation room
6. Doctor orders labs and prescriptions
7. Lab tech collects and processes samples
8. Patient receives lab results and books follow-up if needed
9. Uses wellness, medication reminder, and health tracking pages

### Doctor flow
1. Login and view assigned patients
2. Start or continue consultations
3. Review patient profile, past history, vitals, labs
4. Order lab tests and referrals
5. Enter diagnoses, prescriptions, and follow-up instructions
6. Complete consultations

### Lab flow
1. View pending lab orders and queue by `orderGroup`
2. Accept patient groups and collect samples
3. Update test status and enter results
4. Trigger notifications and AI interpretation

### Reception/Admin flow
1. View new bookings and patient history
2. Verify patient identities and assign doctors
3. Manage appointments and workflow states
4. Oversee queue and staff operations

## 6. Technical Notes

### Data modeling
- `User` covers major roles: patient, doctor, admin
- `Patient` stores extended medical history separate from login records
- `Appointment` tracks visit status and queue state
- `Consultation` stores clinical content and links prescriptions/labs
- `LabResult` supports test ordering, patient consent, batch grouping, queueing, and results

### Realtime updates
- Socket.IO channels are used for:
  - lab order and queue updates
  - appointment updates
  - vitals recorded
  - doctor assignment
  - lab results notifications

### Security and auth
- JWT tokens with `Authorization` bearer header
- Role-based access control for protected endpoints
- OTP-based registration and password reset flows
- Helmet and CORS enabled on backend

### Dependencies
- Backend: `express`, `mongoose`, `jsonwebtoken`, `bcryptjs`, `socket.io`, `nodemailer`, `twilio`, `tesseract.js`
- Frontend: `react`, `react-router-dom`, `axios`, `framer-motion`, `tailwindcss`, `lucide-react`, `chart.js`, `react-chartjs-2`

## 7. Startup Instructions

### Backend
- Install dependencies: `npm install`
- Create `.env` with MongoDB URI, JWT_SECRET, CLIENT_URL, etc.
- Run server: `npm run dev` or `npm start`
- Use `/api/demo/seed` if demo seeding is needed

### Frontend
- Install dependencies: `npm install`
- Run dev server: `npm run dev`
- Open app at `http://localhost:5173`

## 8. Notable strengths
- Covers full OPD lifecycle from registration to follow-up
- Multi-role support with clear route segmentation
- Real-time lab and appointment updates via Socket.IO
- Rich consultation room with AI-assisted history and lab interpretation
- Patient-facing wellness and follow-up modules

## 9. Potential improvement areas
- Add root `README.md` at project root for developer onboarding
- Add more documentation for environment variables and demo seed behavior
- Consider stronger production security for default/demo credentials
- Add tests to backend and frontend

## 10. Report location
Saved as: `smart-opd/PROJECT-REPORT.md`
