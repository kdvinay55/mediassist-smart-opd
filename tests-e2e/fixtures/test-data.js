// Centralized test credentials and constants.
// All accounts are created by POST /api/demo/seed.
// (See server/routes/demo.js)

export const API_URL = process.env.API_URL || 'http://localhost:5000';
export const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

export const USERS = {
  patient: {
    identifier: 'rahul@patient.com',
    password: 'patient123',
    name: 'Rahul Kumar',
    role: 'patient'
  },
  patientSecondary: {
    identifier: 'priya@patient.com',
    password: 'patient123',
    name: 'Priya Singh',
    role: 'patient'
  },
  receptionist: {
    identifier: 'reception@smartopd.com',
    password: 'reception123',
    name: 'Anita Mehra',
    role: 'admin',
    department: 'reception'
  },
  doctor: {
    identifier: 'dr.patel@smartopd.com',
    password: 'doctor123',
    name: 'Dr. Neha Patel',
    role: 'doctor',
    department: 'Cardiology'
  },
  doctorSecondary: {
    identifier: 'dr.sharma@smartopd.com',
    password: 'doctor123',
    name: 'Dr. Vikram Sharma',
    role: 'doctor',
    department: 'General Medicine'
  },
  lab: {
    identifier: 'lab@smartopd.com',
    password: 'lab12345',
    name: 'Rajesh Nair',
    role: 'admin',
    department: 'laboratory'
  },
  admin: {
    identifier: 'demo.admin@smartopd.com',
    password: 'demo123',
    name: 'Demo Admin',
    role: 'admin'
  }
};

export const PERFORMANCE_BUDGET = {
  pageLoadMs: 2000,
  apiResponseMs: 1000,
  navigationMs: 3000
};

export const DEPARTMENTS = [
  'General Medicine', 'Cardiology', 'Orthopedics',
  'Pediatrics', 'Dermatology', 'ENT', 'Ophthalmology', 'Neurology'
];
