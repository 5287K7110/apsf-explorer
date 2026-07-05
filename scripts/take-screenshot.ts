/**
 * README 用スクリーンショット撮影（開発ユーティリティ）
 * 前提: backend :3001 と vite :5173 が起動中
 * 実行: npx tsx scripts/take-screenshot.ts
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

async function main() {
  mkdirSync('docs/images', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // ログイン
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'demo@apsf.dev');
  await page.fill('input[type="password"]', 'demo');
  await page.click('button[type="submit"]');
  await page.waitForSelector('[data-testid="apsf-tab"]', { timeout: 15000 });

  // APSF Runs タブ → run 選択 → フェーズ表示
  await page.click('[data-testid="apsf-tab"]');
  await page.waitForSelector('[data-testid="apsf-run-list"] button', { timeout: 10000 });
  await page.locator('[data-testid="apsf-run-list"] button').last().click();
  await page.waitForSelector('[data-testid="apsf-phase"]', { timeout: 30000 });
  await page.waitForTimeout(800);

  await page.screenshot({ path: 'docs/images/apsf-runs-panel.png' });
  console.log('✅ Saved docs/images/apsf-runs-panel.png');

  await browser.close();
}

main();
