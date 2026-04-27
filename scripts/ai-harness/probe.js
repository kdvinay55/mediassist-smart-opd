(async () => {
  const lr = await fetch('https://mediassist-api.onrender.com/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'rahul@patient.com', password: 'patient123' })
  });
  const t = (await lr.json()).token;
  const c = await (await fetch('https://mediassist-api.onrender.com/api/assistant/command', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
    body: JSON.stringify({ text: 'cancel all my appointments', language: 'en' })
  })).json();
  console.log('cancel:', c.response);

  const tests = [
    ['ta', 'கல்யாணம், நாளை மதியம் நான்கு மணிக்கு கார்டியாலஜி இல்ல தீவனே.'],
    ['ml', 'എനിക്ക് നാളെ ഉച്ചകഴിഞ്ഞ് 4 മണിക്ക് കാർഡിയോളജിയിൽ അപ്പോയിന്റ്മെന്റ് വേണ്ടതാണ്, അത് ചെയ്യുമോ?']
  ];
  for (const [lang, text] of tests) {
    const r = await fetch('https://mediassist-api.onrender.com/api/assistant/command', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: JSON.stringify({ text, language: lang, sessionLanguage: lang })
    });
    const b = await r.json();
    console.log('---', lang);
    console.log('date:', b.data?.date, 'timeSlot:', b.data?.timeSlot, 'success:', b.success);
    console.log('response:', (b.response || '').slice(0, 150));
  }
})();
