/**
 * 実行トランスクリプト — AI 実行ストリームの run ごとの永続化
 *
 * WS ライブログは揮発性（リロードで消える）。実行ごとに
 * runs/<run>/executions/<timestamp>.jsonl へイベントを追記し、
 * 過去実行の出力を UI から再閲覧できるようにする。
 *
 * - 書き込みは best-effort: トランスクリプトの失敗は実行を止めない
 * - ファイル名は timestamp + rand で衝突回避し、読み出しは
 *   executions/ 配下の厳格なホワイトリスト形式のみ許可
 */
import * as fs from 'fs';
import * as path from 'path';
export const EXECUTIONS_DIR = 'executions';
/** 許可するトランスクリプトファイル名（読み出し時のパストラバーサル防止） */
export const TRANSCRIPT_FILE_RE = /^\d{8}T\d{6}-\d{3}Z-[a-z0-9]{6}\.jsonl$/;
/** 新しいトランスクリプトのファイル名（20260708T123456-789Z-ab12cd.jsonl） */
function newTranscriptName() {
    const iso = new Date().toISOString(); // 2026-07-08T12:34:56.789Z
    const stamp = iso.replace(/[-:]/g, '').replace(/\./, '-');
    const rand = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
    return `${stamp}-${rand}.jsonl`;
}
/**
 * 1 実行ぶんのトランスクリプト書き込み器。
 * 生成時にファイルを作成し、append で 1 イベント = 1 行の JSONL を追記する。
 * すべて best-effort（失敗しても throw しない）。
 */
export class TranscriptWriter {
    constructor(runDir, initial = {}) {
        let filePath = null;
        try {
            const dir = path.join(runDir, EXECUTIONS_DIR);
            fs.mkdirSync(dir, { recursive: true });
            filePath = path.join(dir, newTranscriptName());
            fs.writeFileSync(filePath, JSON.stringify({ ts: Date.now(), type: 'start', data: initial }) + '\n', 'utf-8');
        }
        catch {
            filePath = null; // 記録できなくても実行は続行する
        }
        this.filePath = filePath;
    }
    append(type, data) {
        if (!this.filePath)
            return;
        try {
            fs.appendFileSync(this.filePath, JSON.stringify({ ts: Date.now(), type, data }) + '\n', 'utf-8');
        }
        catch { /* best-effort */ }
    }
}
/** run の実行トランスクリプト一覧（新しい順） */
export function listTranscripts(runDir) {
    const dir = path.join(runDir, EXECUTIONS_DIR);
    if (!fs.existsSync(dir))
        return [];
    const metas = [];
    for (const name of fs.readdirSync(dir)) {
        if (!TRANSCRIPT_FILE_RE.test(name))
            continue;
        try {
            const stat = fs.statSync(path.join(dir, name));
            // 20260708T123456-789Z-xxxxxx.jsonl → 2026-07-08T12:34:56.789Z
            const m = name.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})-(\d{3})Z/);
            const startedAt = m
                ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z`
                : new Date(stat.mtimeMs).toISOString();
            metas.push({ file: name, startedAt, sizeBytes: stat.size });
        }
        catch { /* skip unreadable entries */ }
    }
    return metas.sort((a, b) => (a.file < b.file ? 1 : -1));
}
/**
 * トランスクリプトの読み出し（パースできた行のみ返す）。
 * ファイル名はホワイトリスト形式のみ許可。存在しなければ null。
 */
export function readTranscript(runDir, filename) {
    if (!TRANSCRIPT_FILE_RE.test(filename)) {
        throw new Error(`Not a transcript file: ${filename}`);
    }
    const p = path.join(runDir, EXECUTIONS_DIR, filename);
    if (!fs.existsSync(p))
        return null;
    const events = [];
    for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
        if (!line.trim())
            continue;
        try {
            events.push(JSON.parse(line));
        }
        catch { /* 壊れた行はスキップ */ }
    }
    return events;
}
