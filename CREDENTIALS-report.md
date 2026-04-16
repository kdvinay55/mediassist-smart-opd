# Smart OPD Credentials Report

## Overview
This document summarizes the contents of `CREDENTIALS.md` for the `smart-opd` project. It captures the seeded logins, their access roles, and the end-to-end OPD workflow described in the file.

## Setup Instruction
- The file begins with a seed setup instruction.
- To initialize demo data, execute:
  ```bash
  POST http://localhost:5000/api/demo/seed
  ```
- This likely populates the database with sample user accounts and demo records.

## User Accounts Included
### 1. Receptionist
- **Email:** `reception@smartopd.com`
- **Password:** `reception123`
- **Access Scope:**
  - Reception Desk
  - Patient verification
  - Doctor assignment
  - Appointments
  - User management

### 2. Doctors
The file includes three doctor accounts with their department assignments.

| Name              | Email                  | Password   | Department        |
|-------------------|------------------------|------------|-------------------|
| Dr. Vikram Sharma | dr.sharma@smartopd.com | doctor123  | General Medicine  |
| Dr. Neha Patel    | dr.patel@smartopd.com  | doctor123  | Cardiology        |
| Dr. Suresh Reddy  | dr.reddy@smartopd.com  | doctor123  | Orthopedics       |

- **Access Scope for doctors:**
  - My Patients
  - Consultations
  - AI Diagnosis
  - Prescriptions
  - Lab Orders
  - Referrals

### 3. Lab Technician
- **Email:** `lab@smartopd.com`
- **Password:** `lab12345`
- **Access Scope:**
  - Laboratory dashboard
  - Sample tracking
  - Result entry
  - AI interpretation

### 4. Patient Accounts
- The file states that patients register themselves through the app.
- There are no pre-created patient accounts required by default.

## Full OPD Flow
The file documents the intended end-to-end OPD process in 8 steps:

1. **Patient** creates an account, books an appointment, and selects department, date, slot, and symptoms.
2. **Receptionist** logs in, uses the Reception Desk view, reviews the new booking with patient history, verifies the patient, and assigns a doctor.
3. **Patient** receives doctor details, comes to the clinic, records vitals at the kiosk, and waits in queue.
4. **Doctor** logs in, opens My Patients, starts a consultation, uses AI diagnosis, orders lab tests, and writes a prescription.
5. **Lab Tech** logs in, views pending orders in the laboratory dashboard, collects samples, processes them, enters results, and uses AI interpretation.
6. **Patient** views lab results and returns to the doctor queue.
7. **Doctor** reviews lab results, finalizes the prescription, and completes the consultation.
8. **Patient** views medications, receives a wellness plan, and schedules follow-up if needed.

## Key Observations
- The file is focused on seeded staff accounts and the workflow rather than storing patient credentials.
- It is a useful reference for QA testers and support staff to verify login behavior and process flow.
- The doctor and lab accounts share simple default passwords, which are suitable for demo/testing but should be updated for production.

## Recommendations
- Keep this file in sync with demo data seeding logic.
- Consider adding a patient test account example if manual patient testing is needed.
- For security, do not use these credentials in production environments.

## File Purpose
This file serves two main purposes:
- Quickly log in as receptionist, doctor, or lab technician during demo/testing.
- Document the expected clinical workflow for the application.
