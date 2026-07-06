/**
 * Run 作成（apsf start-run の TS ネイティブ移植）
 *
 * 参照仕様: ai-problem-solving-framework
 *   src/apsf/legacy/cli/main.py start_run_cmd / _create_light_run / _LIGHT_RUN_FILES
 *   src/apsf/legacy/storage/run_repository.py init_run / next_run_seq / format_run_name
 *
 * - light: 埋め込みテンプレート 4 ファイル + run_state bootstrap（TASK_NEEDED）
 * - heavy: runs/_template/ の再帰コピー（*.seed.json 除外、run_state は遅延生成）
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { bootstrapRunState } from './run-state.js';
import { resolveRunTemplateDir } from './content-root.js';

/** python の write_text (newline=None) と同じ: \n を OS ネイティブ改行へ変換 */
function toOsNewlines(text: string): string {
  return os.EOL === '\n' ? text : text.replace(/\n/g, os.EOL);
}

/** _LIGHT_RUN_FILES（main.py:128-173 の忠実移植） */
export const LIGHT_RUN_FILES: Record<string, string> = {
  'execution-assignment.md':
    '# Execution Assignment\n\n' +
    '---\n\n' +
    '## Run Name\n\n' +
    '<!-- Fill in the run name if needed. -->\n\n' +
    '## Task Summary\n\n' +
    '<!-- Summarize the task once task.md is authored. -->\n\n' +
    '---\n\n' +
    '## Role Execution Assignments\n\n' +
    '| Role    | Execution Type | Tool / Method | Notes |\n' +
    '|---------|----------------|---------------|-------|\n' +
    '| Builder | cli            | claude / codex | Main implementation |\n' +
    '| Critic  | human / cli    | Human / Codex  | Independent review |\n',
  'task.md':
    '# Task\n\n' +
    '## What\n\n' +
    '<!-- Write the task in 1-3 sentences. -->\n\n' +
    '## Context\n\n' +
    '<!-- Put only the minimum background and constraints here. -->\n\n' +
    '-\n\n' +
    '## Done Criteria\n\n' +
    '- [ ]\n',
  'build.md':
    '# Build\n\n' +
    '## What was built\n\n' +
    '<!-- Builder records the actual implementation here. -->\n\n' +
    '## Files changed\n\n' +
    '<!-- List changed or created files here. -->\n\n' +
    '## Decisions made\n\n' +
    '<!-- Record implementation decisions and reasons here. -->\n\n' +
    '## Open issues\n\n' +
    '<!-- Record unresolved issues or follow-up points here. -->\n',
  'review.md':
    '# Review\n\n' +
    '## Summary\n\n' +
    '<!-- PASS / CONDITIONAL PASS / FAIL -->\n\n' +
    '## Findings\n\n' +
    '<!-- Review against task.md and build.md here. -->\n\n' +
    '## Notes\n\n' +
    '<!-- Optional reviewer notes. -->\n',
};

export type Taxonomy = 'fw-improvement' | 'work' | undefined;

/** taxonomy による run ディレクトリ決定（run_repository._resolve_run_root） */
function runParentDir(apsfRoot: string, taxonomy: Taxonomy): string {
  const runsDir = path.join(apsfRoot, 'runs');
  return taxonomy ? path.join(runsDir, taxonomy) : runsDir;
}

/** 同日 run の次連番（run_repository.next_run_seq）— 全 taxonomy を横断して最大値+1 */
function nextRunSeq(apsfRoot: string, dateStr: string): number {
  const runsDir = path.join(apsfRoot, 'runs');
  const dirs = [runsDir, path.join(runsDir, 'fw-improvement'), path.join(runsDir, 'work')];
  let maxSeq = 0;
  const re = new RegExp(`^${dateStr}-(\\d+)_`);
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const m = e.name.match(re);
      if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    }
  }
  return maxSeq + 1;
}

/** ローカル日付を YYYY-MM-DD で返す（python の date.today() と同じ基準） */
function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 日付プレフィックス補完（start_run_cmd: YYYY-MM-DD(-NNN)_ がなければ付与） */
export function normalizeRunName(apsfRoot: string, rawName: string): string {
  if (/^\d{4}-\d{2}-\d{2}(?:-\d+)?_/.test(rawName)) return rawName;
  // NOTE: toISOString() は UTC 日付のため、UTC+9 等では深夜〜朝に前日となり
  // python の date.today()（ローカル）と食い違う（実運用で発見した実バグ）
  const today = localToday();
  const seq = nextRunSeq(apsfRoot, today);
  return `${today}-${String(seq).padStart(3, '0')}_${rawName}`;
}

export interface StartRunOptions {
  light?: boolean;
  taxonomy?: Taxonomy;
  force?: boolean;
}

/**
 * 新しい run を作成し、正規化済み run 名を返す
 */
export function startRun(
  apsfRoot: string,
  rawName: string,
  options: StartRunOptions = {}
): string {
  const runName = normalizeRunName(apsfRoot, rawName);
  const runDir = path.join(runParentDir(apsfRoot, options.taxonomy), runName);

  if (fs.existsSync(runDir)) {
    if (!options.force) {
      throw new Error(`Run directory already exists: ${runDir}`);
    }
    fs.rmSync(runDir, { recursive: true, force: true });
  }

  if (options.light) {
    // Light run: 埋め込みテンプレート + TASK_NEEDED bootstrap
    fs.mkdirSync(runDir, { recursive: true });
    for (const [filename, content] of Object.entries(LIGHT_RUN_FILES)) {
      fs.writeFileSync(path.join(runDir, filename), toOsNewlines(content), 'utf-8');
    }
    bootstrapRunState(runDir, { phase: 'TASK_NEEDED', runType: 'light' });
  } else {
    // Heavy run: runs/_template/ の再帰コピー（*.seed.json 除外）
    // workspace にテンプレートがなければ Explorer 同梱コンテンツを使用
    const templateDir = resolveRunTemplateDir(apsfRoot);
    if (!fs.existsSync(templateDir)) {
      throw new Error(`Template directory not found: ${templateDir}`);
    }
    fs.cpSync(templateDir, runDir, {
      recursive: true,
      filter: (src) => !src.endsWith('.seed.json'),
    });
    // run_state は遅延生成（python 版と同じ: 初回 act/next 時に advisory から bootstrap）
  }

  return runName;
}
