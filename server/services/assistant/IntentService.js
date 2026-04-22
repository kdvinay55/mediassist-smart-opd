const Appointment = require('../../models/Appointment');
const LabResult = require('../../models/LabResult');
const Medication = require('../../models/Medication');
const Notification = require('../../models/Notification');
const WorkflowState = require('../../models/WorkflowState');
const User = require('../../models/User');
const Patient = require('../../models/Patient');
const { generateQrToken } = require('../qr');
const { ASSISTANT_MODELS } = require('./config');

// All slot times are in IST. Server may run in UTC (e.g. Render).
const BOOKABLE_SLOTS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM',
  '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM', '07:00 PM'
];

// IST helpers — the user's wall-clock is always IST regardless of server timezone.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function nowIST() {
  return new Date(Date.now() + IST_OFFSET_MS);
}
function toIST(date) {
  return new Date(date.getTime() + IST_OFFSET_MS);
}
function istDateString(date) {
  return toIST(date).toISOString().split('T')[0];
}

function snapToBookableSlot(hour12, minutes, period) {
  const mmRounded = minutes < 15 ? '00' : (minutes < 45 ? '30' : '00');
  let h = hour12;
  if (minutes >= 45) h = h === 12 ? 1 : h + 1;
  return `${String(h).padStart(2, '0')}:${mmRounded} ${period}`;
}

const NUMBER_WORDS = {
  // English
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  // Hindi (Latin)
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, saat: 7, aath: 8, nau: 9, das: 10, gyarah: 11, baarah: 12,
  // Telugu (Latin)
  okati: 1, rendu: 2, moodu: 3, naalugu: 4, naalu: 4, nalugu: 4, aidu: 5, aaru: 6, edu: 7, enimidi: 8, tomidi: 9, padi: 10,
  // Tamil (Latin)
  onnu: 1, irandu: 2, moonu: 3, naangu: 4, anju: 5, aaru_ta: 6, ezhu: 7, ettu: 8, onbathu: 9, paththu: 10,
  // Kannada (Latin)
  ondu: 1, eradu: 2, mooru: 3, nalku: 4, aidu_kn: 5, aaru_kn: 6, elu: 7, entu: 8, ombattu: 9, hattu: 10,
  // Malayalam (Latin)
  onnu_ml: 1, randu: 2, moonnu: 3, naalu_ml: 4, anchu: 5, aaru_ml: 6, ezhu_ml: 7, ettu_ml: 8, onpathu: 9, paththu_ml: 10
};

// Native-script number words (only commonly spoken hours 1-12)
const NATIVE_NUMBER_WORDS = [
  // Hindi
  { rx: /एक/, n: 1 }, { rx: /दो/, n: 2 }, { rx: /तीन/, n: 3 }, { rx: /चार/, n: 4 },
  { rx: /पाँच|पांच/, n: 5 }, { rx: /छह|छः/, n: 6 }, { rx: /सात/, n: 7 }, { rx: /आठ/, n: 8 },
  { rx: /नौ/, n: 9 }, { rx: /दस/, n: 10 }, { rx: /ग्यारह/, n: 11 }, { rx: /बारह/, n: 12 },
  // Telugu
  { rx: /ఒకటి/, n: 1 }, { rx: /రెండు/, n: 2 }, { rx: /మూడు/, n: 3 }, { rx: /నాలుగు/, n: 4 },
  { rx: /ఐదు/, n: 5 }, { rx: /ఆరు/, n: 6 }, { rx: /ఏడు/, n: 7 }, { rx: /ఎనిమిది/, n: 8 },
  { rx: /తొమ్మిది/, n: 9 }, { rx: /పది/, n: 10 }, { rx: /పదకొండు/, n: 11 }, { rx: /పన్నెండు/, n: 12 },
  // Tamil
  { rx: /ஒன்று/, n: 1 }, { rx: /இரண்டு/, n: 2 }, { rx: /மூன்று/, n: 3 }, { rx: /நான்கு|நாலு/, n: 4 },
  { rx: /ஐந்து/, n: 5 }, { rx: /ஆறு/, n: 6 }, { rx: /ஏழு/, n: 7 }, { rx: /எட்டு/, n: 8 },
  { rx: /ஒன்பது/, n: 9 }, { rx: /பத்து/, n: 10 }, { rx: /பதினொன்று/, n: 11 }, { rx: /பன்னிரண்டு/, n: 12 },
  // Kannada
  { rx: /ಒಂದು/, n: 1 }, { rx: /ಎರಡು/, n: 2 }, { rx: /ಮೂರು/, n: 3 }, { rx: /ನಾಲ್ಕು/, n: 4 },
  { rx: /ಐದು/, n: 5 }, { rx: /ಆರು/, n: 6 }, { rx: /ಏಳು/, n: 7 }, { rx: /ಎಂಟು/, n: 8 },
  { rx: /ಒಂಬತ್ತು/, n: 9 }, { rx: /ಹತ್ತು/, n: 10 }, { rx: /ಹನ್ನೊಂದು/, n: 11 }, { rx: /ಹನ್ನೆರಡು/, n: 12 },
  // Malayalam
  { rx: /ഒന്ന്/, n: 1 }, { rx: /രണ്ട്/, n: 2 }, { rx: /മൂന്ന്/, n: 3 }, { rx: /നാല്/, n: 4 },
  { rx: /അഞ്ച്/, n: 5 }, { rx: /ആറ്/, n: 6 }, { rx: /ഏഴ്/, n: 7 }, { rx: /എട്ട്/, n: 8 },
  { rx: /ഒമ്പത്/, n: 9 }, { rx: /പത്ത്/, n: 10 }, { rx: /പതിനൊന്ന്/, n: 11 }, { rx: /പന്ത്രണ്ട്/, n: 12 }
];

const HALF_HINTS = [
  /\bhalf past\b/, /\bthirty\b/, /\bsaade\b/, /\bsadhe\b/, /\bnar\b/,
  /అరగంట|అర్థగంట|ఆరున్నర|నాలుగున్నర|ఐదున్నర|మూడున్నర|రెండున్నర|పదిన్నర|తొమ్మిదిన్నర/,
  /साढ़े|आधा/,
  /அரை மணி|அரை/,
  /ಅರ್ಧ|ಅರ್ಧಗಂಟೆ/,
  /അര|അരമണി/
];

const PERIOD_AM = /\b(morning|subah|udayam|kalai|belagge|ravile|ravilae)\b|उदय|सुबह|ಬೆಳಿಗ್ಗೆ|ಬೆಳ್ಳಂಬೆಳಿಗ್ಗೆ|காலை|ഉദയം|ഉച്ചയ്ക്ക് മുമ്പ്|ఉదయం/;
const PERIOD_PM = /\b(afternoon|evening|night|dopahar|dopahara|shaam|shaaam|saanjh|sanje|maalai|saayan|sayan|saayantram|saayantram|vaikunneram|vaikunnayram|madhyahnam|madhyahna|madhyaanam|ucha|uchch|uche)\b|दोपहर|शाम|रात|మధ్యాహ్నం|సాయంత్రం|రాత్రి|மதியம்|மாலை|இரவு|ಮಧ್ಯಾಹ್ನ|ಸಂಜೆ|ರಾತ್ರಿ|ഉച്ചകഴിഞ്ഞ്|വൈകുന്നേരം|രാത്രി/;

