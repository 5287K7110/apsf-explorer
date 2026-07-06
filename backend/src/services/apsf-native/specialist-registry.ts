/**
 * Specialist 選択（specialist_registry.py の TS ネイティブ移植）
 *
 * 参照仕様: ai-problem-solving-framework
 *   src/apsf/legacy/cli/specialist_registry.py
 *
 * goal.md / execution-assignment.md の内容から Planner/Critic specialist
 * （framework/agents/*.md）を explicit 指定 or キーワード採点で選択する。
 */
import * as fs from 'fs';
import * as path from 'path';

const SPECIALIST_CODE_RE = /\b([A-Z]-\d{2})\b/i;
const HEADING_RE = /^##\s+(.+?)\s*$/gm;
const WORD_RE = /[A-Za-z0-9_-]{3,}/g;

const STOPWORDS = new Set([
  'and', 'the', 'for', 'with', 'that', 'this', 'from', 'into', 'when', 'where',
  'what', 'should', 'would', 'while', 'only', 'just', 'than', 'then', 'them',
  'they', 'their', 'there', 'here', 'have', 'has', 'had', 'are', 'was', 'were',
  'not', 'without', 'because', 'rather', 'being', 'does', 'doesnt', 'dont',
  'over', 'under', 'between', 'before', 'after', 'about', 'mainly', 'main',
  'task', 'work', 'plan', 'planner', 'review', 'critic', 'specialist',
]);

const C10_FRONTEND_REFACTOR_SIGNALS = [
  'frontend refactor', 'structural refactor', 'refactor only', 'app.tsx',
  'component split', 'component extraction', 'hook extraction', 'props api',
  'state ownership', 'logic move', 'no ui change', 'no ux change',
  'behavior remains unchanged', 'behaviour remains unchanged',
  'ui remains unchanged', 'without changing behavior', 'without changing ui',
  'without ui change',
];

const C05_BILINGUAL_SIGNALS = [
  'bilingual', 'multilingual', 'localization', 'localisation',
  'language switching', 'language switch', 'japanese', 'english',
  'translation', 'locale', 'i18n', 'l10n',
];

export const PTYPE_TO_SPECIALIST: Record<string, string> = {
  'P-01': 'framework/agents/planners/feature-planner.md',
  'P-02': 'framework/agents/planners/bugfix-planner.md',
  'P-03': 'framework/agents/planners/refactor-planner.md',
  'P-04': 'framework/agents/planners/migration-planner.md',
  'P-05': 'framework/agents/planners/docs-planner.md',
  'P-06': 'framework/agents/planners/design-planner.md',
  'P-07': 'framework/agents/planners/retro-planner.md',
  'P-08': 'framework/agents/planners/research-planner.md',
  'P-09': 'framework/agents/planners/integration-planner.md',
  'P-10': 'framework/agents/planners/performance-planner.md',
  'P-11': 'framework/agents/planners/test-strategy-planner.md',
  'P-12': 'framework/agents/planners/dependency-upgrade-planner.md',
  'P-13': 'framework/agents/planners/reconstruction-planner.md',
  'P-19': 'framework/agents/planners/verification-planning-planner-1775385814.md',
  'P-20': 'framework/agents/planners/data-contract-planner.md',
  'P-21': 'framework/agents/planners/auto-judge-loop-planner.md',
};

export const CTYPE_TO_SPECIALIST: Record<string, string> = {
  'C-01': 'framework/agents/critics/ux-flow-critic.md',
  'C-02': 'framework/agents/critics/copy-clarity-critic.md',
  'C-03': 'framework/agents/critics/landing-page-critic.md',
  'C-04': 'framework/agents/critics/empty-state-and-error-ux.md',
  'C-05': 'framework/agents/critics/bilingual-ui.md',
  'C-06': 'framework/agents/critics/information-architecture.md',
  'C-07': 'framework/agents/critics/product-positioning-critic.md',
  'C-08': 'framework/agents/critics/puzzle-difficulty-critic.md',
  'C-09': 'framework/agents/critics/data-contract-critic.md',
  'C-10': 'framework/agents/critics/frontend-refactor-critic.md',
  'C-99': 'framework/agents/critics/verification-reliability-critic.md',
};

export interface SpecialistSelection {
  ptype: string;
  specialistPath: string | null;
  specialistContent: string;
  mode: 'explicit' | 'inferred' | 'unresolved';
  reason: string;
  score: number;
}

function normalizeSpecialistCode(raw: string): string {
  const m = (raw || '').match(SPECIALIST_CODE_RE);
  return m ? m[1].toUpperCase() : '';
}

const CONFIRMED_SECTION_HEADER = '## Confirmed Specialist';

