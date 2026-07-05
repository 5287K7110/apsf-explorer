/**
 * APSF PhaseDetector — TypeScript ネイティブ移植
 *
 * 参照仕様: ai-problem-solving-framework
 *   src/apsf/legacy/orchestration/phase_detector.py（file heuristic advisory scan）
 *   src/apsf/legacy/cli/main.py next_cmd（canonical run_state.json との統合）
 *
 * `apsf next <run> --phase-only` と同じフェーズ値を、python プロセスなしで
 * 返すことを目的とする（parity test: run-apsf-parity-test.ts）。
 *
 * 本実装は読み取り専用。python 版 `apsf next` が行う副作用
 * （run_state.json の advisory sync 書き込み、build gate record の修復）は行わない。
 */
import * as fs from 'fs';
import * as path from 'path';
import { ApsfPhase, PHASES, isValidTransition, isHumanPhase } from './phases.js';

/** フェーズ検出で走査する既知ファイル（ワークフロー順） */
const KNOWN_FILES = [
  'task.md',
  'execution-assignment.md',
  'model-assignment.md',
  'goal.md',
  'plan_review.md',
  'plan.md',
  'handoff.md',
  'build_review.md',
  'improve-plan.md',
  'build.md',
  'review.md',
  'improve_review.md',
  'improve.md',
  'verify.md',
  'result.md',
  'transcript.md',
] as const;

export interface PhaseInfo {
  phase: ApsfPhase;
  nextRole: string;
  fileToWrite: string;
  filesToRead: string[];
  humanOwned: boolean;
  source: 'canonical' | 'advisory';
  decisionReason: string;
  existingFiles: string[];
  filledFiles: string[];
}

interface RunStateLite {
  current_phase?: string;
  phase_status?: string;
  run_type?: string;
}

export class PhaseDetector {
  constructor(private runDir: string) {}

  // ── ファイル判定 ──────────────────────────────────────────────

  private exists(filename: string): boolean {
    return fs.existsSync(path.join(this.runDir, filename));
  }

  private readText(filename: string): string {
    return fs.readFileSync(path.join(this.runDir, filename), 'utf-8');
  }

  private loadRunState(): RunStateLite | null {
    const p = path.join(this.runDir, 'run_state.json');
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch {
      return null;
    }
  }