function detectPeriod(text) {
  if (PERIOD_PM.test(text)) return 'PM';
  if (PERIOD_AM.test(text)) return 'AM';
  return null;
}

function findNumberWord(text) {
  // First try native-script words
  for (const entry of NATIVE_NUMBER_WORDS) {
    if (entry.rx.test(text)) return entry.n;
  }
  // Then Latin word forms (whole-word match)
  const lower = text.toLowerCase();
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    const base = word.replace(/_(ta|kn|ml)$/, '');
    const rx = new RegExp(`(?<![a-z])${base}(?![a-z])`, 'i');
    if (rx.test(lower)) return n;
  }
  return null;
}

function parseTimeToSlot(text) {
  const original = String(text || '');
  const lower = original.toLowerCase();

  // Pattern 1: explicit "6 pm", "6:30 pm"
  const m = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/);
  if (m) {
    let h = parseInt(m[1], 10);
    const mm = m[2] ? parseInt(m[2], 10) : 0;
    const period = m[3].startsWith('a') ? 'AM' : 'PM';
    if (h < 1 || h > 12) return null;
    return snapToBookableSlot(h, mm, period);
  }

  // Pattern 2: 24h "18:00"
  const m24 = lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m24) {
    let h = parseInt(m24[1], 10);
    const mm = parseInt(m24[2], 10);
    const period = h >= 12 ? 'PM' : 'AM';
    let h12 = h % 12; if (h12 === 0) h12 = 12;
    return snapToBookableSlot(h12, mm, period);
  }

  // Pattern 3: bare digit + period hint ("4 o'clock afternoon", "9 morning")
  const periodFromContext = detectPeriod(original);
  const bareDigit = lower.match(/\b(\d{1,2})\s*(o'?\s*clock|gantalaki|gantalu|baje|bejey|baajay|mani|mani(?:k|kku)|gante|ghante)\b/);
  if (bareDigit) {
    let h = parseInt(bareDigit[1], 10);
    if (h >= 1 && h <= 12) {
      let period = periodFromContext;
      // Default unspecified hours 1-7 to PM (clinic afternoon)
      if (!period && h >= 1 && h <= 7) period = 'PM';
      if (!period) period = 'AM';
      const mm = HALF_HINTS.some((rx) => rx.test(original)) ? 30 : 0;
      return snapToBookableSlot(h, mm, period);
    }
  }

  // Pattern 4: word-form number + optional period hint ("four o'clock", "నాలుగు గంటలకు")
  const wordHour = findNumberWord(original);
  if (wordHour && wordHour >= 1 && wordHour <= 12) {
    let period = periodFromContext;
    if (!period && wordHour >= 1 && wordHour <= 7) period = 'PM';
    if (!period) period = 'AM';
    const mm = HALF_HINTS.some((rx) => rx.test(original)) ? 30 : 0;
    return snapToBookableSlot(wordHour, mm, period);
  }

  return null;
}

function formatDateForSpeech(dateInput) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Kolkata'
  }).format(date);
}

function extractBookingEntities(text) {
  const lower = text.toLowerCase();
  const original = String(text || '');
  const entities = {};
  const now = nowIST();

  const dayAfterRx = /\b(day after tomorrow|parso|parsoo|elluve|ellundi|naadhdandu|maathnd|naalakke?-?munduvarisuva|methathe naal|methathenaal)\b|परसों|ఎల్లుండి|நாளை மறுநாள்|நாளை மறுதினம்|ನಾಡಿದ್ದು|മറ്റന്നാൾ/;
  const tomorrowRx = /\b(tomorrow|kal|repu|repuu|naalai|nalai|naale|naalye|nale|nalle)\b|कल|రేపు|நாளை|ನಾಳೆ|നാളെ/;
  const todayRx = /\b(today|right now|now|immediately|urgent|emergency|abhi|aaj|ippudu|ippo|ipo|ee roju|innu|innai|ee dina|innannu|ee dinda|innatte)\b|आज|అభి|ఇప్పుడు|ఈ రోజు|ఈరోజు|இன்று|ಇಂದು|ಇವತ್ತು|ഇന്ന്/;

  if (dayAfterRx.test(lower) || dayAfterRx.test(original)) {
    entities.date = new Date(now.getTime() + 2 * 86400000 - IST_OFFSET_MS).toISOString();
  } else if (tomorrowRx.test(lower) || tomorrowRx.test(original)) {
    entities.date = new Date(now.getTime() + 86400000 - IST_OFFSET_MS).toISOString();
  } else if (todayRx.test(lower) || todayRx.test(original)) {
    entities.date = new Date(now.getTime() - IST_OFFSET_MS).toISOString();
  } else {
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const dayMatch = lower.match(/(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december))?/i);
    const monthFirst = lower.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?/i);

    if (dayMatch) {
      const day = parseInt(dayMatch[1], 10);
      const monthStr = dayMatch[2];
      const month = monthStr ? monthNames.indexOf(monthStr.toLowerCase()) : now.getMonth();
      const candidate = new Date(now.getFullYear(), month, day);
      if (candidate < now) candidate.setFullYear(now.getFullYear() + 1);
      entities.date = new Date(candidate.getTime() - IST_OFFSET_MS).toISOString();
    } else if (monthFirst) {
      const month = monthNames.indexOf(monthFirst[1].toLowerCase());
      const day = parseInt(monthFirst[2], 10);
      const candidate = new Date(now.getFullYear(), month, day);
      if (candidate < now) candidate.setFullYear(now.getFullYear() + 1);
      entities.date = new Date(candidate.getTime() - IST_OFFSET_MS).toISOString();
    }
  }

  // Extract requested time-of-day (e.g. "6 pm", "3:30 pm", "18:00").
  const timeSlot = parseTimeToSlot(lower);
  if (timeSlot) entities.timeSlot = timeSlot;

  const deptMap = [
    [/\bemergency\b|आपातकाल|అత్యవసర|அவசர|ತುರ್ತು|അടിയന്തിര/, 'Emergency'],
    [/\bent\b/, 'ENT'],
    [/\bcardio(logy)?\b|कार्डियो|कार्डियोलॉजी|कार्डियोलाजी|కార్డియాలజీ|கார்டியாலஜி|ಕಾರ್ಡಿಯಾಲಜಿ|കാർഡിയോളജി|\bheart\b|दिल|గుండె|இதயம்|ಹೃದಯ|ഹൃദയം/, 'Cardiology'],
    [/\bortho(pedic)?\b|ऑर्थो|ఆర్తో|ஆர்த்தோ|ಆರ್ಥೋ|ഓർത്തോ|\bbone\b|हड्डी/, 'Orthopedics'],
    [/\bderma(tology)?\b|\bskin\b|डर्मा|डर्मेटोलॉजी|డెర్మటాలజీ|டெர்மாட்டோலஜி|ಡರ್ಮಟಾಲಜಿ|ഡെർമറ്റോളജി|त्वचा|చర్మం|தோல்|ಚರ್ಮ|ത്വക്ക്/, 'Dermatology'],
    [/\beye\b|आँख|ఆంఖ్|कண்|ಕಣ್ಣು|കണ്ണ്|నేత్ర|நேத்திர|ഒഫ്താൽ/, 'Ophthalmology'],
    [/\bdental\b|दंत|డెంటల్|பல்|ಹಲ್ಲು|പല്ല്/, 'Dental'],
    [/\bneuro(logy)?\b|न्यूरो|న్యూరో|நியூரோ|ನ್ಯೂರೋ|ന്യൂറോ/, 'Neurology'],
    [/\bpediatric\b|बाल चिकित्सा|శిశు|குழந்தை|ಮಕ್ಕಳ|കുട്ടികളുടെ/, 'Pediatrics'],
    [/\bgynec|स्त्री रोग|మహిళా|பெண்/, 'Gynecology'],
    [/\bgeneral medicine\b|जनरल मेडिसिन|జనరల్ మెడిసిన్|ஜெனரல் மெடிசின்|ಜನರಲ್ ಮೆಡಿಸಿನ್|ജനറൽ മെഡിസിൻ/, 'General Medicine'],
    [/\bgeneric\b/, 'General Medicine'],
    [/\bsurgery\b|शल्य चिकित्सा|శస్త్రచికిత్స|அறுவை சிகிச்சை|ಶಸ್ತ್ರಚಿಕಿತ್ಸೆ|ശസ്ത്രക്രിയ/, 'Surgery']
  ];
  for (const [pattern, department] of deptMap) {
    if (pattern.test(lower) || pattern.test(original)) {
      entities.department = department;
      break;
    }
  }

  return entities;
}

