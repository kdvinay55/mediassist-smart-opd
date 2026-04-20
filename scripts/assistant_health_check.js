const path = require('path');

require(path.join(__dirname, '..', 'server', 'node_modules', 'dotenv')).config({
  path: path.join(__dirname, '..', 'server', '.env')
});

const UnifiedAssistantService = require('../server/services/assistant/UnifiedAssistantService');

const live = process.argv.includes('--live');

(async () => {
  const service = new UnifiedAssistantService();
  const result = await service.runHealthCheck({ live });
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'ok') {
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(JSON.stringify({ status: 'failed', error: error.message }, null, 2));
  process.exitCode = 1;
});