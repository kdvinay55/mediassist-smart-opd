// Hand-authored seed prompts per language and intent.
// Each seed declares the expected intent and validation rules
// so the runner can score correctness, not just liveness.
//
// Validation primitives:
//   expect.intent          - exact intent code expected (or array of acceptable codes)
//   expect.scriptMatch     - response must be in same script family as prompt language
//   expect.notFallback     - response must NOT be the generic "didn't understand" fallback
//   expect.actionType      - response.action must equal this (e.g., 'NAVIGATE')
//   expect.timeSlotMatch   - regex the booked appointment timeSlot must satisfy
//   expect.deptMatch       - regex/string the booked department must satisfy
//   expect.dateOffset      - integer days from today the appointment must land on
//   expect.containsAny     - response.text must match at least one of these regexes (judged after lower-casing)
//   expect.judgeFor        - { topic: string } - run LLM judge for medical/qna correctness

const SCRIPT_FAMILY = {
  en: 'latin',
  hi: 'devanagari',
  te: 'telugu',
  ta: 'tamil',
  kn: 'kannada',
  ml: 'malayalam'
};

// =================================================================
// ENGLISH SEEDS (baseline; paraphrased to ~100 by generator)
// =================================================================
const EN_SEEDS = [
  // Booking — explicit times
  { intent: 'BOOK_APPOINTMENT', prompt: 'Book a Cardiology appointment tomorrow at 4 PM',
    expect: { intent: 'BOOK_APPOINTMENT', actionType: 'NAVIGATE', deptMatch: /cardio/i, timeSlotMatch: /^04:(00|30) PM$/, dateOffset: 1 } },
  { intent: 'BOOK_APPOINTMENT', prompt: 'I want a Dermatology slot tomorrow afternoon four o clock',
    expect: { intent: 'BOOK_APPOINTMENT', deptMatch: /derma/i, timeSlotMatch: /^04:(00|30) PM$/, dateOffset: 1 } },
  { intent: 'BOOK_APPOINTMENT', prompt: 'Schedule General Medicine for tomorrow evening 6:30 pm',
    expect: { intent: 'BOOK_APPOINTMENT', deptMatch: /general/i, timeSlotMatch: /^06:30 PM$/, dateOffset: 1 } },
  { intent: 'BOOK_APPOINTMENT', prompt: 'Book me with ENT day after tomorrow at 11 am',
    expect: { intent: 'BOOK_APPOINTMENT', deptMatch: /ent/i, timeSlotMatch: /^11:00 AM$/, dateOffset: 2 } },
  { intent: 'BOOK_APPOINTMENT', prompt: 'I need an Orthopedics appointment today at 2 PM',
    expect: { intent: 'BOOK_APPOINTMENT', deptMatch: /ortho/i, timeSlotMatch: /^02:00 PM$/ } },
  { intent: 'BOOK_APPOINTMENT', prompt: 'Reserve eye clinic tomorrow at 9:30 in the morning',
    expect: { intent: 'BOOK_APPOINTMENT', deptMatch: /ophthal/i, timeSlotMatch: /^09:30 AM$/, dateOffset: 1 } },
  { intent: 'BOOK_APPOINTMENT', prompt: 'Please book a dental appointment for tomorrow at 5 pm',
    expect: { intent: 'BOOK_APPOINTMENT', deptMatch: /dental/i, timeSlotMatch: /^05:(00|30) PM$/, dateOffset: 1 } },
  // Cancellation
  { intent: 'CANCEL_APPOINTMENT', prompt: 'Cancel my appointment',
    expect: { intent: 'CANCEL_APPOINTMENT', notFallback: true } },
  { intent: 'CANCEL_APPOINTMENT', prompt: 'Cancel all my upcoming appointments',
    expect: { intent: 'CANCEL_APPOINTMENT', notFallback: true } },
  // List/show
  { intent: 'SHOW_APPOINTMENTS', prompt: 'Show my appointments',
    expect: { intent: 'SHOW_APPOINTMENTS', actionType: 'NAVIGATE' } },
  { intent: 'SHOW_LAB_RESULTS', prompt: 'Show my lab results',
    expect: { intent: 'SHOW_LAB_RESULTS', actionType: 'NAVIGATE' } },
  { intent: 'SHOW_MEDICATIONS', prompt: 'What are my current medications?',
    expect: { intent: 'SHOW_MEDICATIONS', actionType: 'NAVIGATE' } },
  // Vitals
  { intent: 'ENTER_VITALS', prompt: 'Record my blood pressure 120 over 80',
    expect: { intent: 'ENTER_VITALS', notFallback: true } },
  // Navigation
  { intent: 'NAVIGATE', prompt: 'Open the profile page',
    expect: { intent: 'NAVIGATE', actionType: 'NAVIGATE' } },
  // Medical Q&A — judged
  { intent: 'GENERAL_CHAT', prompt: 'What is paracetamol used for?',
    expect: { notFallback: true, judgeFor: { topic: 'paracetamol uses (fever, pain relief)' } } },
  { intent: 'GENERAL_CHAT', prompt: 'What are the symptoms of dengue?',
    expect: { notFallback: true, judgeFor: { topic: 'dengue symptoms (fever, body ache, rash, low platelets)' } } },
  { intent: 'GENERAL_CHAT', prompt: 'Should I take antibiotics for a viral fever?',
    expect: { notFallback: true, judgeFor: { topic: 'antibiotics do not work on viral infections' } } },
  { intent: 'GENERAL_CHAT', prompt: 'What is a normal fasting blood sugar level?',
    expect: { notFallback: true, judgeFor: { topic: 'normal fasting glucose ~70-100 mg/dL' } } },
  { intent: 'GENERAL_CHAT', prompt: 'I have a headache and mild fever, what should I do?',
    expect: { notFallback: true, judgeFor: { topic: 'rest, hydration, paracetamol, see doctor if persistent' } } }
];