/** ## Confirmed Specialist セクション優先で P-TYPE/C-TYPE コードを抽出 */
export function extractPrimarySpecialistCode(text: string, prefix: string): string {
  const marker = `${prefix}-TYPE`;
  const lines = (text || '').split(/\r?\n/);

  let inConfirmed = false;
  for (const line of lines) {
    if (line.trim() === CONFIRMED_SECTION_HEADER) {
      inConfirmed = true;
      continue;
    }
    if (inConfirmed && line.startsWith('## ')) break;
    if (inConfirmed && line.toUpperCase().includes(marker)) {
      const normalized = normalizeSpecialistCode(line);
      if (normalized.startsWith(`${prefix}-`)) return normalized;
    }
  }

  for (const line of lines) {
    if (!line.toUpperCase().includes(marker)) continue;
    const normalized = normalizeSpecialistCode(line);
    if (normalized.startsWith(`${prefix}-`)) return normalized;
  }
  return '';
}

function hasExplicitGenericSpecialist(text: string, prefix: string): boolean {
  const marker = `${prefix}-TYPE`;
  for (const line of (text || '').split(/\r?\n/)) {
    const upper = line.toUpperCase();
    if (!upper.includes(marker)) continue;
    if (upper.includes('NONE') || upper.includes('GENERIC')) return true;
  }
  return false;
}

/** ## 見出し単位のセクション抽出 */
export function extractSection(markdown: string, sectionName: string): string {
  const text = markdown || '';
  const matches = [...text.matchAll(HEADING_RE)];
  if (!matches.length) return '';
  const target = sectionName.trim().toLowerCase();
  for (let i = 0; i < matches.length; i++) {
    if (matches[i][1].trim().toLowerCase() !== target) continue;
    const start = matches[i].index! + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    return text.slice(start, end).trim();
  }
  return '';
}

function extractFirstMatchingSection(markdown: string, names: string[]): string {
  for (const name of names) {
    const content = extractSection(markdown, name);
    if (content) return content;
  }
  return '';
}

function selectionSections(markdown: string): Record<string, string> {
  return {
    scope: extractSection(markdown, 'Scope'),
    out_of_scope: extractSection(markdown, 'Out of Scope'),
    evaluation_criteria: extractSection(markdown, 'Evaluation Criteria'),
    use_this_specialist_when: extractFirstMatchingSection(markdown, [
      'Use This Specialist When', 'Use This Planner When', 'Use This Critic When',
    ]),
    do_not_use_this_specialist_when: extractFirstMatchingSection(markdown, [
      'Do Not Use This Specialist When', 'Do Not Use This Planner When', 'Do Not Use This Critic When',
    ]),
    nearby_specialist_distinctions: extractFirstMatchingSection(markdown, [
      'Nearby Specialist Distinctions', 'Nearby Planner Distinctions', 'Nearby Critic Distinctions',
    ]),
  };
}

function keywords(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of (text || '').matchAll(WORD_RE)) {
    const word = m[0].toLowerCase();
    if (!STOPWORDS.has(word)) out.add(word);
  }
  return out;
}

function intersect(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((w) => b.has(w)).sort();
}

function scoreGoalAgainstSections(
  goalText: string,
  sections: Record<string, string>
): { score: number; reasons: string[] } {
  const goalWords = keywords(goalText);
  if (!goalWords.size) return { score: 0, reasons: [] };

  const scopeHits = intersect(goalWords, keywords(sections.scope));
  const evalHits = intersect(goalWords, keywords(sections.evaluation_criteria));
  const outHits = intersect(goalWords, keywords(sections.out_of_scope));
  const useHits = intersect(goalWords, keywords(sections.use_this_specialist_when));
  const avoidHits = intersect(goalWords, keywords(sections.do_not_use_this_specialist_when));
  const nearbyHits = intersect(goalWords, keywords(sections.nearby_specialist_distinctions));

  const score =
    scopeHits.length * 3 +
    evalHits.length * 2 +
    useHits.length * 3 +
    nearbyHits.length -
    outHits.length * 3 -
    avoidHits.length * 3;

  const reasons: string[] = [];
  if (scopeHits.length) reasons.push(`scope hits: ${scopeHits.slice(0, 4).join(', ')}`);
  if (evalHits.length) reasons.push(`evaluation hits: ${evalHits.slice(0, 4).join(', ')}`);
  if (useHits.length) reasons.push(`use hits: ${useHits.slice(0, 4).join(', ')}`);
  if (nearbyHits.length) reasons.push(`nearby hits: ${nearbyHits.slice(0, 4).join(', ')}`);
  if (outHits.length) reasons.push(`out-of-scope hits: ${outHits.slice(0, 4).join(', ')}`);
  if (avoidHits.length) reasons.push(`avoid hits: ${avoidHits.slice(0, 4).join(', ')}`);
  return { score, reasons };
}

function countPhraseHits(text: string, phrases: string[]): string[] {
  const lowered = (text || '').toLowerCase();
  return phrases.filter((p) => lowered.includes(p));
}

