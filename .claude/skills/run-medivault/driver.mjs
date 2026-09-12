// MediVault smoke driver. Runs the frontend in mock-auth mode through a real
// browser: landing page -> register <role> -> dashboard -> Storage Vault tab
// -> logout -> login again. Screenshots land in --shots (default: ./.claude/skills/run-medivault/shots).
//
//   node .claude/skills/run-medivault/driver.mjs [--role patient|doctor|hospital|all] [--base http://localhost:5177] [--shots DIR]
//
// Requires: dev server already listening on --base, and `playwright` resolvable
// from the repo (npm install --no-save playwright). Exits 1 on any failure or
// any console/page error.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const BASE = arg('base', 'http://localhost:5177');
const SHOTS = arg('shots', '.claude/skills/run-medivault/shots');
const ROLE = arg('role', 'patient');
const PASSWORD = 'Medivault2026'; // >= 8 chars, letter + number (src/utils/authValidation.js)
mkdirSync(SHOTS, { recursive: true });

const ROLES = {
  patient: {
    fill: async (page, email) => {
      await page.fill('#fullName', 'Smoke Patient');
      await page.fill('#email', email);
      await page.fill('#dateOfBirth', '1990-05-14');
      await page.selectOption('#bloodGroup', { label: 'O+' });
    },
    secondTab: 'Storage Vault',
  },
  doctor: {
    fill: async (page, email) => {
      await page.fill('#fullName', 'Smoke Doctor');
      await page.fill('#email', email);
      await page.fill('#licenseNumber', `LIC-${Date.now()}`); // unique per run: doctors.license_number is UNIQUE
      await page.selectOption('#specialization', { label: 'Cardiology' });
    },
    secondTab: null,
  },
  hospital: {
    fill: async (page, email) => {
      await page.fill('#hospitalName', 'Smoke General Hospital');
      await page.fill('#officialEmail', email);
      await page.fill('#licenseNumber', `HOSP-${Date.now()}`); // unique per run
      await page.fill('#phone', '9876543210');
      await page.fill('#address', '1 Test Street');
      const proof = join(SHOTS, 'proof.pdf');
      writeFileSync(proof, '%PDF-1.4\n% smoke proof\n');
      await page.setInputFiles('#proof', proof);
    },
    secondTab: null,
  },
};

const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));

const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });
const log = (...a) => console.log('[driver]', ...a);

async function runRole(role) {
  const spec = ROLES[role];
  if (!spec) throw new Error(`unknown role ${role}`);
  const email = `smoke-${role}-${Date.now()}@example.com`;

  await page.goto(`${BASE}/register/${role}`, { waitUntil: 'networkidle' });
  const heading = (await page.locator('h1, h2').first().textContent())?.trim();
  log(role, 'register heading:', heading);
  await spec.fill(page, email);
  await page.fill('#password', PASSWORD);
  await page.fill('#confirmPassword', PASSWORD);
  await shot(`${role}-1-register-filled`);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/dashboard/${role}`, { timeout: 10000 });
  await page.waitForTimeout(1200); // dashboard panels fade in; an immediate shot is half-transparent
  log(role, 'dashboard url:', page.url());
  await shot(`${role}-2-dashboard`);

  if (spec.secondTab) {
    await page.getByText(spec.secondTab, { exact: true }).first().click();
    await page.waitForTimeout(800);
    const body = await page.locator('body').innerText();
    if (!body.includes(spec.secondTab)) throw new Error(`${spec.secondTab} tab did not render`);
    await shot(`${role}-3-${spec.secondTab.toLowerCase().replace(/\s+/g, '-')}`);
  }

  // Logout via the sidebar button, then log back in with the same mock account.
  await page.getByRole('button', { name: 'Logout' }).click();
  await page.waitForTimeout(500);
  await page.goto(`${BASE}/login/${role}`, { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/dashboard/${role}`, { timeout: 10000 });
  log(role, 'login round-trip ok:', page.url());
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  log('landing title:', await page.title());
  await shot('0-landing');

  const roles = ROLE === 'all' ? Object.keys(ROLES) : [ROLE];
  for (const r of roles) await runRole(r);

  if (errors.length) {
    console.error('[driver] browser errors:\n' + errors.join('\n'));
    process.exitCode = 1;
  } else {
    log('OK - no console/page/network errors. Screenshots in', SHOTS);
  }
} catch (e) {
  console.error('[driver] FAILED:', e.message);
  await shot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