// =================================================================
// MULTILINGUAL SEEDS — translated essentials per language.
// These are the BASELINE that MUST work before paraphrasing.
// =================================================================

// Hindi
const HI_SEEDS = [
  { intent: 'BOOK_APPOINTMENT', prompt: 'कल शाम चार बजे कार्डियोलॉजी अपॉइंटमेंट बुक करो',
    expect: { intent: 'BOOK_APPOINTMENT', deptMatch: /cardio/i, timeSlotMatch: /^04:(00|30) PM$/, dateOffset: 1 } },
  { intent: 'BOOK_APPOINTMENT', prompt: 'कल सुबह 9 बजे जनरल मेडिसिन में अपॉइंटमेंट लो',
    expect: { intent: 'BOOK_APPOINTMENT', deptMatch: /general/i, timeSlotMatch: /^09:00 AM$/, dateOffset: 1 } },
  { intent: 'CANCEL_APPOINTMENT', prompt: 'मेरा अपॉइंटमेंट रद्द करो',
    expect: { intent: 'CANCEL_APPOINTMENT', notFallback: true } },
  { intent: 'SHOW_APPOINTMENTS', prompt: 'मेरी अपॉइंटमेंट दिखाओ',
    expect: { intent: 'SHOW_APPOINTMENTS', notFallback: true } },
  { intent: 'GENERAL_CHAT', prompt: 'पेरासिटामोल किसके लिए इस्तेमाल होता है?',
    expect: { notFallback: true, judgeFor: { topic: 'paracetamol uses (fever, pain)', language: 'Hindi' } } },
  { intent: 'GENERAL_CHAT', prompt: 'डेंगू के लक्षण क्या हैं?',
    expect: { notFallback: true, judgeFor: { topic: 'dengue symptoms', language: 'Hindi' } } }
];