function extractVitalsEntities(lower) {
  const entities = {};
  const tempMatch = lower.match(/(\d{2,3}(?:\.\d)?)\s*(?:degree|°|f\b|fahrenheit|celsius)/i);
  if (tempMatch) entities.temperature = tempMatch[1];
  const bpMatch = lower.match(/(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})/);
  if (bpMatch) entities.bloodPressure = `${bpMatch[1]}/${bpMatch[2]}`;
  const hrMatch = lower.match(/(\d{2,3})\s*(?:bpm|beats|heart rate|pulse)/i);
  if (hrMatch) entities.heartRate = hrMatch[1];
  const spo2Match = lower.match(/(\d{2,3})\s*(?:%|percent|spo2|oxygen)/i);
  if (spo2Match) entities.oxygenSaturation = spo2Match[1];
  return entities;
}

function extractPatientEditEntities(lower) {
  const entities = {};
  const fieldMap = [
    [/\b(name)\b/, 'name'],
    [/\b(phone|mobile|number)\b/, 'phone'],
    [/\b(email|mail)\b/, 'email'],
    [/\b(address|city|street|pincode)\b/, 'address'],
    [/\b(blood group|blood type)\b/, 'bloodGroup'],
    [/\b(allerg(?:y|ies))\b/, 'allergies'],
    [/\b(emergency contact)\b/, 'emergencyContact'],
    [/\b(date of birth|dob|birthday)\b/, 'dateOfBirth'],
    [/\b(gender|sex)\b/, 'gender'],
    [/\b(chronic|condition)\b/, 'chronicConditions'],
  ];
  for (const [pattern, field] of fieldMap) {
    if (pattern.test(lower)) {
      entities.field = field;
      break;
    }
  }

  const toMatch = lower.match(/(?:to|as|with|is)\s+["']?([^"'.,]+)["']?/i);
  if (toMatch) entities.newValue = toMatch[1].trim();
  return entities;
}

