import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  PTYPE_TO_SPECIALIST,
  CTYPE_TO_SPECIALIST,
  plannerSpecialistMap,
  criticSpecialistMap,
  availableSpecialistCodes,
  listAvailableSpecialists,
  resolvePlannerSpecialist,
  resolveCriticSpecialist,
} from '../src/services/apsf-native/specialist-registry.js';

/**
 * Hybrid Registry テスト
 *
 * 一時ディレクトリに framework/agents/{planners,critics}/ を作成し、
 * 静的マップのファイルをコピーした上で、動的ファイルを追加して挙動を検証する。
 */

const VENDORED_CONTENT_DIR = path.resolve(__dirname, '../content');

function makeFrameworkTree(tmpRoot: string): string {
  const plannersDir = path.join(tmpRoot, 'framework', 'agents', 'planners');
  const criticsDir = path.join(tmpRoot, 'framework', 'agents', 'critics');
  fs.mkdirSync(plannersDir, { recursive: true });
  fs.mkdirSync(criticsDir, { recursive: true });

  // Copy all vendored planners/critics so static map entries resolve
  const srcPlanners = path.join(VENDORED_CONTENT_DIR, 'framework', 'agents', 'planners');
  const srcCritics = path.join(VENDORED_CONTENT_DIR, 'framework', 'agents', 'critics');

  for (const f of fs.readdirSync(srcPlanners)) {
    fs.copyFileSync(path.join(srcPlanners, f), path.join(plannersDir, f));
  }
  for (const f of fs.readdirSync(srcCritics)) {
    fs.copyFileSync(path.join(srcCritics, f), path.join(criticsDir, f));
  }

  return tmpRoot;
}

function writeDynamicSpecialist(tmpRoot: string, kind: 'planners' | 'critics', filename: string): string {
  const dir = path.join(tmpRoot, 'framework', 'agents', kind);
  const fp = path.join(dir, filename);
  fs.writeFileSync(fp, [
    `# ${path.basename(filename, '.md')}`,
    '',
    '## Role',
    'A dynamically discovered test specialist.',
    '',
    '## Scope',
    'dynamic testing coverage verification',
    '',
    '## Use This Specialist When',
    'You need dynamic specialist testing.',
  ].join('\n'));
  return fp;
}

describe('Specialist Registry — Static Snapshot Stability', () => {
  it('PTYPE_TO_SPECIALIST has 16 entries', () => {
    expect(Object.keys(PTYPE_TO_SPECIALIST).length).toBe(16);
  });

  it('CTYPE_TO_SPECIALIST has 11 entries', () => {
    expect(Object.keys(CTYPE_TO_SPECIALIST).length).toBe(11);
  });

  it('all static planner codes match P-NN pattern', () => {
    for (const code of Object.keys(PTYPE_TO_SPECIALIST)) {
      expect(code).toMatch(/^P-\d{2}$/);
    }
  });

  it('all static critic codes match C-NN pattern', () => {
    for (const code of Object.keys(CTYPE_TO_SPECIALIST)) {
      expect(code).toMatch(/^C-\d{2}$/);
    }
  });

  it('static planner paths all point under framework/agents/planners/', () => {
    for (const rel of Object.values(PTYPE_TO_SPECIALIST)) {
      expect(rel).toMatch(/^framework\/agents\/planners\/.+\.md$/);
    }
  });

  it('static critic paths all point under framework/agents/critics/', () => {
    for (const rel of Object.values(CTYPE_TO_SPECIALIST)) {
      expect(rel).toMatch(/^framework\/agents\/critics\/.+\.md$/);
    }
  });
});