// Telugu
const TE_SEEDS = [
  { intent: 'BOOK_APPOINTMENT', prompt: 'రేపు మధ్యాహ్నం నాలుగు గంటలకు కార్డియాలజీ అపాయింట్‌మెంట్ బుక్ చేయి',
    expect: { intent: 'BOOK_APPOINTMENT', deptMatch: /cardio/i, timeSlotMatch: /^04:(00|30) PM$/, dateOffset: 1 } },
  { intent: 'BOOK_APPOINTMENT', prompt: 'రేపు ఉదయం తొమ్మిది గంటలకు జనరల్ మెడిసిన్ అపాయింట్‌మెంట్ బుక్ చేయండి',
    expect: { intent: 'BOOK_APPOINTMENT', deptMatch: /general/i, timeSlotMatch: /^09:00 AM$/, dateOffset: 1 } },
  { intent: 'BOOK_APPOINTMENT', prompt: 'రేపు సాయంత్రం ఆరున్నరకు డెర్మటాలజీ అపాయింట్‌మెంట్ కావాలి',
    expect: { intent: 'BOOK_APPOINTMENT', deptMatch: /derma/i, timeSlotMatch: /^06:30 PM$/, dateOffset: 1 } },
  { intent: 'CANCEL_APPOINTMENT', prompt: 'నా అపాయింట్‌మెంట్‌ను రద్దు చేయి',
    expect: { intent: 'CANCEL_APPOINTMENT', notFallback: true } },
  { intent: 'SHOW_APPOINTMENTS', prompt: 'నా అపాయింట్‌మెంట్లు చూపించు',
    expect: { intent: 'SHOW_APPOINTMENTS', notFallback: true } },
  { intent: 'GENERAL_CHAT', prompt: 'పారాసిటమాల్ ఎందుకు వాడతారు?',
    expect: { notFallback: true, judgeFor: { topic: 'paracetamol uses', language: 'Telugu' } } },
  { intent: 'GENERAL_CHAT', prompt: 'డెంగ్యూ లక్షణాలు ఏమిటి?',
    expect: { notFallback: true, judgeFor: { topic: 'dengue symptoms', language: 'Telugu' } } },
  { intent: 'GENERAL_CHAT', prompt: 'జలుబు, తలనొప్పి ఉంది ఏమి చేయాలి?',
    expect: { notFallback: true, judgeFor: { topic: 'cold and headache home care advice', language: 'Telugu' } } }
];

// Tamil
const TA_SEEDS = [
  { intent: 'BOOK_APPOINTMENT', prompt: 'நாளை மதியம் நான்கு மணிக்கு கார்டியாலஜி அப்பாய்ண்ட்மென்ட் பதிவு செய்',
    expect: { intent: 'BOOK_APPOINTMENT', deptMatch: /cardio/i, timeSlotMatch: /^04:(00|30) PM$/, dateOffset: 1 } },
  { intent: 'BOOK_APPOINTMENT', prompt: 'நாளை காலை 9 மணிக்கு ஜெனரல் மெடிசின் அப்பாய்ண்ட்மென்ட் வேண்டும்',
    expect: { intent: 'BOOK_APPOINTMENT', deptMatch: /general/i, timeSlotMatch: /^09:00 AM$/, dateOffset: 1 } },
  { intent: 'CANCEL_APPOINTMENT', prompt: 'எனது அப்பாய்ண்ட்மென்டை ரத்து செய்',
    expect: { intent: 'CANCEL_APPOINTMENT', notFallback: true } },
  { intent: 'SHOW_APPOINTMENTS', prompt: 'என் அப்பாய்ண்ட்மென்ட்களை காட்டு',
    expect: { intent: 'SHOW_APPOINTMENTS', notFallback: true } },
  { intent: 'GENERAL_CHAT', prompt: 'பாராசிட்டமால் எதற்காக பயன்படுத்தப்படுகிறது?',
    expect: { notFallback: true, judgeFor: { topic: 'paracetamol uses', language: 'Tamil' } } },
  { intent: 'GENERAL_CHAT', prompt: 'டெங்கு அறிகுறிகள் என்ன?',
    expect: { notFallback: true, judgeFor: { topic: 'dengue symptoms', language: 'Tamil' } } }
];