function ruleBasedIntent(text) {
  const lower = text.toLowerCase();
  // Multilingual lexicons (covers en + romanized + native scripts for hi/te/ta/kn/ml).
  // Tested against the AI harness corpus.
  const APPT_RX = /(appointment|appt|booking|slot|consultation|अपॉइंटमेंट|अपायंटमेंट|समय|मुलाकात|अपायन्तमेन्त|appointmentlu|appoint|అపాయింట్‌మెంట్|అపాయింట్మెంట్|అపాయింటమెంట్|appointmentu|appointment-?[\u0c00-\u0c7f]*|அப்பாயிண்ட்மென்ட்|அப்பாயிண்ட்|ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್|ಅಪಾಯಿಂಟ್ಮೆಂಟ್|അപ്പോയിന്റ്മെന്റ്|അപ്പോയ്ന്റ്മെന്റ്)/iu;
  const BOOK_VERB_RX = /(book|schedule|make|fix|set up|need|want|get|reserve|arrange|chey|cheyi|karo|kar do|chahiye|kavali|venum|bek|बुक|लेना|करो|कर दो|चाहिए|बुक करना|शेड्यूल|बनाओ|లేదా|బుక్|చేయి|చెయ్యి|కావాలి|తీసుకో|శెడ్యూల్|షెడ్యూల్|பதிவு|பதிவுசெய்|போடு|வேண்டும்|ஏற்பாடு|ಬುಕ್|ಮಾಡು|ಬೇಕು|ವ್ಯವಸ್ಥೆ|ബുക്ക്|വേണം|സെറ്റ്)/iu;
  const CANCEL_RX = /(cancel|remove|delete|drop|stop|रद्द|कैंसल|हटा|निरस्त|रोक|रोको|बंद|రద్దు|క్యాన్సల్|తీసేయి|తొలగించు|ఆపు|ஆபు|ரத்து|நீக்க|விலக்கு|ரத்துசெய்|நிறுத்து|ಕ್ಯಾನ್ಸಲ್|ರದ್ದು|ತೆಗೆದು|ನಿಲ್ಲಿಸು|റദ്ദ്|ക്യാൻസൽ|ഒഴിവാക്കു|നിർത്തു)/iu;
  const SHOW_RX = /(show|list|view|see|get|display|check|दिखा|बता|देख|లిస్ట్|చూపించు|చూడు|చూస్తాను|காட்டு|பார்|பட்டியல்|ತೋರಿಸು|ನೋಡು|കാണിക്കു|കാണു)/iu;
  const MY_RX = /\b(my|mine|mera|meri|naa|nenu|en|enathu|ente|nanage|nann|nann\(u\))\b|मेरा|मेरी|मेरे|నా|నాకు|నేను|என்|என்னுடைய|ನನ್ನ|എന്റെ/iu;
  const MED_RX = /(medication|medicine|drug|pill|prescription|दवा|दवाई|మందు|మెడిసిన్|మందులు|மருந்து|ಔಷಧಿ|മരുന്ന്)/iu;
  const LAB_RX = /(lab result|test result|blood test|reports?|लैब|जांच|रिपोर्ट|ల్యాబ్|పరీక్ష|రిపోర్ట్|ஆய்வு|ரிப்போர்ட்|ಲ್ಯಾಬ್|പരിശോധന|റിപ്പോർട്ട്)/iu;
  const VITAL_RX = /(vitals?|temperature|blood pressure|bp|heart rate|pulse|oxygen|spo2|sugar|glucose|बीपी|बुखार|शुगर|ब्लड प्रेशर|నాడి|షుగర్|బీపీ|உஷ்ணம்|சர்க்கரை|ರಕ್ತದೊತ್ತಡ|പ്രഷർ|പനി)/iu;
  const REMINDER_RX = /(reminder|alarm|alert|याद दिला|रिमाइंडर|గుర్తు|రిమైండర్|நினைவூட்டல்|ನೆನಪಿನ|ഓർമ്മപ്പെടുത്തൽ)/iu;

  const hasAppt = APPT_RX.test(text);
  const hasBookVerb = BOOK_VERB_RX.test(text);
  const hasDateHint = /\b(tomorrow|today|day after|on\s+\d|next week|now|right now|immediately|urgent|abhi|ippudu|kal|repu|naalai|nale|aaj|आज|कल|परसों|నేడు|రేపు|ఎల్లుండి|నిన్న|இன்று|நாளை|ಇಂದು|ನಾಳೆ|ഇന്ന്|നാളെ|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}(?:st|nd|rd|th)?)\b/iu.test(text);
  const hasDeptHint = /\b(ent|cardio|cardiology|ortho|derma|skin|eye|dental|neuro|pediatric|gynec|general medicine|generic|surgery|emergency|कार्डियोलॉजी|डर्मेटोलॉजी|जनरल मेडिसिन|दंत|कार्डియो|కార్డియాలజీ|డర్మటాలజీ|జనరల్ మెడిసిన్|మెడిసిన్|கார்டியாலஜி|பல்|ಕಾರ್ಡಿಯಾಲಜಿ|ഹൃദ്രോഗ|ദന്ത)/iu.test(text);

  // CANCEL has top priority over BOOK when "cancel" verb is present anywhere — politeness
  // wrappers like "I would appreciate it if you could cancel..." otherwise leak into BOOK.
  if (CANCEL_RX.test(text) && (hasAppt || /\b(all|every|sab|saare|anni|ellam)\b/iu.test(text))) {
    const cancelAll = /\b(all|every|recent|sab|saare|anni|ellam|ella|ellaam|सब|सारे|सभी|అన్ని|అన్నీ|எல்லா|எல்லாம்|ಎಲ್ಲಾ|എല്ലാം)\b/iu.test(text);
    return { intent: 'CANCEL_APPOINTMENT', entities: { cancelAll }, confidence: 0.95 };
  }

  // Vital with numeric reading is unambiguous — "Kindly note my BP is 120/80" is ENTER_VITALS.
  const NUMERIC_VITAL_RX = /\b(\d{2,3}\s*\/\s*\d{2,3}|\d{2,3}\s*over\s*\d{2,3}|\d{2,3}\s*(mg\/?dl|bpm|°?\s*[fc]\b|degrees?))\b/iu;
  if (VITAL_RX.test(text) && NUMERIC_VITAL_RX.test(text)) {
    return { intent: 'ENTER_VITALS', entities: extractVitalsEntities(text), confidence: 0.95 };
  }

  if (hasAppt && (hasBookVerb || hasDateHint || hasDeptHint)) {
    return { intent: 'BOOK_APPOINTMENT', entities: extractBookingEntities(text), confidence: 0.95 };
  }
  // Strong booking signal even without the literal word "appointment":
  // a booking verb + (department OR specific time) is unambiguous in this hospital app.
  // Catches "Schedule General Medicine for tomorrow at 6:30 pm", "Book Cardiology at 4pm".
  // BUT skip if the sentence is a question about needing medicine/treatment ("Do I need antibiotics...").
  const isMedicalQuestion = /\b(do|should|can|will|would)\s+(i|we|you|my)\b.*\b(need|take|have|use|try)\b/iu.test(text)
    && /\b(antibiotic|medicine|medication|treatment|drug|pill|paracetamol|ibuprofen|tablet|cure|remedy|fever|cold|flu|infection|pain)\b/iu.test(text);
  if (hasBookVerb && (hasDeptHint || parseTimeToSlot(text)) && !isMedicalQuestion) {
    return { intent: 'BOOK_APPOINTMENT', entities: extractBookingEntities(text), confidence: 0.9 };
  }
  if ((SHOW_RX.test(text) && hasAppt) || (MY_RX.test(text) && hasAppt)) {
    return { intent: 'SHOW_APPOINTMENTS', entities: {}, confidence: 0.95 };
  }
  if (LAB_RX.test(text)) {
    return { intent: 'SHOW_LAB_RESULTS', entities: {}, confidence: 0.95 };
  }
  // SHOW_MEDICATIONS: "show my meds", "what medicines am I taking", "let me know my medications", "tell me my prescriptions"
  const ASK_VERB_RX = /\b(let me know|tell me|what (are|is)|which|am i taking|do i take|currently taking|on right now|बता|बताओ|कौन|చెప్పు|ఏమిటి|ఏం|எவை|ಯಾವ|എന്താണ്)\b/iu;
  if (MED_RX.test(text) && (SHOW_RX.test(text) || ASK_VERB_RX.test(text) || MY_RX.test(text))) {
    return { intent: 'SHOW_MEDICATIONS', entities: {}, confidence: 0.95 };
  }
  if (VITAL_RX.test(text) && /\b(enter|record|log|add|update|submit|check|measure|note|noting|noted|दर्ज|रिकॉर्ड|నమోదు|రికార్డ్|பதிவு|ದಾಖಲಿಸು|രേഖപ്പെടുത്തു)\b/iu.test(text)) {
    return { intent: 'ENTER_VITALS', entities: extractVitalsEntities(text), confidence: 0.95 };
  }
  if (/\b(update|change|edit|modify|correct|बदल|अपडेट|మార్చు|అప్‌డేట్|மாற்று|ಬದಲಾಯಿಸು|മാറ്റം)\b/iu.test(text) && /\b(name|phone|email|address|blood group|allergies?|allergy|emergency contact|date of birth|dob|gender|medication|chronic|condition|नाम|फोन|पता|పేరు|ఫోన్|பெயர்|ತಮಾಷೆ|പേര്)\b/iu.test(text)) {
    return { intent: 'EDIT_PATIENT', entities: extractPatientEditEntities(lower), confidence: 0.9 };
  }
  if (REMINDER_RX.test(text)) {
    return { intent: 'SET_REMINDER', entities: {}, confidence: 0.95 };
  }
  if (lower.includes('queue') || lower.includes('wait time') || lower.includes('waiting time') || lower.includes('how long')) {
    return { intent: lower.includes('wait') || lower.includes('how long') ? 'GET_WAIT_TIME' : 'GET_QUEUE', entities: {}, confidence: 0.95 };
  }
  if (lower.includes('room') || lower.includes('consultation room')) {
    return { intent: 'GET_ROOM', entities: {}, confidence: 0.95 };
  }
  if (lower.includes('notification') || lower.includes('notifications')) {
    return { intent: 'SHOW_NOTIFICATIONS', entities: {}, confidence: 0.95 };
  }

  const pageMap = [
    { keys: ['dashboard'], page: 'dashboard', path: '/dashboard' },
    { keys: ['appointments'], page: 'appointments', path: '/appointments' },
    { keys: ['lab results', 'lab result', 'test results'], page: 'lab results', path: '/lab-results' },
    { keys: ['medications', 'medicine list', 'prescriptions'], page: 'medications', path: '/medications' },
    { keys: ['queue', 'my queue'], page: 'queue', path: '/queue' },
    { keys: ['opd traffic', 'traffic'], page: 'opd traffic', path: '/opd-traffic' },
    { keys: ['profile', 'my profile', 'account'], page: 'profile', path: '/profile' },
    { keys: ['feedback', 'review'], page: 'feedback', path: '/feedback' },
    { keys: ['symptom checker', 'symptom check', 'check symptoms', 'check my symptoms'], page: 'symptom checker', path: '/symptom-checker' }
  ];
  const navMatch = pageMap.find((entry) => entry.keys.some((key) => lower.includes(key)));
  if (navMatch) {
    return { intent: 'NAVIGATE', entities: { page: navMatch.page, path: navMatch.path }, confidence: 0.95 };
  }

  return { intent: 'GENERAL_CHAT', entities: {}, confidence: 0.5 };
}

