import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Navigation, Clock, ArrowLeft, Loader2, Building2, DoorOpen, ArrowRight, CheckCircle } from 'lucide-react';
import api from '../lib/api';

const FLOOR_MAP = {
  'General Medicine': { floor: 'Ground Floor', wing: 'East Wing', rooms: '101-110', color: 'blue' },
  'Cardiology': { floor: '1st Floor', wing: 'West Wing', rooms: '201-205', color: 'red' },
  'Orthopedics': { floor: '1st Floor', wing: 'East Wing', rooms: '206-210', color: 'green' },
  'Pediatrics': { floor: 'Ground Floor', wing: 'West Wing', rooms: '111-115', color: 'purple' },
  'Dermatology': { floor: '2nd Floor', wing: 'East Wing', rooms: '301-305', color: 'orange' },
  'ENT': { floor: '2nd Floor', wing: 'West Wing', rooms: '306-310', color: 'teal' },
  'Ophthalmology': { floor: '3rd Floor', wing: 'East Wing', rooms: '401-405', color: 'indigo' },
  'Neurology': { floor: '3rd Floor', wing: 'West Wing', rooms: '406-410', color: 'pink' },
};

const DIRECTIONS_STEPS = {
  'Ground Floor': [
    { text: 'Enter through the main hospital entrance', icon: Building2 },
    { text: 'Walk straight past the reception desk', icon: ArrowRight },
  ],
  '1st Floor': [
    { text: 'Enter through the main hospital entrance', icon: Building2 },
    { text: 'Take the elevator or stairs to 1st Floor', icon: ArrowRight },
    { text: 'Exit elevator and follow the corridor signs', icon: Navigation },
  ],
  '2nd Floor': [
    { text: 'Enter through the main hospital entrance', icon: Building2 },
    { text: 'Take the elevator to 2nd Floor', icon: ArrowRight },
    { text: 'Exit elevator and follow the corridor signs', icon: Navigation },
  ],
  '3rd Floor': [
    { text: 'Enter through the main hospital entrance', icon: Building2 },
    { text: 'Take the elevator to 3rd Floor', icon: ArrowRight },
    { text: 'Exit elevator and follow the corridor signs', icon: Navigation },
  ],
};

