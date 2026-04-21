// Global setup — runs once before all tests.
// Waits for API health, then re-seeds demo data idempotently.
import { request } from '@playwright/test';
import { API_URL } from './fixtures/test-data.js';

async function waitForServer(url, timeoutMs = 60_000) {
  const ctx = await request.newContext();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await ctx.get(url);
      if (r.ok()) { await ctx.dispose(); return true; }
    } catch { /* keep polling */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  await ctx.dispose();
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

export default async function globalSetup() {
  console.log('\n[E2E] Global setup starting…');
  console.log(`[E2E] API_URL=${API_URL}`);

  await waitForServer(`${API_URL}/api/health`);
  console.log('[E2E] API health OK');

  const ctx = await request.newContext({ baseURL: API_URL });
  const seed = await ctx.post('/api/demo/seed', { data: {} });
  if (!seed.ok()) {
    const body = await seed.text();
    throw new Error(`Demo seed failed: ${seed.status()} ${body}`);
  }
  const seedJson = await seed.json();
  console.log(`[E2E] Demo seed OK (${seedJson?.staff?.length || 0} staff, ${seedJson?.patients?.length || 0} patients)`);
  await ctx.dispose();
}