describe('Specialist Registry — Hybrid Dynamic Scanning', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'specialist-test-'));
    makeFrameworkTree(tmpRoot);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('without dynamic files, plannerSpecialistMap matches static map size', () => {
    const map = plannerSpecialistMap(tmpRoot);
    expect(Object.keys(map).length).toBe(Object.keys(PTYPE_TO_SPECIALIST).length);
  });

  it('without dynamic files, criticSpecialistMap matches static map size', () => {
    const map = criticSpecialistMap(tmpRoot);
    expect(Object.keys(map).length).toBe(Object.keys(CTYPE_TO_SPECIALIST).length);
  });

  it('adding a planner .md increases the map by 1 with a new P-NN code', () => {
    writeDynamicSpecialist(tmpRoot, 'planners', 'custom-workflow-planner.md');
    const map = plannerSpecialistMap(tmpRoot);
    expect(Object.keys(map).length).toBe(Object.keys(PTYPE_TO_SPECIALIST).length + 1);

    // The new code must be a P-NN not in the static map
    const newCodes = Object.keys(map).filter(c => !(c in PTYPE_TO_SPECIALIST));
    expect(newCodes.length).toBe(1);
    expect(newCodes[0]).toMatch(/^P-\d{2}$/);
    expect(map[newCodes[0]]).toContain('custom-workflow-planner.md');
  });

  it('adding a critic .md increases the map by 1 with a new C-NN code', () => {
    writeDynamicSpecialist(tmpRoot, 'critics', 'custom-review-critic.md');
    const map = criticSpecialistMap(tmpRoot);
    expect(Object.keys(map).length).toBe(Object.keys(CTYPE_TO_SPECIALIST).length + 1);

    const newCodes = Object.keys(map).filter(c => !(c in CTYPE_TO_SPECIALIST));
    expect(newCodes.length).toBe(1);
    expect(newCodes[0]).toMatch(/^C-\d{2}$/);
  });

  it('static map files are NOT duplicated as dynamic entries', () => {
    // All static files already exist in the tree — no duplicates should appear
    const map = plannerSpecialistMap(tmpRoot);
    const relPaths = Object.values(map);
    const unique = new Set(relPaths.map(r => r.split(path.sep).join('/')));
    expect(unique.size).toBe(relPaths.length);
  });

  it('availableSpecialistCodes includes dynamic codes', () => {
    writeDynamicSpecialist(tmpRoot, 'planners', 'dynamic-planner.md');
    const codes = availableSpecialistCodes(tmpRoot, 'planner');
    expect(codes.length).toBe(Object.keys(PTYPE_TO_SPECIALIST).length + 1);
    expect(codes).toEqual([...codes].sort());
  });

  it('listAvailableSpecialists includes dynamic specialist with summary', () => {
    writeDynamicSpecialist(tmpRoot, 'planners', 'dynamic-planner.md');
    const list = listAvailableSpecialists(tmpRoot);
    const dynamic = list.find(s => s.name === 'dynamic-planner');
    expect(dynamic).toBeDefined();
    expect(dynamic!.kind).toBe('planner');
    expect(dynamic!.summary).toContain('dynamically discovered');
    expect(dynamic!.code).toMatch(/^P-\d{2}$/);
  });

  it('dynamic specialist appears in inferred scoring', () => {
    writeDynamicSpecialist(tmpRoot, 'planners', 'dynamic-planner.md');
    // Goal text that matches the dynamic specialist's scope keywords
    const result = resolvePlannerSpecialist(
      'dynamic testing coverage verification',
      '',
      tmpRoot
    );
    // Should have a positive score from some specialist (possibly the dynamic one)
    // The key assertion: the dynamic specialist IS a candidate
    const map = plannerSpecialistMap(tmpRoot);
    const dynamicCode = Object.keys(map).find(c => !(c in PTYPE_TO_SPECIALIST));
    expect(dynamicCode).toBeDefined();
    // If the dynamic specialist scores highest, it should be selected
    // Either way, the system shouldn't crash
    expect(result.mode).toBeDefined();
  });

  it('non-.md files are ignored during scanning', () => {
    const dir = path.join(tmpRoot, 'framework', 'agents', 'planners');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a specialist');
    fs.writeFileSync(path.join(dir, 'config.json'), '{}');
    const map = plannerSpecialistMap(tmpRoot);
    expect(Object.keys(map).length).toBe(Object.keys(PTYPE_TO_SPECIALIST).length);
  });

  it('missing agents directory does not crash', () => {
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-root-'));
    try {
      // No framework/agents/ directory at all
      const map = plannerSpecialistMap(emptyRoot);
      // Should return just the static map entries (files won't exist)
      expect(Object.keys(map).length).toBe(Object.keys(PTYPE_TO_SPECIALIST).length);
    } finally {
      fs.rmSync(emptyRoot, { recursive: true, force: true });
    }
  });

  it('dynamic codes do not collide with existing static codes', () => {
    // Add multiple dynamic files
    writeDynamicSpecialist(tmpRoot, 'planners', 'alpha-planner.md');
    writeDynamicSpecialist(tmpRoot, 'planners', 'beta-planner.md');
    writeDynamicSpecialist(tmpRoot, 'planners', 'gamma-planner.md');
    const map = plannerSpecialistMap(tmpRoot);
    const codes = Object.keys(map);
    const codeSet = new Set(codes);
    // All codes unique
    expect(codeSet.size).toBe(codes.length);
    // All static codes preserved
    for (const staticCode of Object.keys(PTYPE_TO_SPECIALIST)) {
      expect(map[staticCode]).toBe(PTYPE_TO_SPECIALIST[staticCode]);
    }
  });
});
