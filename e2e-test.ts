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

  // ---- ログイン以降（実 backend の /api/auth/login で本物の JWT を取得） ----
  // backend(3001) が起動していない場合はスキップ
  let backendUp = false;
  try {
    const r = await fetch('http://localhost:3001/health');
    backendUp = r.ok;
  } catch { /* backend not running */ }

  if (backendUp) {
    await test('Login with demo credentials → Dashboard renders', async () => {
      await page.click('button[type="submit"]');
      // LoginPage は成功時 window.location.href = '/' でリロードする
      await page.waitForSelector('[data-testid="apsf-tab"]', { timeout: 15000 });
    });

    await test('APSF Runs tab → real framework run list renders', async () => {
      await page.click('[data-testid="apsf-tab"]');
      const panel = page.locator('[data-testid="apsf-panel"], [data-testid="apsf-unavailable"]');
      await panel.first().waitFor({ state: 'visible', timeout: 10000 });
      // APSF_ROOT 設定済み backend なら実 run 一覧が出る
      const hasPanel = await page.locator('[data-testid="apsf-panel"]').count();
      assert(hasPanel === 1, 'APSF panel unavailable — is APSF_ROOT set on the backend?');
      const items = page.locator('[data-testid="apsf-run-list"] button');
      assert(await items.count() > 0, 'run list is empty');
    });

    await test('Select run → real phase detection (`apsf next`) shows badge', async () => {
      await page.locator('[data-testid="apsf-run-list"] button').first().click();
      // クリック直後はプレースホルダー "—" が一瞬表示される（detectPhase は
      // 非同期）ため、実フェーズトークンが入るまで待つ
      await page.waitForFunction(
        () => /[A-Z_]{4,}/.test(
          document.querySelector('[data-testid="apsf-phase"]')?.textContent ?? ''
        ),
        undefined,
        { timeout: 30000 }
      );
      const text = (await page.locator('[data-testid="apsf-phase"]').textContent())?.trim() || '';
      assert(/[A-Z_]{4,}/.test(text), `unexpected phase badge: "${text}"`);
    });

    // ---- run 作成 → human フェーズ記入の一気通貫（実 apsf start-run / write-phase） ----
    const E2E_RUN = 'work_explorer-e2e-ui-test';
    const today = new Date().toISOString().slice(0, 10);
    const E2E_RUN_FULL = `${today}_${E2E_RUN}`;

    await test('Create run from UI → TASK_NEEDED badge', async () => {
      await page.click('[data-testid="apsf-new-run"]');
      await page.fill('[data-testid="apsf-new-run-name"]', E2E_RUN);
      await page.click('[data-testid="apsf-create-run"]');
      // 作成後は新 run が自動選択され TASK_NEEDED になる
      const badge = page.locator('[data-testid="apsf-phase"]');
      await page.waitForFunction(
        () => document.querySelector('[data-testid="apsf-phase"]')?.textContent?.includes('TASK_NEEDED'),
        undefined,
        { timeout: 30000 }
      );
      assert((await badge.textContent())?.includes('TASK_NEEDED'), 'phase is not TASK_NEEDED');
    });

    await test('Human phase editor: write task.md from UI → BUILD_NEEDED', async () => {
      await page.click('[data-testid="apsf-edit-phase"]');
      const textarea = page.locator('[data-testid="apsf-editor-textarea"]');
      await textarea.waitFor({ state: 'visible', timeout: 10000 });
      await textarea.fill(
        '# Task\n\n## What\n\nE2E UI からの human フェーズ記入テスト。\n\n' +
        '## Context\n\n- Playwright による実ブラウザ操作\n- 保存は apsf write-phase 経由\n\n' +
        '## Done Criteria\n\n- [x] UI から task.md が保存できる\n'
      );
      await page.click('[data-testid="apsf-save-phase"]');
      // write-phase により実フェーズが BUILD_NEEDED へ遷移する
      await page.waitForFunction(
        () => document.querySelector('[data-testid="apsf-phase"]')?.textContent?.includes('BUILD_NEEDED'),
        undefined,
        { timeout: 30000 }
      );
    });

    // ---- クラッシュ回復の failed 表示（回復後の run_state を再現） ----
    const apsfRootForFail = process.env.APSF_ROOT || 'C:/Users/PC_User/PRJ/ai-problem-solving-framework';

    await test('Failed run: banner with last_error is shown, cleared after next write', async () => {
      const { readFileSync: rf, writeFileSync: wf } = await import('fs');
      const statePath = `${apsfRootForFail}/runs/work/${E2E_RUN_FULL}/run_state.json`;
      // クラッシュ回復（recoverOrphanedRuns）が書く failed 状態を再現
      const state = JSON.parse(rf(statePath, 'utf-8'));
      wf(statePath, JSON.stringify({
        ...state,
        phase_status: 'failed',
        last_error: 'Backend terminated during execution (E2E simulated).',
      }, null, 2));

      await page.click('button[title="Re-detect phase"]');
      const banner = page.locator('[data-testid="apsf-failed"]');
      await banner.waitFor({ state: 'visible', timeout: 15000 });
      assert((await banner.textContent())?.includes('E2E simulated'), 'last_error not displayed');

      // 復旧（次のフェーズ書き込みで status は pending に戻る）
      wf(statePath, JSON.stringify(state, null, 2));
      await page.click('button[title="Re-detect phase"]');
      await banner.waitFor({ state: 'hidden', timeout: 15000 });
    });

    // ---- Judge 裁定（Return to Build）の一連操作 ----
    // BUILD/REVIEW は AI フェーズのため、実 backend REST（実 write-phase）で
    // IMPROVE_NEEDED まで駆動し、裁定の UI 操作だけを実ブラウザで検証する
    const apsfRoot = process.env.APSF_ROOT || 'C:/Users/PC_User/PRJ/ai-problem-solving-framework';

    await test('Judge decision UI: Return to Build → BUILD_NEEDED badge + build_review.md', async () => {
      // 実 JWT を取得して REST で BUILD/REVIEW フェーズを書き進める
      const login = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'e2e@test.com', password: 'secret123' }),
      });
      const { token } = await login.json();
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const writes = [
        '# Build\n\n## Work Done\n\n- E2E 用ダミー成果物。\n- 実装は存在しない。\n\n' +
        '## Notes\n\n- Judge 裁定 E2E の前段。\n- write-phase 経由で遷移する。\n',
        '# Review\n\n## Findings\n\n- E2E 用レビュー本文。\n- 実 write-phase 経由で保存。\n\n' +
        '## Assessment\n\n- Judge が UI で裁定する。\n\n' +
        '```apsf-judge-advisory\n{"recommendation": "Return to Build", "human_owned_blocker": false}\n```\n',
      ];
      for (const content of writes) {
        const w = await fetch(`http://localhost:3001/api/runs/apsf/${E2E_RUN_FULL}/write-phase`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ content }),
        });
        assert(w.status === 200, `write-phase failed: ${await w.text()}`);
      }

      // ブラウザ側: フェーズ再検出 → IMPROVE_NEEDED + 裁定 UI
      await page.click('button[title="Re-detect phase"]');
      await page.waitForFunction(
        () => document.querySelector('[data-testid="apsf-phase"]')?.textContent?.includes('IMPROVE_NEEDED'),
        undefined,
        { timeout: 30000 }
      );
      const judgePanel = page.locator('[data-testid="apsf-judge"]');
      await judgePanel.waitFor({ state: 'visible', timeout: 10000 });

      // 理由なしでは Return ボタンは無効
      assert(await page.locator('[data-testid="apsf-judge-return-build"]').isDisabled(),
        'Return to Build should be disabled without a reason');

      await page.fill('[data-testid="apsf-judge-reason"]', 'E2E: 検証手順が不足しているため差し戻す。');
      await page.click('[data-testid="apsf-judge-return-build"]');
      await page.waitForFunction(
        () => document.querySelector('[data-testid="apsf-phase"]')?.textContent?.includes('BUILD_NEEDED'),
        undefined,
        { timeout: 30000 }
      );

      // 差し戻し理由が成果物化されていること
      const { readFileSync, existsSync } = await import('fs');
      const reviewPath = `${apsfRoot}/runs/work/${E2E_RUN_FULL}/build_review.md`;
      assert(existsSync(reviewPath), 'build_review.md not created');
      assert(readFileSync(reviewPath, 'utf-8').includes('検証手順が不足'), 'reason missing in build_review.md');
    });

    await test('Transcript selector: DryRun 実行 → 過去実行を選択して再表示', async () => {
      // 実行前は「過去の実行はまだありません」の空状態（エラーと区別された明示状態）
      const emptyState = page.locator('[data-testid="apsf-executions-empty"]');
      await emptyState.waitFor({ state: 'visible', timeout: 15000 });

      // Return to Build 後の run で DryRun 実行（DryRun はデフォルト ON、AI なし・数 ms で完了）
      await page.selectOption('[data-testid="apsf-command"]', 'build');
      await page.click('[data-testid="apsf-execute"]');

      // 実行完了でセレクタに過去実行が 1 件現れる
      await page.waitForFunction(
        () => document.querySelectorAll('[data-testid="apsf-transcript-select"] option').length >= 2,
        undefined,
        { timeout: 30000 }
      );

      // 過去実行を選択 → トランスクリプトが再表示される（DryRun の行を含む）
      const value = await page
        .locator('[data-testid="apsf-transcript-select"] option')
        .nth(1)
        .getAttribute('value');
      await page.selectOption('[data-testid="apsf-transcript-select"]', value!);
      await page.waitForFunction(
        () => document.querySelector('[data-testid="apsf-log"]')?.textContent?.includes('DryRun'),
        undefined,
        { timeout: 15000 }
      );

      // ライブへ戻れる
      await page.selectOption('[data-testid="apsf-transcript-select"]', '');
    });

    // E2E で作成した一時 run を削除
    const { rmSync } = await import('fs');
    rmSync(`${apsfRoot}/runs/work/${E2E_RUN_FULL}`, { recursive: true, force: true });
  } else {
    console.log('⏭️  SKIP  post-login E2E (backend not running on 3001)');
  }

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
