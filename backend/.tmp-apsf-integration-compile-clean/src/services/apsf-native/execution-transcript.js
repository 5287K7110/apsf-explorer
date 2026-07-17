import * as fs from 'fs';
import * as path from 'path';
export const EXECUTIONS_DIR = 'executions';
export const TRANSCRIPT_FILE_RE = /^\d{8}T\d{6}-\d{3}Z-[a-z0-9]{6}\.jsonl$/;
function newTranscriptName() {
    const iso = new Date().toISOString();
    const stamp = iso.replace(/[-:]/g, '').replace(/\./, '-');
    const rand = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
    return `${stamp}-${rand}.jsonl`;
}
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
            filePath = null;
        }
        this.filePath = filePath;
    }
    append(type, data) {
        if (!this.filePath)
            return;
        try {
            fs.appendFileSync(this.filePath, JSON.stringify({ ts: Date.now(), type, data }) + '\n', 'utf-8');
        }
        catch { }
    }
}
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
            const m = name.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})-(\d{3})Z/);
            const startedAt = m
                ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z`
                : new Date(stat.mtimeMs).toISOString();
            metas.push({ file: name, startedAt, sizeBytes: stat.size });
        }
        catch { }
    }
    return metas.sort((a, b) => (a.file < b.file ? 1 : -1));
}
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
        catch { }
    }
    return events;
}
