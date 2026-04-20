# Smart OPD — Staff Login Credentials

> **Live URLs**
> - Frontend: https://srm-mediassist.vercel.app
> - Backend:  https://mediassist-api.onrender.com
>
> **Setup:** Run seed once before first login (idempotent — safe to re-run):
> ```
> POST https://mediassist-api.onrender.com/api/demo/seed   # production
> POST http://localhost:5000/api/demo/seed                 # local dev
> ```

---

## Receptionist

| Field    | Value                    |
|----------|--------------------------|
| Email    | reception@smartopd.com   |
| Password | reception123             |

**Access:** Reception Desk, Patient verification, Doctor assignment, Appointments, User management

---

## Doctors

| Name              | Email                     | Password  | Department       |
|-------------------|---------------------------|-----------|------------------|
| Dr. Vikram Sharma | dr.sharma@smartopd.com    | doctor123 | General Medicine |
| Dr. Neha Patel    | dr.patel@smartopd.com     | doctor123 | Cardiology       |
| Dr. Suresh Reddy  | dr.reddy@smartopd.com     | doctor123 | Orthopedics      |

**Access:** My Patients, Consultations, AI Diagnosis, Prescriptions, Lab Orders, Referrals

---

## Lab Technician

| Field    | Value                |
|----------|----------------------|
| Email    | lab@smartopd.com     |
| Password | lab12345             |

**Access:** Laboratory dashboard, Sample tracking, Result entry, AI interpretation

---

## Patient Accounts

Patients register themselves through the app. No pre-created patient accounts needed.

---

## Complete OPD Flow

1. **Patient** → Create Account → Book Appointment (selects department, date, available time slot, symptoms)
2. **Receptionist** → Login → Reception Desk → See new booking with patient history → Verify & Assign doctor
3. **Patient** → Gets notification with doctor details → Navigate to Clinic → Record Vitals at Kiosk → Wait in Queue
4. **Doctor** → Login → My Patients → Start Consultation → AI Diagnosis → Order Lab Tests → Write Prescription
5. **Lab Tech** → Login → Laboratory → See pending orders → Collect Sample → Process → Enter Results → AI Interpretation
6. **Patient** → View Lab Results → Return to Doctor Queue
7. **Doctor** → Review Lab Results → Final Prescription → Complete Consultation
8. **Patient** → View Medications → Wellness Plan → Follow-up Scheduling
