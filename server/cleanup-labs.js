const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smartopd').then(async () => {
  const LabResult = require('./models/LabResult');
  
  const total = await LabResult.countDocuments();
  console.log('Total labs:', total);
  
  const noGroup = await LabResult.countDocuments({ orderGroup: { $exists: false } });
  console.log('Labs without orderGroup:', noGroup);
  
  if (noGroup > 0) {
    const result = await LabResult.deleteMany({ orderGroup: { $exists: false } });
    console.log('Deleted labs without orderGroup:', result.deletedCount);
  }
  
  // Also clean stale pending labs
  const stale = await LabResult.deleteMany({ patientConsent: 'pending' });
  console.log('Deleted stale pending labs:', stale.deletedCount);
  
  const remaining = await LabResult.countDocuments();
  console.log('Remaining labs:', remaining);
  
  process.exit(0);
}).catch(err => { console.error(err); process.exit(1); });
