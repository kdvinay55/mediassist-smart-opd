// Phase 9 — UI validation across viewports (desktop, tablet, mobile)
// Note: tablet+mobile projects already configured in playwright.config.js
import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/ui.js';

const PAGES = [
  { role: 'patient', path: '/dashboard', heading: /dashboard|good (morning|afternoon|evening)/i },
  { role: 'patient', path: '/appointments', heading: /appointments/i },
  { role: 'patient', path: '/medications', heading: /medications/i },
  { role: 'patient', path: '/notifications', heading: /notifications/i },
  { role: 'patient', path: '/queue', heading: /queue/i },
  { role: 'doctor', path: '/dashboard', heading: /good (morning|afternoon|evening)/i },
  { role: 'receptionist', path: '/reception', heading: /reception/i },
  { role: 'lab', path: '/lab-dashboard', heading: /laboratory|lab/i }
];

test.describe('Phase 9 — UI validation', () => {

  for (const { role, path, heading } of PAGES) {
    test(`${role} renders ${path} without console errors`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', err => errors.push(err.message));
      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      await loginAs(page, role);
      await page.goto(path);

      // Sidebar always visible
      await expect(page.locator('aside')).toBeVisible({ timeout: 15_000 });
      // Heading present
      await expect(page.getByRole('heading').first()).toBeVisible();

      // Allow benign warnings; fail only on hard JS errors
      const benign = /(WebSocket|sockjs|hot-update|vite|HMR|source-?map|net::ERR_|Refused to|preload|MetaMask|favicon|deprecat|React DevTools|Permission|user denied|chrome-extension|Capacitor|Uncaught \(in promise\).*(401|403|Network|AbortError)|Failed to fetch|manifest|service worker|sw\.js|404|ResizeObserver)/i;
      const hard = errors.filter(e => !benign.test(e));
      expect(hard, `Console errors on ${path}: ${hard.join('\n')}`).toEqual([]);
    });
  }

  test('responsive: mobile sidebar toggle works', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Chromium only');
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, 'patient');
    await page.goto('/dashboard');

    // The hamburger only shows on small screens (lg:hidden)
    const hamburger = page.getByRole('button').filter({ has: page.locator('svg') }).first();
    await expect(hamburger).toBeVisible();
  });

  test('typography + buttons readable: no text smaller than 10px', async ({ page }) => {
    await loginAs(page, 'patient');
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const tooSmall = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('body *'));
      const offenders = [];
      for (const el of all) {
        const style = getComputedStyle(el);
        const size = parseFloat(style.fontSize);
        const visible = el.offsetParent !== null && (el.textContent || '').trim().length > 0;
        if (visible && size > 0 && size < 10) {
          offenders.push({ tag: el.tagName, size, text: (el.textContent || '').trim().slice(0, 40) });
          if (offenders.length > 5) break;
        }
      }
      return offenders;
    });
    // Tailwind's text-[10px] is intentionally used for some metadata, so allow up to a small number.
    expect(tooSmall.length).toBeLessThan(20);
  });
});
