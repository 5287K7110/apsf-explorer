# APSF Explorer

**A phase-gated, human-in-the-loop GUI for AI problem-solving workflows.**

APSF Explorer is the web frontend + orchestration backend for the
[APSF (AI Problem Solving Framework)](https://github.com/) workflow:

```
Goal → Plan → Build → Review → Improve → Result
```

AI agents (Planner / Builder / Critic) execute the auto-owned phases via real
CLI tools (Claude Code, Codex CLI). **Human-owned phases are structurally
enforced** — the auto-loop always stops at judgment points (`IMPROVE_NEEDED`,
`RESULT_NEEDED`, ...) and hands control back to you. Every phase produces an
auditable Markdown artifact with guarded state transitions.

## Why

Most AI agent tools optimize for full autonomy. APSF Explorer optimizes for
**governed autonomy**:

- 🛑 **Human gates are not optional** — the loop cannot skip your judgment
- 📄 **Every phase is an artifact** — goal.md / plan.md / build.md / review.md
  are reviewable, diffable, and survive the session
- 🔀 **Provider-agnostic** — switch between `claude` and `codex` CLIs; they use
  their own session auth (no API keys to manage)
- 🧭 **Deterministic phase detection** — run state is derived from files +
  `run_state.json` with a validated transition table

## Architecture

```
React 18 + TS (Vite) ── /api, /ws ──► Node/Express + WebSocket
                                          │
                              ExecutionModeRouter
                              ├─ cli-full   claude -p (tools on, artifacts saved)
                              ├─ cli-lite   claude -p (read-only tools, ephemeral)
                              ├─ apsf-run   NativeApsfExecutor ──► APSF framework
                              └─ api        (planned)                 │
                                                       runs/<name>/ *.md + run_state.json
```

The `apsf-run` mode drives a real APSF framework checkout natively in
TypeScript (no PowerShell): prompts are assembled by `apsf act --print-prompt`,
executed by spawning the AI CLI directly, and persisted through
`apsf write-phase --stdin` (canonical overwrite protection + state
transitions). Phase detection is a native TS port verified for parity against
the Python implementation across all real runs (30/30).

## Getting started

Prerequisites: Node 20+, and at least one AI CLI on PATH
([Claude Code](https://claude.com/claude-code) and/or Codex CLI).
For `apsf-run` mode: Python 3.11+ with the APSF framework installed
(`pip install -e <framework>`).

```bash
# 1. Install
npm install
cd backend && npm install && cd ..

# 2. Configure backend
cp backend/.env.example backend/.env    # set APSF_ROOT for apsf-run mode

# 3. Run (two terminals)
cd backend && npm run dev               # backend :3001
npm run dev                             # frontend :5173
```

Open http://localhost:5173 — sign in with any email/password (demo auth),
then use the **APSF Runs** tab to browse runs, check phases, and execute.
Keep **DryRun** checked to preview prompts without spending tokens.

## Testing

All test suites exercise real implementation code — real processes, real
WebSocket events, real browser rendering. No mocks, no stubs.

```bash
cd backend && npx tsx run-integration-tests.ts     # real backend, 26 tests
cd backend && npx tsx run-cli-integration-tests.ts # real CLI detection + invocation
cd backend && npx tsx run-apsf-parity-test.ts      # TS vs Python phase parity
npx tsx scripts/run-frontend-integration-tests.ts  # real WS protocol
npm run test:e2e                                   # Playwright: login → phase badge

# Opt-in (spends tokens): real AI end-to-end
RUN_REAL_CLI=1 npx tsx backend/run-cli-integration-tests.ts
```

## Security notes

- Demo auth accepts any credentials and issues real JWTs — **do not expose
  this to the internet as-is**. Production requires `JWT_SECRET` (the server
  refuses to start without it).
- BUILD phases run the AI CLI with file-write tools enabled
  (`APSF_PERMISSION_MODE`, default `acceptEdits`). Run in a workspace you
  trust the agent to edit.
- API keys in the backend environment are deliberately stripped before
  spawning AI CLIs — session auth is the intended path.

## Status

Working alpha. The full loop (real AI executing BUILD → REVIEW, stopping at
the human judgment gate) is verified end-to-end. See open items in
[BACKLOG.md](BACKLOG.md).

## License

[MIT](LICENSE)