function criticHeuristicAdjustment(
  code: string,
  goalText: string
): { score: number; reasons: string[] } {
  const lowered = (goalText || '').toLowerCase();
  const refactorHits = countPhraseHits(lowered, C10_FRONTEND_REFACTOR_SIGNALS);
  const bilingualHits = countPhraseHits(lowered, C05_BILINGUAL_SIGNALS);

  if (code === 'C-10') {
    let bonus = 0;
    if (refactorHits.length) bonus += Math.min(refactorHits.length, 4) * 4;
    if (
      ['split', 'extract', 'decompose', 'refactor'].some((t) => lowered.includes(t)) &&
      lowered.includes('ui change')
    ) {
      bonus += 2;
    }
    const reasons = refactorHits.length
      ? [`frontend-refactor hits: ${refactorHits.slice(0, 4).join(', ')}`]
      : [];
    return { score: bonus, reasons };
  }

  if (code === 'C-05' && refactorHits.length && !bilingualHits.length) {
    const penalty = Math.min(refactorHits.length, 3) * 4;
    return {
      score: -penalty,
      reasons: [`bilingual dampened by refactor-only context: ${refactorHits.slice(0, 3).join(', ')}`],
    };
  }

  return { score: 0, reasons: [] };
}

function scoreSpecialist(
  goalText: string,
  sections: Record<string, string>,
  code: string
): { score: number; reasons: string[] } {
  const base = scoreGoalAgainstSections(goalText, sections);
  const normalized = normalizeSpecialistCode(code);
  if (normalized.startsWith('C-')) {
    const heuristic = criticHeuristicAdjustment(normalized, goalText);
    return { score: base.score + heuristic.score, reasons: [...base.reasons, ...heuristic.reasons] };
  }
  return base;
}

function loadSpecialistContent(
  code: string,
  frameworkRoot: string,
  mapping: Record<string, string>
): { path: string | null; content: string } {
  const rel = mapping[normalizeSpecialistCode(code)];
  if (!rel) return { path: null, content: '' };
  const p = path.join(frameworkRoot, rel);
  if (!fs.existsSync(p)) return { path: p, content: '' };
  return { path: p, content: fs.readFileSync(p, 'utf-8').trim() };
}

function resolveSpecialist(
  goalText: string,
  assignmentText: string,
  frameworkRoot: string,
  prefix: string,
  mapping: Record<string, string>,
  explicitLabel: string
): SpecialistSelection {
  const explicitCode = extractPrimarySpecialistCode(assignmentText, prefix);
  if (explicitCode) {
    const { path: p, content } = loadSpecialistContent(explicitCode, frameworkRoot, mapping);
    const { score, reasons } = scoreSpecialist(goalText, selectionSections(content), explicitCode);
    let reason = explicitLabel;
    if (reasons.length) reason += `; ${reasons.join('; ')}`;
    return { ptype: explicitCode, specialistPath: p, specialistContent: content, mode: 'explicit', reason, score };
  }

  if (hasExplicitGenericSpecialist(assignmentText, prefix)) {
    return {
      ptype: '', specialistPath: null, specialistContent: '', mode: 'explicit',
      reason: `${explicitLabel}: none (use generic Critic/Planner)`, score: 0,
    };
  }

  let best: SpecialistSelection | null = null;
  for (const code of Object.keys(mapping).sort()) {
    const { path: p, content } = loadSpecialistContent(code, frameworkRoot, mapping);
    if (!content) continue;
    const { score, reasons } = scoreSpecialist(goalText, selectionSections(content), code);
    let reason = 'inferred from specialist markdown';
    if (reasons.length) reason += `; ${reasons.join('; ')}`;
    const candidate: SpecialistSelection = {
      ptype: code, specialistPath: p, specialistContent: content, mode: 'inferred', reason, score,
    };
    if (best === null || candidate.score > best.score) best = candidate;
  }

  if (best !== null && best.score > 0) return best;

  return {
    ptype: '', specialistPath: null, specialistContent: '', mode: 'unresolved',
    reason: `no explicit ${prefix}-TYPE and no specialist markdown produced a positive match`, score: 0,
  };
}

export function resolvePlannerSpecialist(
  goalText: string,
  assignmentText: string,
  frameworkRoot: string
): SpecialistSelection {
  return resolveSpecialist(goalText, assignmentText, frameworkRoot, 'P', PTYPE_TO_SPECIALIST, 'explicit Primary P-TYPE');
}

export function resolveCriticSpecialist(
  goalText: string,
  assignmentText: string,
  frameworkRoot: string
): SpecialistSelection {
  return resolveSpecialist(goalText, assignmentText, frameworkRoot, 'C', CTYPE_TO_SPECIALIST, 'explicit Primary C-TYPE');
}