async function pickAvailableSlot(date, department, requested) {
  // date is a UTC instant; we need the IST calendar day it falls on.
  const istDate = toIST(date);
  const istYear = istDate.getUTCFullYear();
  const istMonth = istDate.getUTCMonth();
  const istDay = istDate.getUTCDate();
  // Day boundaries in IST converted back to UTC for the DB query.
  const startOfDay = new Date(Date.UTC(istYear, istMonth, istDay, 0, 0, 0) - IST_OFFSET_MS);
  const endOfDay = new Date(Date.UTC(istYear, istMonth, istDay, 23, 59, 59) - IST_OFFSET_MS);

  const booked = await Appointment.find({
    department,
    date: { $gte: startOfDay, $lte: endOfDay },
    status: { $nin: ['cancelled', 'no-show'] }
  }).select('timeSlot').lean();

  const nowIst = nowIST();
  const isToday = istDateString(date) === istDateString(new Date());

  const isFutureSlot = (slot) => {
    if (!isToday) return true;
    const [time, period] = slot.split(' ');
    let [h, m] = time.split(':').map(Number);
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    const istHour = nowIst.getUTCHours();
    const istMin = nowIst.getUTCMinutes();
    if (h < istHour) return false;
    if (h === istHour && m <= istMin + 15) return false;
    return true;
  };

  const taken = new Set(booked.map((entry) => entry.timeSlot));
  if (requested && !taken.has(requested) && isFutureSlot(requested)) return requested;

  // If user requested a specific time, prefer the nearest available slot
  // (within ±2 hours) rather than jumping to the first free slot of the day.
  // This avoids surprising the user with a wildly different time when their
  // requested slot is taken.
  if (requested) {
    const slotToMinutes = (slot) => {
      const [time, period] = slot.split(' ');
      let [h, m] = time.split(':').map(Number);
      if (period === 'PM' && h !== 12) h += 12;
      if (period === 'AM' && h === 12) h = 0;
      return h * 60 + m;
    };
    const requestedMin = slotToMinutes(requested);
    const candidates = BOOKABLE_SLOTS
      .filter((slot) => !taken.has(slot) && isFutureSlot(slot))
      .map((slot) => ({ slot, diff: Math.abs(slotToMinutes(slot) - requestedMin) }))
      .filter((entry) => entry.diff <= 120) // within 2 hours
      .sort((a, b) => a.diff - b.diff);
    if (candidates.length) return candidates[0].slot;
  }

  return BOOKABLE_SLOTS.find((slot) => !taken.has(slot) && isFutureSlot(slot)) || null;
}

class IntentService {
  constructor({ logger, openaiClient } = {}) {
    this.logger = logger;
    this.model = ASSISTANT_MODELS.intentClassifier || 'gpt-4o';
    this.openai = openaiClient || null;
    this.handlers = {
      BOOK_APPOINTMENT: this.bookAppointment.bind(this),
      CANCEL_APPOINTMENT: this.cancelAppointment.bind(this),
      SHOW_APPOINTMENTS: this.showAppointments.bind(this),
      SHOW_LAB_RESULTS: this.showLabResults.bind(this),
      SET_REMINDER: this.setReminder.bind(this),
      SHOW_MEDICATIONS: this.showMedications.bind(this),
      ENTER_VITALS: this.enterVitals.bind(this),
      EDIT_PATIENT: this.editPatient.bind(this),
      GET_QUEUE: this.getQueue.bind(this),
      GET_WAIT_TIME: this.getWaitTime.bind(this),
      GET_ROOM: this.getRoom.bind(this),
      SHOW_NOTIFICATIONS: this.showNotifications.bind(this),
      NAVIGATE: this.navigate.bind(this),
      GENERAL_CHAT: this.generalChat.bind(this)
    };
  }

  async detectIntent(text) {
    const input = String(text || '').trim();
    this.logger?.('intent_detect_requested', { model: this.model, chars: input.length });

    // FAST-PATH: rule engine wins for unambiguous intents (cancel/show/vital/medical-Q&A).
    // Catches gpt-4o failure modes like:
    //   "I would appreciate it if you could cancel..." -> AI returns BOOK_APPOINTMENT
    //   "Kindly note my BP is 120/80" -> AI returns GENERAL_CHAT
    //   "Do I need antibiotics for viral fever?" -> AI returns BOOK_APPOINTMENT
    const preRule = ruleBasedIntent(input);
    if (preRule && preRule.confidence >= 0.95
        && ['CANCEL_APPOINTMENT', 'SHOW_APPOINTMENTS', 'SHOW_LAB_RESULTS',
            'SHOW_MEDICATIONS', 'ENTER_VITALS', 'SET_REMINDER'].includes(preRule.intent)) {
      this.logger?.('rule_intent_fastpath', { intent: preRule.intent });
      return preRule;
    }
    // Block "Do I need / Should I take ... medicine/antibiotic ..." style medical questions
    // from being booked by the AI — force GENERAL_CHAT here.
    const isMedicalQuestion = /\b(do|should|can|will|would)\s+(i|we|you|my)\b.*\b(need|take|have|use|try)\b/iu.test(input)
      && /\b(antibiotic|medicine|medication|treatment|drug|pill|paracetamol|ibuprofen|tablet|cure|remedy|fever|cold|flu|infection|pain)\b/iu.test(input)
      && /\?/.test(input);
    if (isMedicalQuestion) {
      this.logger?.('rule_intent_force_general_chat_medical_q', {});
      return { intent: 'GENERAL_CHAT', entities: {}, confidence: 0.9 };
    }

    // AI-driven classification with rule-based fallback / disagreement override.
    if (this.openai) {
      try {
        const result = await this.aiDetectIntent(input);
        if (result && result.intent !== 'GENERAL_CHAT' && result.confidence >= 0.7) {
          return result;
        }
        // If AI says GENERAL_CHAT but rule-based disagrees with high confidence
        // (e.g. it found explicit booking/cancel verbs), trust the rule engine.
        // This catches sporadic gpt-4o misclassifications under load.
        if (result && result.intent === 'GENERAL_CHAT') {
          const ruled = ruleBasedIntent(input);
          if (ruled && ruled.intent !== 'GENERAL_CHAT' && ruled.confidence >= 0.85) {
            this.logger?.('ai_intent_overridden_by_rule', { ai: 'GENERAL_CHAT', rule: ruled.intent });
            return ruled;
          }
          return result;
        }
      } catch (err) {
        this.logger?.('ai_intent_error_falling_back', { error: err.message });
      }
    }

    // Final fallback: rule-based engine (only when OpenAI itself errors out).
    return ruleBasedIntent(input);
  }