  /** run_dir から runs/ ルートを辿る */
  private findRunsRoot(): string | null {
    let dir = path.resolve(this.runDir);
    for (;;) {
      if (path.basename(dir) === 'runs') return dir;
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }

  /** run ファイルがテンプレートと完全一致か（start-run 直後の複製は未成果物扱い） */
  private matchesRunTemplate(filename: string): boolean {
    const filePath = path.join(this.runDir, filename);
    if (!fs.existsSync(filePath)) return false;

    const runsRoot = this.findRunsRoot();
    if (!runsRoot) return false;

    let templatePath = path.join(runsRoot, '_template', filename);
    if (!fs.existsSync(templatePath)) {
      const fwTemplate = path.join(path.dirname(runsRoot), 'framework', 'templates', filename);
      if (fs.existsSync(fwTemplate)) {
        templatePath = fwTemplate;
      } else {
        return false;
      }
    }

    try {
      return (
        fs.readFileSync(filePath, 'utf-8') === fs.readFileSync(templatePath, 'utf-8')
      );
    } catch {
      return false;
    }
  }

  /**
   * 「意味のある行」のカウント（phase_detector.py _count_meaningful_lines の忠実移植）
   */
  static countMeaningfulLines(text: string): number {
    const lines = text.split(/\r?\n/);
    let count = 0;
    let inHtmlComment = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const s = line.trim();

      // HTML comment block tracking
      if (inHtmlComment) {
        if (line.includes('-->')) inHtmlComment = false;
        continue;
      }
      if (s.includes('<!--')) {
        if (!s.includes('-->')) inHtmlComment = true;
        continue;
      }

      // 空行
      if (!s) continue;
      // 見出し
      if (s.startsWith('#')) continue;
      // 水平区切り (---/***/___ 3文字以上)
      if (/^[-*_]{3,}$/.test(s)) continue;
      // 裸の箇条書き "- "
      if (/^-\s*$/.test(s)) continue;
      // 未チェックのチェックボックス "- [ ] ..."
      if (/^-\s*\[\s*\]/.test(s)) continue;
      // "なし / none / N/A" プレースホルダー箇条書き
      if (/^-\s*(なし|none|N\/A)\s*$/i.test(s)) continue;

      // テーブル行
      if (s.startsWith('|') && s.endsWith('|')) {
        const cells = s.slice(1, -1).split('|');
        // テーブル区切り行: |---|---|
        if (cells.every((c) => /^[\s:\-=]+$/.test(c))) continue;
        // 空テーブル行
        if (cells.every((c) => c.trim() === '')) continue;
        // テーブルヘッダー行: 次行がテーブル区切り行
        if (i + 1 < lines.length) {
          const nextS = lines[i + 1].trim();
          if (nextS.startsWith('|') && nextS.endsWith('|')) {
            const nextCells = nextS.slice(1, -1).split('|');
            if (nextCells.every((c) => /^[\s:\-=]+$/.test(c))) continue;
          }
        }
      }

      // 太字ラベル行 "**Label**" / "**Label**:"
      if (/^\*\*[^*]+\*\*:?\s*$/.test(s)) continue;
      // 短いプレースホルダー箇条書き "- 概要:" / "- H1:"
      if (/^-\s+\S{1,6}:\s*$/.test(s)) continue;
      // コードフェンス行
      if (/^[`~]{3,}/.test(s)) continue;
      // 全角括弧プレースホルダー "（...）" のみの行
      if (/^（.+）$/.test(s)) continue;
      // ボックス描画文字行
      if (/^[═─━╔╗╚╝║╠╣╦╩╬]+$/.test(s)) continue;

      count++;
    }
    return count;
  }

  private hasMarkerLine(content: string, marker: string): boolean {
    return content.split(/\r?\n/).some((l) => l.trim() === marker);
  }

  /** ファイルに意味のある内容があるか（4 行以上） */
  private isFilled(filename: string): boolean {
    if (!this.exists(filename)) return false;
    if (this.matchesRunTemplate(filename)) return false;
    const content = this.readText(filename);
    if (
      filename === 'build.md' &&
      this.hasMarkerLine(content, '<!-- apsf-build-status: in_progress -->') &&
      !this.hasMarkerLine(content, '<!-- apsf-build-status: completed -->')
    ) {
      return false;
    }
    if (filename === 'transcript.md') {
      return content.includes('Generated:');
    }
    return PhaseDetector.countMeaningfulLines(content) > 3;
  }

  // ── Advisory 検出（file heuristic） ──────────────────────────

  detectAdvisory(): PhaseInfo {
    const existing = KNOWN_FILES.filter((f) => this.exists(f));
    const filled = KNOWN_FILES.filter((f) => this.isFilled(f));

    const info = (
      phase: ApsfPhase,
      nextRole: string,
      fileToWrite: string,
      filesToRead: string[],
      decisionReason: string
    ): PhaseInfo => ({
      phase,
      nextRole,
      fileToWrite,
      filesToRead,
      humanOwned: isHumanPhase(phase),
      source: 'advisory',
      decisionReason,
      existingFiles: [...existing],
      filledFiles: [...filled],
    });

    // ── LIGHT RUN ──
    const state = this.loadRunState();
    const declaredType = String(state?.run_type ?? '').trim().toLowerCase();
    const isLightRun = declaredType ? declaredType === 'light' : this.exists('task.md');

    if (isLightRun) {
      if (!this.isFilled('task.md')) {
        return info('TASK_NEEDED', 'Human', 'task.md', ['task.md'],
          'light run; task.md not filled (TASK_NEEDED)');
      }
      if (!this.isFilled('build.md')) {
        return info('BUILD_NEEDED', 'Builder', 'build.md',
          ['task.md', ...(this.exists('build_review.md') ? ['build_review.md'] : [])],
          'task.md filled; build.md not filled (light run)');
      }
      if (!this.isFilled('review.md')) {
        return info('REVIEW_NEEDED', 'Critic', 'review.md', ['task.md', 'build.md'],
          'build.md filled; review.md not filled (light run)');
      }
      return info('COMPLETE', '(none)', '(none)', [], 'All light run files filled');
    }

    // ── SETUP ──
    if (!this.isFilled('execution-assignment.md')) {
      const anyLater = ['goal.md', 'plan.md', 'build.md', 'review.md', 'result.md']
        .some((f) => this.isFilled(f));
      if (!anyLater) {
        return info('SETUP_NEEDED', 'Human', 'execution-assignment.md',
          ['framework/templates/execution-assignment.md'],
          'execution-assignment.md is missing or unfilled');
      }
    }

    // ── GOAL ──
    if (!this.isFilled('goal.md')) {
      return info('GOAL_NEEDED', 'Human', 'goal.md', ['framework/templates/goal.md'],
        'execution-assignment.md filled; goal.md not filled');
    }

    // ── PLAN ──
    if (!this.isFilled('plan.md')) {
      return info('PLAN_NEEDED', 'Planner', 'plan.md',
        ['goal.md', 'execution-assignment.md', 'plan_review.md'],
        'goal.md filled; plan.md not filled');
    }

    // ── BUILD ──
    if (!this.isFilled('build.md')) {
      return info('BUILD_NEEDED', 'Builder', 'build.md',
        ['plan.md', ...(this.exists('handoff.md') ? ['handoff.md'] : []), 'build_review.md', 'execution-assignment.md'],
        'plan.md filled; build.md not filled');
    }

    // ── REVIEW ──
    if (!this.isFilled('review.md')) {
      return info('REVIEW_NEEDED', 'Critic', 'review.md',
        ['build.md', 'plan.md', ...(this.exists('handoff.md') ? ['handoff.md'] : []), 'goal.md', 'review_review.md'],
        'build.md filled; review.md not filled');
    }

    // ── IMPROVE_PLAN_OPTIONAL (v0.2) ──
    if (this.exists('improve-plan.md') && !this.isFilled('improve-plan.md')) {
      return info('IMPROVE_PLAN_OPTIONAL', 'Judge (Human)', 'improve-plan.md',
        ['review.md', ...(this.exists('handoff.md') ? ['handoff.md'] : []), 'build.md', 'improve_review.md'],
        'review.md filled; improve-plan.md exists but not filled');
    }

    // ── IMPROVE (Judge) ──
    if (!this.isFilled('improve.md')) {
      return info('IMPROVE_NEEDED', 'Judge (Human)', 'improve.md',
        ['review.md', ...(this.exists('handoff.md') ? ['handoff.md'] : []), 'build.md', 'improve_review.md'],
        'review.md filled; improve.md not filled');
    }

    // ── VERIFY_OPTIONAL (v0.2) ──
    if (this.exists('verify.md') && !this.isFilled('verify.md') && !this.isFilled('result.md')) {
      return info('VERIFY_OPTIONAL', 'Judge (Human)', 'verify.md',
        ['improve-plan.md', 'build.md', ...(this.exists('handoff.md') ? ['handoff.md'] : [])],
        'improve.md filled; verify.md exists but not filled');
    }

    // ── RESULT ──
    if (!this.isFilled('result.md')) {
      return info('RESULT_NEEDED', 'Human', 'result.md', ['improve.md', 'build.md', 'goal.md'],
        'improve.md filled; result.md not filled');
    }

    // ── TRANSCRIPT ──
    if (!this.isFilled('transcript.md')) {
      return info('TRANSCRIPT_RECOMMENDED', 'Human (optional)', 'transcript.md',
        ['result.md', 'goal.md', 'build.md', 'review.md'],
        'result.md filled; transcript.md not generated');
    }

    // ── COMPLETE ──
    return info('COMPLETE', '(none)', '(none)', [],
      'All required files are filled including transcript.md');
  }

  // ── Canonical 統合（next_cmd 相当・読み取り専用） ──────────────

  /**
   * `apsf next --phase-only` と同じ解決規則でフェーズを返す:
   * - run_state.json あり → canonical。ただし advisory が正当な前進遷移で
   *   phase_status != in_progress なら advisory（python 版が sync forward する値）
   * - run_state.json なし → advisory
   */
  detect(): PhaseInfo {
    const advisory = this.detectAdvisory();
    const state = this.loadRunState();
    if (!state?.current_phase) return advisory;

    const canonical = state.current_phase;
    // python 版: Phase[current_phase] が KeyError（旧世代のフェーズ名等）なら advisory
    if (!PHASES.includes(canonical as ApsfPhase)) {
      return { ...advisory, source: 'canonical' };
    }
    if (canonical === advisory.phase) {
      return { ...advisory, source: 'canonical' };
    }

    const advisoryIsForward = isValidTransition(canonical, advisory.phase);
    const inProgress = String(state.phase_status ?? '').trim().toLowerCase() === 'in_progress';
    if (advisoryIsForward && !inProgress) {
      // python 版はここで run_state.json を advisory へ sync する（本実装は読み取り専用）
      return { ...advisory, source: 'canonical' };
    }

    return {
      ...advisory,
      phase: canonical as ApsfPhase,
      humanOwned: isHumanPhase(canonical),
      source: 'canonical',
      decisionReason: `canonical run_state.json phase (advisory=${advisory.phase})`,
    };
  }
}

/** run ディレクトリの絶対パス解決（runs/ 直下 / fw-improvement / work を探索） */
export function resolveRunDir(apsfRoot: string, runName: string): string | null {
  const candidates = [
    path.join(apsfRoot, 'runs', runName),
    path.join(apsfRoot, 'runs', 'fw-improvement', runName),
    path.join(apsfRoot, 'runs', 'work', runName),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}
