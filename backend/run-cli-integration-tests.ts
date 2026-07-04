/**
 * CLI Integration Test Runner (REAL detection + REAL invocation)
 *
 * - Detection: 実際に where/which で PATH を探索する（固定文字列を返さない）
 * - Invocation: 検出された CLI を実プロセスとして起動し、出力を検証する
 * - SKIP は「CLI が本当に PATH に存在しない」場合のみ
 */
import { spawn, execSync } from 'child_process';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  duration: number;
  message?: string;
}

const results: TestResult[] = [];
const WHICH = process.platform === 'win32' ? 'where' : 'which';

function record(name: string, status: TestResult['status'], duration: number, message?: string): void {
  results.push({ name, status, duration, message });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️ ';
  console.log(`${icon} ${status}  ${name}${message ? ` — ${message}` : ''} (${duration}ms)`);
}

/** 実際に PATH を探索して CLI の実在パスを返す（存在しなければ null） */
function detectCommand(command: string): string | null {
  try {
    const out = execSync(`${WHICH} ${command}`, { stdio: 'pipe' }).toString().trim();
    const first = out.split(/\r?\n/)[0]?.trim();
    return first || null;
  } catch {
    return null;
  }
}

/** CLI を実プロセスとして起動し stdout/stderr/exit code を取得 */
function invoke(
  command: string,
  args: string[],
  timeoutMs = 30000
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // Windows では npm グローバル CLI が .cmd シムのため shell 経由で起動
    const child = spawn(command, args, { shell: true, timeout: timeoutMs });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => (stdout += d.toString()));
    child.stderr?.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function testDetection(label: string, command: string): Promise<string | null> {
  const start = Date.now();
  const found = detectCommand(command);
  if (found) {
    record(`${label} detection (${WHICH} ${command})`, 'PASS', Date.now() - start, found);
  } else {
    record(`${label} detection (${WHICH} ${command})`, 'SKIP', Date.now() - start, 'not in PATH');
  }
  return found;
}

async function testVersion(label: string, command: string | null): Promise<void> {
  const start = Date.now();
  if (!command) {
    record(`${label} --version (real invocation)`, 'SKIP', Date.now() - start, 'CLI not detected');
    return;
  }
  try {
    const { code, stdout, stderr } = await invoke(command, ['--version']);
    const output = (stdout + stderr).trim();
    if (code === 0 && /\d+\.\d+/.test(output)) {
      record(`${label} --version (real invocation)`, 'PASS', Date.now() - start,
        output.split(/\r?\n/)[0]);
    } else {
      record(`${label} --version (real invocation)`, 'FAIL', Date.now() - start,
        `exit=${code}, output=${output.slice(0, 120)}`);
    }
  } catch (e) {
    record(`${label} --version (real invocation)`, 'FAIL', Date.now() - start,
      e instanceof Error ? e.message : String(e));
  }
}

async function testHelpOutput(label: string, command: string | null): Promise<void> {
  const start = Date.now();
  if (!command) {
    record(`${label} --help output parsing`, 'SKIP', Date.now() - start, 'CLI not detected');
    return;
  }
  try {
    const { code, stdout } = await invoke(command, ['--help']);
    if (code === 0 && stdout.length > 50 && /usage/i.test(stdout)) {
      record(`${label} --help output parsing`, 'PASS', Date.now() - start,
        `${stdout.length} bytes, contains usage`);
    } else {
      record(`${label} --help output parsing`, 'FAIL', Date.now() - start,
        `exit=${code}, ${stdout.length} bytes`);
    }
  } catch (e) {
    record(`${label} --help output parsing`, 'FAIL', Date.now() - start,
      e instanceof Error ? e.message : String(e));
  }
}

async function testErrorHandling(): Promise<void> {
  const start = Date.now();
  // 存在しないコマンド: detection が null を返すこと
  const bogus = detectCommand('definitely-not-a-real-cli-xyz');
  if (bogus !== null) {
    record('Error handling: nonexistent CLI detection returns null', 'FAIL', Date.now() - start,
      `unexpectedly found: ${bogus}`);
    return;
  }
  record('Error handling: nonexistent CLI detection returns null', 'PASS', Date.now() - start);

  // 存在しないコマンドの実行: 例外/非ゼロ終了として安全に処理されること
  const start2 = Date.now();
  try {
    const { code } = await invoke('definitely-not-a-real-cli-xyz', ['--version'], 5000);
    if (code !== 0) {
      record('Error handling: nonexistent CLI invocation fails safely', 'PASS', Date.now() - start2,
        `exit=${code}`);
    } else {
      record('Error handling: nonexistent CLI invocation fails safely', 'FAIL', Date.now() - start2,
        'exit=0 for nonexistent command');
    }
  } catch {
    // spawn error として捕捉されるのも正しい挙動
    record('Error handling: nonexistent CLI invocation fails safely', 'PASS', Date.now() - start2,
      'spawn error handled');
  }
}

async function main(): Promise<void> {
  console.log('🚀 CLI Integration Tests — real PATH detection, real CLI invocation\n');

  // Detection（実 where/which）
  const claude = await testDetection('Claude CLI', 'claude');
  // codex が正式コマンド名。旧名 codex-cli もフォールバックで探索
  const codex = (await testDetection('Codex CLI', 'codex')) ?? (await testDetection('Codex CLI (legacy name)', 'codex-cli'));

  // Invocation（実プロセス実行）
  await testVersion('Claude CLI', claude ? 'claude' : null);
  await testVersion('Codex CLI', codex ? 'codex' : null);
  await testHelpOutput('Claude CLI', claude ? 'claude' : null);

  // Error handling
  await testErrorHandling();

  // Results
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;
  console.log('\n========================================');
  console.log(`RESULTS: ${pass} PASS, ${fail} FAIL, ${skip} SKIP (of ${results.length})`);
  console.log('========================================');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
