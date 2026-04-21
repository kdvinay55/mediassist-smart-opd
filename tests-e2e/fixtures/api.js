// API helper — direct REST calls bypassing the UI for setup/teardown/assertions.
import { request } from '@playwright/test';
import { API_URL, USERS } from './test-data.js';

let cachedTokens = {};

/**
 * Login a user via the JSON API and return the JWT token.
 */
export async function apiLogin(role) {
  const user = USERS[role];
  if (!user) throw new Error(`Unknown role: ${role}`);
  if (cachedTokens[role]) return cachedTokens[role];

  const ctx = await request.newContext({ baseURL: API_URL });
  const res = await ctx.post('/api/auth/login', {
    data: { identifier: user.identifier, password: user.password }
  });
  if (!res.ok()) {
    throw new Error(`Login failed for ${role}: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  cachedTokens[role] = body.token;
  await ctx.dispose();
  return body.token;
}

export async function apiContext(role) {
  const token = await apiLogin(role);
  return request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` }
  });
}

export async function seedDemoData() {
  const ctx = await request.newContext({ baseURL: API_URL });
  const res = await ctx.post('/api/demo/seed', { data: {} });
  await ctx.dispose();
  if (!res.ok()) {
    throw new Error(`Demo seed failed: ${res.status()}`);
  }
  return res.json();
}

export async function apiHealth() {
  const ctx = await request.newContext({ baseURL: API_URL });
  const res = await ctx.get('/api/health');
  await ctx.dispose();
  return res.ok();
}

export function clearTokenCache() {
  cachedTokens = {};
}

/**
 * Generate a random "HH:MM AM|PM" slot in the 9 AM-4 PM window.
 */
export function uniqSlot(baseHour = 9) {
  const hour = baseHour + Math.floor(Math.random() * 7); // 9..15 by default
  const min = Math.floor(Math.random() * 60);
  const display = hour > 12 ? hour - 12 : hour;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${String(display).padStart(2, '0')}:${String(min).padStart(2, '0')} ${ampm}`;
}

/**
 * Book an appointment, retrying with a fresh slot on 400 (slot collision).
 * Returns the parsed JSON appointment body.
 */
export async function bookAppointmentWithRetry(ctx, payload, { attempts = 8, baseHour = 9 } = {}) {
  let lastStatus = 0;
  let lastBody = '';
  for (let i = 0; i < attempts; i++) {
    const data = { ...payload, timeSlot: payload.timeSlot || uniqSlot(baseHour) };
    const res = await ctx.post('/api/appointments', { data });
    if (res.ok()) return res.json();
    lastStatus = res.status();
    lastBody = await res.text().catch(() => '');
    // retry on conflicts / validation collisions
    if (![400, 409].includes(lastStatus)) break;
    payload.timeSlot = undefined; // force a new slot next loop
  }
  throw new Error(`bookAppointmentWithRetry failed after ${attempts} attempts: ${lastStatus} ${lastBody}`);
}
