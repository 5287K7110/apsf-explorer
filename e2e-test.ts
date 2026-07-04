/**
 * E2E Test — 実ブラウザで Frontend の描画を検証
 *
 * vite dev サーバーを実際に起動し、Playwright (Chromium) で
 * Login ページが正しく描画されること・Tailwind CSS が適用されることを確認する。
 *
 * これにより vite.config.ts / index.html / main.tsx / tailwind.config.js の
 * 設定破損（v1.0 テスト時に多発した問題）を自動検出できる。
 *
 * 実行: npx tsx e2e-test.ts
 */
import { spawn, ChildProcess, execSync } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium, Browser, Page } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.E2E_PORT || 5173);
const URL = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;
let vite: ChildProcess | undefined;
let spawnedVite = false;
let browser: Browser | undefined;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    passed++;
    console.log(`✅ PASS  ${name} (${Date.now() - start}ms)`);
  } catch (e) {
    failed++;
    console.log(`❌ FAIL  ${name} — ${e instanceof Error ? e.message : e}`);
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function isViteUp(): Promise<boolean> {
  try {
    const r = await fetch(URL);
    return r.ok;
  } catch {
    return false;
  }
}

async function ensureVite(): Promise<void> {
  if (await isViteUp()) {
    console.log(`ℹ️  Reusing already-running dev server on port ${PORT}\n`);
    return;
  }
  spawnedVite = true;
  vite = spawn('npm run dev', {
    cwd: __dirname,
    shell: true,
    env: { ...process.env },
  });
  vite.stderr?.on('data', (d) => console.error(`[vite:err] ${d}`));

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await isViteUp()) {
      console.log(`✅ Vite dev server started on port ${PORT}\n`);
      return;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('Vite dev server did not start within 30s');
}

function stopVite(): void {
  if (!spawnedVite || !vite || vite.pid === undefined) return;
  if (process.platform === 'win32') {
    try { execSync(`taskkill /pid ${vite.pid} /T /F`, { stdio: 'pipe' }); } catch { /* already dead */ }
  } else {
    vite.kill('SIGTERM');
  }
}

async function main(): Promise<void> {
  console.log('🚀 E2E Tests — real vite dev server + real Chromium rendering\n');

  await ensureVite();

  browser = await chromium.launch();
  const page: Page = await browser.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await test('Page loads at ' + URL, async () => {
    const res = await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });
    assert(res && res.ok(), `HTTP status: ${res?.status()}`);
  });

  await test('Login page renders (Sign In heading)', async () => {
    const heading = page.locator('h1', { hasText: 'Sign In' });
    await heading.waitFor({ state: 'visible', timeout: 10000 });
  });

  await test('React mounted without runtime errors', async () => {
    const rootHtml = await page.locator('#root').innerHTML();
    assert(rootHtml.length > 100, `#root nearly empty (${rootHtml.length} bytes) — React failed to mount`);
    const fatal = consoleErrors.filter((e) => !e.includes('WebSocket') && !e.includes('favicon'));
    assert(fatal.length === 0, `console errors: ${fatal.slice(0, 3).join(' | ')}`);
  });

  await test('Email input field exists', async () => {
    const email = page.locator('input[type="email"]');
    assert(await email.count() === 1, `found ${await email.count()} email inputs`);
    assert(await email.isVisible(), 'email input not visible');
  });

  await test('Password input field exists', async () => {
    const pw = page.locator('input[type="password"]');
    assert(await pw.count() === 1, `found ${await pw.count()} password inputs`);
    assert(await pw.isVisible(), 'password input not visible');
  });

  await test('Sign In button exists', async () => {
    const btn = page.locator('button[type="submit"]', { hasText: 'Sign In' });
    assert(await btn.count() === 1, 'Sign In submit button not found');
  });

  await test('Demo Mode text is displayed', async () => {
    const demo = page.locator('text=Demo Mode');
    await demo.waitFor({ state: 'visible', timeout: 5000 });
  });

  await test('Tailwind CSS is applied (not default styles)', async () => {
    // LoginPage のカードは bg-slate-900 (rgb(15, 23, 42))。
    // Tailwind がビルドされていなければ transparent のまま = CSS パス破損を検出
    const card = page.locator('div.bg-slate-900').first();
    assert(await card.count() > 0, 'bg-slate-900 element not found');
    const bg = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
    assert(bg === 'rgb(15, 23, 42)', `expected rgb(15, 23, 42), got ${bg} — Tailwind CSS not applied`);
    // レイアウトも確認（min-h-screen flex が効いているか）
    const outer = page.locator('div.min-h-screen').first();
    const display = await outer.evaluate((el) => getComputedStyle(el).display);
    assert(display === 'flex', `expected display:flex, got ${display}`);
  });

  await test('Form is interactive (typing works)', async () => {
    await page.fill('input[type="email"]', 'e2e@test.com');
    await page.fill('input[type="password"]', 'secret123');
    assert(await page.inputValue('input[type="email"]') === 'e2e@test.com', 'email value mismatch');
  });

  await browser.close();
  stopVite();

  console.log('\n========================================');
  console.log(`RESULTS: ${passed} PASS, ${failed} FAIL (of ${passed + failed})`);
  console.log('========================================');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error('Fatal:', e);
  await browser?.close();
  stopVite();
  process.exit(1);
});