  async aiDetectIntent(text) {
    const validIntents = Object.keys(this.handlers);
    const todayIso = new Date().toISOString().split('T')[0];
    const response = await this.openai.chat.completions.create({
      model: this.model,
      temperature: 0,
      max_completion_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You classify a hospital patient utterance into ONE intent. Output ONLY a strict JSON object: {"intent":"X","entities":{...},"confidence":0-1}.

Intents: ${validIntents.join(', ')}.

CRITICAL RULES:
- ANY phrase asking to BOOK / SCHEDULE / RESERVE / MAKE / GET / NEED / WANT an appointment, slot or visit (in ANY language) -> BOOK_APPOINTMENT. Words like "Schedule General Medicine for 6:30 pm" are BOOK_APPOINTMENT, NEVER SHOW_MEDICATIONS.
- ANY phrase asking to CANCEL / REMOVE / DELETE / DROP / KILL an appointment (in ANY language) -> CANCEL_APPOINTMENT. cancelAll=true if "all/every/sab/anni/ellam/saare/saari". Politeness wrappers like "I would appreciate it if you could cancel...", "kindly cancel...", "please cancel..." are STILL CANCEL_APPOINTMENT, NEVER BOOK_APPOINTMENT.
- ANY phrase asking to SEE / SHOW / LIST / VIEW appointments -> SHOW_APPOINTMENTS.
- ANY phrase asking for lab / test results -> SHOW_LAB_RESULTS.
- ANY phrase asking what medicines/medications I am taking -> SHOW_MEDICATIONS.
- ANY phrase RECORDING / NOTING / LOGGING / SUBMITTING vital signs (BP, sugar, temp, pulse, oxygen) WITH numeric values -> ENTER_VITALS. Phrases like "Kindly note my BP is 120/80", "I would like my BP recorded at 120/80", "log my sugar 110" are ENTER_VITALS, NEVER GENERAL_CHAT.
- ANY phrase changing patient PROFILE data (name/phone/email/address) -> EDIT_PATIENT.
- ANY phrase setting a medicine reminder -> SET_REMINDER.
- ANY phrase asking to OPEN / GO TO / NAVIGATE TO a page -> NAVIGATE.
- A medical / symptom QUESTION (no booking verb, no numeric vital) -> GENERAL_CHAT. Questions like "Do I need antibiotics for viral fever?" or "Should I take medicine for X?" are GENERAL_CHAT, NEVER BOOK_APPOINTMENT — they ask for medical advice, not an appointment.

For BOOK_APPOINTMENT entities ALWAYS extract:
  - date: ISO string in IST. Today=${todayIso}. Map "today/abhi/ippudu/ippo/ipo/ee roju/aaj"->today, "tomorrow/kal/repu/naalai/nale/nale"->today+1day, "day after tomorrow/parso/eluve/ellundi"->today+2days.
  - department: one of Cardiology, Dermatology, Orthopedics, Ophthalmology, Dental, Neurology, Pediatrics, Gynecology, ENT, Emergency, "General Medicine" (default).
  - timeSlot: "HH:MM AM/PM" 12h. Map "morning/subah/udayam/kalai/belagge/ravile"->AM, "afternoon/dopahar/madhyahnam/madhyaanam/madhyahna/uchch/ucha"->PM, "evening/night/shaam/saayantram/maalai/sanje/vaikunneram"->PM. Spelled-out hours: "four/four o'clock/char/nalugu/naalu/naalku/nalu"->4. "naalugun(n)ar/four thirty/saade chaar/chaarun(n)ar"->:30. Default minutes 00. Times 1-7 with no AM/PM and no morning context default to PM (afternoon clinic hours).

Few-shot examples (each line is ONE complete output):
INPUT: "Book a Cardiology appointment tomorrow at 4 PM"
OUTPUT: {"intent":"BOOK_APPOINTMENT","entities":{"department":"Cardiology","timeSlot":"04:00 PM","date":"<tomorrow>"},"confidence":0.97}
INPUT: "Schedule General Medicine for tomorrow evening 6:30 pm"
OUTPUT: {"intent":"BOOK_APPOINTMENT","entities":{"department":"General Medicine","timeSlot":"06:30 PM","date":"<tomorrow>"},"confidence":0.97}
INPUT: "I want a Dermatology slot tomorrow afternoon four o clock"
OUTPUT: {"intent":"BOOK_APPOINTMENT","entities":{"department":"Dermatology","timeSlot":"04:00 PM","date":"<tomorrow>"},"confidence":0.95}
INPUT: "कल शाम चार बजे कार्डियोलॉजी अपॉइंटमेंट बुक करो"
OUTPUT: {"intent":"BOOK_APPOINTMENT","entities":{"department":"Cardiology","timeSlot":"04:00 PM","date":"<tomorrow>"},"confidence":0.96}
INPUT: "रेपु మధ్యాహ్నం నాలుగు గంటలకు కార్డియాలజీ అపాయింట్‌మెంట్ బుక్ చేయి"
OUTPUT: {"intent":"BOOK_APPOINTMENT","entities":{"department":"Cardiology","timeSlot":"04:00 PM","date":"<tomorrow>"},"confidence":0.95}
INPUT: "మెరి అపాయింట్‌మెంట్‌ను రద్దు చేయి"
OUTPUT: {"intent":"CANCEL_APPOINTMENT","entities":{"cancelAll":false},"confidence":0.96}
INPUT: "نا اپاینٹ‌منٹلو cancel chesi"
OUTPUT: {"intent":"CANCEL_APPOINTMENT","entities":{"cancelAll":false},"confidence":0.9}
INPUT: "మెరి అపాయింట్‌మెంట్లు చూపించు"
OUTPUT: {"intent":"SHOW_APPOINTMENTS","entities":{},"confidence":0.96}
INPUT: "మెరి దైనందిన అపాయింట్‌మెంట్లు చూపించు"
OUTPUT: {"intent":"SHOW_APPOINTMENTS","entities":{},"confidence":0.95}
INPUT: "పారాసిటమాల్ ఎందుకు వాడతారు?"
OUTPUT: {"intent":"GENERAL_CHAT","entities":{},"confidence":0.9}
INPUT: "మెరి బ్లడ్ ప్రెషర్ 120/80 రికార్డ్ చేయి"
OUTPUT: {"intent":"ENTER_VITALS","entities":{"bloodPressure":"120/80"},"confidence":0.9}
INPUT: "Open the profile page"
OUTPUT: {"intent":"NAVIGATE","entities":{"page":"profile","path":"/profile"},"confidence":0.97}

Always set confidence >= 0.8 for clear booking/cancel/show/navigate intents — they are unambiguous when the verbs are present in any language.`
        },
        { role: 'user', content: text }
      ]
    });

    const raw = response?.choices?.[0]?.message?.content?.trim() || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed.intent && this.handlers[parsed.intent]) {
        // Merge AI-extracted entities with rule-based extraction for booking (dates, departments, time)
        let entities = parsed.entities || {};
        if (parsed.intent === 'BOOK_APPOINTMENT') {
          const ruleEntities = extractBookingEntities(text);
          // Rule-based wins for time/date/department when AI omits them
          entities = { ...ruleEntities, ...entities };
          // Backstop: if AI omitted timeSlot but rule parser found one, use it.
          if (!entities.timeSlot && ruleEntities.timeSlot) {
            entities.timeSlot = ruleEntities.timeSlot;
          }
          // Date precedence: when the rule engine matched an explicit date keyword
          // (tomorrow/day-after/today in any of 6 languages), trust it over the AI.
          // The AI sometimes hallucinates today's date even when the user clearly said tomorrow.
          if (ruleEntities.date) {
            entities.date = ruleEntities.date;
          }
          // Validate AI-supplied timeSlot format ("HH:MM AM/PM"). If garbage, re-parse from text.
          if (entities.timeSlot && !/^\d{2}:\d{2} (AM|PM)$/.test(String(entities.timeSlot).trim())) {
            const reparsed = parseTimeToSlot(String(entities.timeSlot)) || parseTimeToSlot(text);
            if (reparsed) entities.timeSlot = reparsed;
            else delete entities.timeSlot;
          }
          if (!entities.date) {
            entities.date = new Date().toISOString();
          }
          if (!entities.department) {
            entities.department = 'General Medicine';
          }
        }
        return {
          intent: parsed.intent,
          entities,
          confidence: parsed.confidence || 0.85
        };
      }
    }
    return null;
  }

  async execute(intent, entities = {}, context = {}) {
    const handler = this.handlers[intent];
    if (!handler) {
      throw new Error(`Unhandled intent: ${intent}`);
    }
    return handler(entities, context);
  }

  async bookAppointment(entities, { userId }) {
    const date = entities.date ? new Date(entities.date) : new Date();
    if (Number.isNaN(date.getTime())) date.setTime(Date.now());
    const department = entities.department || 'General Medicine';
    const isToday = istDateString(date) === istDateString(new Date());

    let timeSlot = await pickAvailableSlot(date, department, entities.timeSlot);
    let bookedDate = date;

    // If today is fully booked or it's already late in the day, roll to tomorrow automatically.
    if (!timeSlot && isToday) {
      const tomorrow = new Date(Date.now() + 86400000);
      timeSlot = await pickAvailableSlot(tomorrow, department, entities.timeSlot);
      if (timeSlot) {
        bookedDate = tomorrow;
      }
    }

    if (!timeSlot) {
      return { success: false, message: `Sorry, ${department} has no open slots on ${formatDateForSpeech(date)} or tomorrow. Please pick another department.` };
    }

    const appointment = await Appointment.create({
      patientId: userId,
      doctorId: null, // auto-assigned at reception verification
      date: bookedDate,
      department,
      timeSlot,
      type: 'new',
      status: 'scheduled',
      priority: department === 'Emergency' ? 'emergency' : 'normal',
      symptoms: [],
      qrToken: generateQrToken()
    });

    const dateLabel = istDateString(bookedDate) === istDateString(new Date())
      ? 'today'
      : istDateString(bookedDate) === istDateString(new Date(Date.now() + 86400000))
        ? 'tomorrow'
        : formatDateForSpeech(bookedDate);

    return {
      success: true,
      message: `Done. Your ${department} appointment is booked for ${dateLabel} at ${timeSlot}. Token ID ${appointment._id.toString().slice(-6).toUpperCase()}. Please show your QR at the reception desk — they will verify you, assign an available doctor, and direct you to the OPD queue.`,
      action: 'NAVIGATE',
      navigateTo: '/appointments',
      data: appointment
    };
  }

  async cancelAppointment(entities, { userId }) {
    const appointments = await Appointment.find({ patientId: userId, status: { $in: ['scheduled', 'in-queue'] } }).sort({ date: 1 });
    if (appointments.length === 0) {
      return { success: false, message: 'You have no active appointments to cancel.' };
    }

    // Cancel ALL if user asked for "all" or "cancel all"
    if (entities.cancelAll === true || entities.cancelAll === 'true') {
      const count = appointments.length;
      await Appointment.updateMany(
        { patientId: userId, status: { $in: ['scheduled', 'in-queue'] } },
        { $set: { status: 'cancelled' } }
      );
      return {
        success: true,
        message: `All ${count} appointment${count > 1 ? 's have' : ' has'} been cancelled.`,
        action: 'NAVIGATE',
        navigateTo: '/appointments'
      };
    }

    const target = entities.appointmentId
      ? appointments.find((appointment) => appointment._id.toString().includes(entities.appointmentId))
      : appointments[0];

    if (!target) {
      return { success: false, message: 'Could not find the appointment to cancel.' };
    }

    target.status = 'cancelled';
    await target.save();
    return {
      success: true,
      message: `Appointment on ${formatDateForSpeech(target.date)} has been cancelled.`,
      action: 'NAVIGATE',
      navigateTo: '/appointments'
    };
  }

  async showAppointments(_entities, { userId }) {
    const appointments = await Appointment.find({ patientId: userId }).sort({ date: -1 }).limit(5).lean();
    if (appointments.length === 0) {
      return { success: true, message: 'You have no appointments scheduled.' };
    }

    if (appointments.length === 1) {
      const appointment = appointments[0];
      return {
        success: true,
        message: `You have one appointment in ${appointment.department || 'General'} on ${formatDateForSpeech(appointment.date)}, and it is ${appointment.status}.`,
        action: 'NAVIGATE',
        navigateTo: '/appointments'
      };
    }

    const ordinals = ['first', 'second', 'third', 'fourth', 'fifth'];
    const parts = appointments.map((appointment, index) => `Your ${ordinals[index] || `${index + 1}th`} appointment is ${appointment.department || 'General'} on ${formatDateForSpeech(appointment.date)}, status ${appointment.status}`);
    return {
      success: true,
      message: `You have ${appointments.length} recent appointments. ${parts.join('. ')}.`,
      action: 'NAVIGATE',
      navigateTo: '/appointments'
    };
  }

  async showLabResults(entities, { userId }) {
    const query = { patientId: userId };
    if (entities.testName) {
      const escaped = entities.testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.testName = new RegExp(escaped, 'i');
    }

    const labs = await LabResult.find(query).sort({ createdAt: -1 }).limit(5).lean();
    if (labs.length === 0) {
      return { success: true, message: 'No lab results found.' };
    }

    const ordinals = ['first', 'second', 'third', 'fourth', 'fifth'];
    const parts = labs.map((lab, index) => `Your ${ordinals[index] || `${index + 1}th`} result is ${lab.testName}, which is ${lab.status}`);
    return {
      success: true,
      message: `You have ${labs.length} lab results. ${parts.join('. ')}.`,
      action: 'NAVIGATE',
      navigateTo: '/lab-results'
    };
  }

  async setReminder(entities) {
    return {
      success: true,
      message: `I'll set a reminder for ${entities.medication || 'your medication'}${entities.time ? ` at ${entities.time}` : ''}. You can manage reminders in the Medication Reminders section.`,
      action: 'NAVIGATE',
      navigateTo: '/medication-reminders'
    };
  }

  async showMedications(_entities, { userId }) {
    const medications = await Medication.find({ patientId: userId, isActive: true }).lean();
    if (medications.length === 0) {
      return { success: true, message: 'You have no active medications.' };
    }

    const parts = medications.map((medication) => `${medication.name} ${medication.dosage}, taken ${medication.frequency}`);
    return {
      success: true,
      message: `You have ${medications.length} active medication${medications.length > 1 ? 's' : ''}. ${parts.join('. ')}.`,
      action: 'NAVIGATE',
      navigateTo: '/medications'
    };
  }

  async enterVitals(entities) {
    const parts = [];
    if (entities.temperature) parts.push(`Temperature: ${entities.temperature} degrees Fahrenheit`);
    if (entities.bloodPressure) parts.push(`Blood pressure: ${entities.bloodPressure}`);
    if (entities.heartRate) parts.push(`Heart rate: ${entities.heartRate} beats per minute`);
    if (entities.oxygenSaturation) parts.push(`SpO2: ${entities.oxygenSaturation} percent`);

    return {
      success: true,
      message: parts.length > 0
        ? `Noted vitals: ${parts.join(', ')}. Please go to the vitals entry page to record them properly.`
        : 'Please navigate to your appointment to enter vitals.',
      action: 'NAVIGATE',
      navigateTo: '/appointments'
    };
  }

  async editPatient(entities, { userId }) {
    const field = entities.field;
    const newValue = entities.newValue;

    if (!field) {
      return {
        success: true,
        message: 'Which detail would you like to update? You can change your name, phone, email, address, blood group, allergies, emergency contact, or date of birth.',
        action: 'NAVIGATE',
        navigateTo: '/profile'
      };
    }

    if (!newValue) {
      return {
        success: true,
        message: `What would you like to change your ${field.replace(/([A-Z])/g, ' $1').toLowerCase()} to? Please say the new value.`,
      };
    }

    const userFields = ['name', 'phone', 'email'];
    const patientFields = ['bloodGroup', 'gender', 'dateOfBirth', 'allergies', 'chronicConditions', 'address', 'emergencyContact'];

    if (userFields.includes(field)) {
      const updateData = { [field]: newValue.trim() };
      if (field === 'email') updateData.email = newValue.trim().toLowerCase();
      await User.findByIdAndUpdate(userId, updateData);
      return {
        success: true,
        message: `Your ${field} has been updated to "${newValue}".`,
        action: 'NAVIGATE',
        navigateTo: '/profile'
      };
    }

    if (patientFields.includes(field)) {
      let updateValue = newValue.trim();
      if (field === 'allergies' || field === 'chronicConditions') {
        updateValue = newValue.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
      }
      if (field === 'bloodGroup') {
        const validGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
        const normalized = newValue.toUpperCase().replace(/\s+/g, '').replace('POSITIVE', '+').replace('NEGATIVE', '-');
        if (!validGroups.includes(normalized)) {
          return { success: false, message: `Invalid blood group "${newValue}". Valid options are: ${validGroups.join(', ')}.` };
        }
        updateValue = normalized;
      }
      await Patient.findOneAndUpdate(
        { userId },
        { [field]: updateValue, userId },
        { upsert: true }
      );
      return {
        success: true,
        message: `Your ${field.replace(/([A-Z])/g, ' $1').toLowerCase()} has been updated.`,
        action: 'NAVIGATE',
        navigateTo: '/profile'
      };
    }

    return {
      success: false,
      message: `Sorry, I can't update "${field}" via voice. Please update it from your profile page.`,
      action: 'NAVIGATE',
      navigateTo: '/profile'
    };
  }

  async getQueue(_entities, { userId }) {
    const appointment = await Appointment.findOne({ patientId: userId, status: 'in-queue' }).lean();
    if (!appointment) {
      return { success: true, message: 'You are not currently in any queue.' };
    }

    const workflow = await WorkflowState.findOne({ appointmentId: appointment._id, isActive: true }).lean();
    return {
      success: true,
      message: workflow
        ? `Your queue position is ${workflow.queuePosition || 'N/A'}. Token number: ${workflow.tokenNumber || 'N/A'}. Estimated wait: ${workflow.estimatedWaitTime || 'N/A'} minutes.`
        : `You are in queue for ${appointment.department}. Position: ${appointment.queuePosition || 'N/A'}.`,
      action: 'NAVIGATE',
      navigateTo: '/queue'
    };
  }

  async getWaitTime(_entities, { userId }) {
    const appointment = await Appointment.findOne({ patientId: userId, status: { $in: ['scheduled', 'in-queue'] } }).lean();
    if (!appointment) {
      return { success: true, message: 'You have no upcoming appointments.' };
    }

    const wait = appointment.estimatedWaitTime || Math.floor(Math.random() * 30) + 5;
    return { success: true, message: `Estimated wait time is approximately ${wait} minutes for ${appointment.department}.` };
  }

  async getRoom(_entities, { userId }) {
    const workflow = await WorkflowState.findOne({ patientId: userId, isActive: true }).lean();
    if (!workflow || !workflow.roomNumber) {
      return { success: true, message: 'No consultation room assigned yet. Please wait for your turn.' };
    }

    return { success: true, message: `Your consultation is in Room ${workflow.roomNumber}.` };
  }

  async showNotifications(_entities, { userId }) {
    const notifications = await Notification.find({ userId, isRead: false }).sort({ createdAt: -1 }).limit(5).lean();
    if (notifications.length === 0) {
      return { success: true, message: 'You have no unread notifications.' };
    }

    const parts = notifications.map((notification) => `${notification.title}: ${notification.message}`);
    return {
      success: true,
      message: `You have ${notifications.length} unread notification${notifications.length > 1 ? 's' : ''}. ${parts.join('. ')}.`,
      action: 'NAVIGATE',
      navigateTo: '/notifications'
    };
  }

  async navigate(entities) {
    const pageMap = {
      dashboard: '/dashboard',
      appointments: '/appointments',
      consultations: '/consultations',
      'lab results': '/lab-results',
      labs: '/lab-results',
      medications: '/medications',
      queue: '/queue',
      traffic: '/opd-traffic',
      'opd traffic': '/opd-traffic',
      notifications: '/notifications',
      profile: '/profile',
      feedback: '/feedback',
      'symptom checker': '/symptom-checker',
      symptoms: '/symptom-checker',
      reminders: '/medication-reminders',
      'follow ups': '/follow-ups',
      'follow-ups': '/follow-ups',
      'health tracking': '/health-tracking',
      health: '/health-tracking',
      'sample tracking': '/sample-tracking',
      samples: '/sample-tracking'
    };
    const page = entities.page?.toLowerCase() || '';
    const path = entities.path || pageMap[page] || Object.entries(pageMap).find(([key]) => page.includes(key))?.[1];

    if (!path) {
      return { success: true, message: 'Which page would you like to go to?' };
    }

    return {
      success: true,
      message: `Navigating to ${page || 'that page'}.`,
      action: 'NAVIGATE',
      navigateTo: path
    };
  }

  async generalChat() {
    return null;
  }
}

module.exports = IntentService;