export default function NavigateClinic() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const [appointment, setAppointment] = useState(null);
  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    if (appointmentId) loadData();
  }, [appointmentId]);

  const loadData = async () => {
    try {
      const [aptRes, wfRes] = await Promise.all([
        api.get(`/appointments/${appointmentId}`),
        api.get(`/workflow/${appointmentId}`).catch(() => ({ data: null }))
      ]);
      setAppointment(aptRes.data);
      setWorkflow(wfRes.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  const dept = appointment?.department || 'General Medicine';
  const mapInfo = FLOOR_MAP[dept] || FLOOR_MAP['General Medicine'];
  const roomNum = workflow?.roomNumber || appointment?.tokenNumber || '—';
  const floorSteps = DIRECTIONS_STEPS[mapInfo.floor] || DIRECTIONS_STEPS['Ground Floor'];

  const allSteps = [
    ...floorSteps,
    { text: `Turn towards the ${mapInfo.wing}`, icon: Navigation },
    { text: `Look for Room ${roomNum} (${mapInfo.rooms} area)`, icon: DoorOpen },
    { text: `Check in with the nurse at Room ${roomNum}`, icon: CheckCircle },
  ];

  const handleNext = () => {
    if (currentStep < allSteps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      setArrived(true);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center mx-auto mb-4">
          <Navigation className="w-8 h-8 text-primary-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Navigate to Clinic</h1>
        <p className="text-gray-500 mt-1">Follow the directions to reach your doctor</p>
      </div>

      {/* Destination Card */}
      <div className={`card p-6 border-2 border-${mapInfo.color}-200 bg-${mapInfo.color}-50/30`}>
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-xl bg-${mapInfo.color}-100 flex items-center justify-center`}>
            <MapPin className={`w-7 h-7 text-${mapInfo.color}-600`} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900">{dept}</h2>
            <p className="text-gray-600">{mapInfo.floor} • {mapInfo.wing}</p>
            <div className="flex gap-4 mt-1 text-sm">
              <span className="text-gray-500">Room: <span className="font-semibold text-gray-900">{roomNum}</span></span>
              {appointment?.doctorId?.name && (
                <span className="text-gray-500">Doctor: <span className="font-semibold text-gray-900">Dr. {appointment.doctorId.name}</span></span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hospital Map Visualization */}
      <div className="card p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Hospital Floor Plan</h3>
        <div className="bg-gray-50 rounded-xl p-4 relative">
          {/* Mini Map Grid */}
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(FLOOR_MAP).map(([deptName, info]) => {
              const isTarget = deptName === dept;
              return (
                <motion.div
                  key={deptName}
                  animate={isTarget ? { scale: [1, 1.03, 1] } : {}}
                  transition={isTarget ? { repeat: Infinity, duration: 2 } : {}}
                  className={`p-3 rounded-xl text-sm transition ${
                    isTarget
                      ? 'bg-primary-500 text-white shadow-lg ring-2 ring-primary-300'
                      : 'bg-white text-gray-600 border border-gray-200'
                  }`}
                >
                  <div className="font-medium truncate">{deptName}</div>
                  <div className={`text-xs mt-0.5 ${isTarget ? 'text-primary-100' : 'text-gray-400'}`}>
                    {info.floor} • {info.wing}
                  </div>
                  {isTarget && (
                    <div className="text-xs mt-1 font-semibold flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Room {roomNum}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 text-xs text-gray-400">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-primary-500" /> Your destination
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-white border border-gray-200" /> Other departments
            </div>
          </div>
        </div>
      </div>

      {/* Step-by-Step Directions */}
      {!arrived ? (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Directions</h3>
            <span className="text-sm text-gray-400">Step {currentStep + 1} of {allSteps.length}</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-100 rounded-full h-2 mb-6">
            <motion.div
              className="bg-primary-500 h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${((currentStep + 1) / allSteps.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          {/* Steps */}
          <div className="space-y-3">
            {allSteps.map((step, i) => {
              const StepIcon = step.icon;
              const isActive = i === currentStep;
              const isDone = i < currentStep;
              return (
                <motion.div
                  key={i}
                  animate={isActive ? { x: [0, 4, 0] } : {}}
                  transition={isActive ? { repeat: Infinity, duration: 1.5 } : {}}
                  className={`flex items-center gap-3 p-3 rounded-xl transition ${
                    isActive
                      ? 'bg-primary-50 border-2 border-primary-200'
                      : isDone
                        ? 'bg-green-50 border border-green-100'
                        : 'bg-gray-50 border border-gray-100 opacity-50'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    isActive ? 'bg-primary-500 text-white' : isDone ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'
                  }`}>
                    {isDone ? <CheckCircle className="w-4 h-4" /> : <StepIcon className="w-4 h-4" />}
                  </div>
                  <span className={`text-sm ${isActive ? 'text-primary-900 font-medium' : isDone ? 'text-green-800' : 'text-gray-400'}`}>
                    {step.text}
                  </span>
                </motion.div>
              );
            })}
          </div>

          <button onClick={handleNext} className="btn-primary w-full mt-6 flex items-center justify-center gap-2">
            {currentStep < allSteps.length - 1 ? (
              <>Next Step <ArrowRight className="w-4 h-4" /></>
            ) : (
              <>I've Arrived <CheckCircle className="w-4 h-4" /></>
            )}
          </button>
        </div>
      ) : (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="card p-8 text-center"
        >
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">You've Arrived!</h2>
          <p className="text-gray-500 mb-6">
            Please check in with the nurse at Room {roomNum}. Your doctor will see you shortly.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
            <Clock className="w-4 h-4" />
            Estimated wait: {workflow?.estimatedWaitTime || Math.floor(Math.random() * 15) + 5} minutes
          </div>
        </motion.div>
      )}
    </div>
  );
}