// Kannada
const KN_SEEDS = [
  { intent: 'BOOK_APPOINTMENT', prompt: 'ನಾಳೆ ಮಧ್ಯಾಹ್ನ ನಾಲ್ಕು ಗಂಟೆಗೆ ಕಾರ್ಡಿಯಾಲಜಿ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಬುಕ್ ಮಾಡಿ',
    expect: { intent: 'BOOK_APPOINTMENT', deptMatch: /cardio/i, timeSlotMatch: /^04:(00|30) PM$/, dateOffset: 1 } },
  { intent: 'BOOK_APPOINTMENT', prompt: 'ನಾಳೆ ಬೆಳಿಗ್ಗೆ 9 ಗಂಟೆಗೆ ಜನರಲ್ ಮೆಡಿಸಿನ್ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಬೇಕು',
    expect: { intent: 'BOOK_APPOINTMENT', deptMatch: /general/i, timeSlotMatch: /^09:00 AM$/, dateOffset: 1 } },
  { intent: 'CANCEL_APPOINTMENT', prompt: 'ನನ್ನ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ರದ್ದು ಮಾಡಿ',
    expect: { intent: 'CANCEL_APPOINTMENT', notFallback: true } },
  { intent: 'SHOW_APPOINTMENTS', prompt: 'ನನ್ನ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್‌ಗಳನ್ನು ತೋರಿಸಿ',
    expect: { intent: 'SHOW_APPOINTMENTS', notFallback: true } },
  { intent: 'GENERAL_CHAT', prompt: 'ಪ್ಯಾರಾಸಿಟಮಾಲ್ ಏಕೆ ಬಳಸುತ್ತಾರೆ?',
    expect: { notFallback: true, judgeFor: { topic: 'paracetamol uses', language: 'Kannada' } } },
  { intent: 'GENERAL_CHAT', prompt: 'ಡೆಂಗಿ ರೋಗಲಕ್ಷಣಗಳು ಏನು?',
    expect: { notFallback: true, judgeFor: { topic: 'dengue symptoms', language: 'Kannada' } } }
];

// Malayalam
const ML_SEEDS = [
  { intent: 'BOOK_APPOINTMENT', prompt: 'നാളെ ഉച്ചകഴിഞ്ഞ് നാല് മണിക്ക് കാർഡിയോളജി അപ്പോയിന്റ്മെന്റ് ബുക്ക് ചെയ്യൂ',
    expect: { intent: 'BOOK_APPOINTMENT', deptMatch: /cardio/i, timeSlotMatch: /^04:(00|30) PM$/, dateOffset: 1 } },
  { intent: 'BOOK_APPOINTMENT', prompt: 'നാളെ രാവിലെ 9 മണിക്ക് ജനറൽ മെഡിസിൻ അപ്പോയിന്റ്മെന്റ് വേണം',
    expect: { intent: 'BOOK_APPOINTMENT', deptMatch: /general/i, timeSlotMatch: /^09:00 AM$/, dateOffset: 1 } },
  { intent: 'CANCEL_APPOINTMENT', prompt: 'എന്റെ അപ്പോയിന്റ്മെന്റ് റദ്ദാക്കുക',
    expect: { intent: 'CANCEL_APPOINTMENT', notFallback: true } },
  { intent: 'SHOW_APPOINTMENTS', prompt: 'എന്റെ അപ്പോയിന്റ്മെന്റുകൾ കാണിക്കുക',
    expect: { intent: 'SHOW_APPOINTMENTS', notFallback: true } },
  { intent: 'GENERAL_CHAT', prompt: 'പാരാസെറ്റമോൾ എന്തിനാണ് ഉപയോഗിക്കുന്നത്?',
    expect: { notFallback: true, judgeFor: { topic: 'paracetamol uses', language: 'Malayalam' } } },
  { intent: 'GENERAL_CHAT', prompt: 'ഡെങ്കു രോഗ ലക്ഷണങ്ങൾ എന്തൊക്കെയാണ്?',
    expect: { notFallback: true, judgeFor: { topic: 'dengue symptoms', language: 'Malayalam' } } }
];

const SEEDS_BY_LANG = {
  en: EN_SEEDS,
  hi: HI_SEEDS,
  te: TE_SEEDS,
  ta: TA_SEEDS,
  kn: KN_SEEDS,
  ml: ML_SEEDS
};

module.exports = { SEEDS_BY_LANG, SCRIPT_FAMILY };
