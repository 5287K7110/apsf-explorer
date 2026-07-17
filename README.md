# APSF Explorer

**A phase-gated, human-in-the-loop GUI for AI problem-solving workflows.**

APSF Explorer implements the APSF (AI Problem Solving Framework) workflow as a
self-contained Node.js application:

```text
Task/Goal -> Plan -> Build -> Review -> Improve -> Result
```

AI agents execute the auto-owned phases through real CLI tools (Claude Code or
Codex CLI). Human-owned phases are structurally enforced: the auto-loop stops at
judgment points such as `IMPROVE_NEEDED` and `RESULT_NEEDED`, then hands control
back to you. Every phase produces an auditable Markdown artifact with guarded
state transitions.

![APSF Explorer - run list, live phase detection, and Judge advisory](docs/images/apsf-runs-panel.png)

## Why

Most AI agent tools optimize for full autonomy. APSF Explorer optimizes for
**governed autonomy**:

- **Human gates are not optional** - the loop cannot skip your judgment.
- **Every phase is an artifact** - `task.md`, `plan.md`, `build.md`,
  `review.md`, `improve.md`, and `result.md` are reviewable, diffable, and
  survive the session.
- **Provider-agnostic execution** - choose `claude` or `codex`; the CLIs use
  their own session auth, so Explorer does not need API keys.
- **Role-specific providers** - keep a default provider, then override Planner,
  Builder, or Critic independently (for example, Builder on `claude` and Critic
  on `codex`).
- **Deterministic phase detection** - run state is derived from files plus
  `run_state.json` with validated transitions.

### Does the quality gate actually work? A true story

During v0.2.0 verification we ran a full cycle entirely on `codex`. The task
asked for a file with a specific Japanese heading. The Builder wrote it, but
with an English heading, and it also touched a file outside the declared scope.
The Critic, using the same CLI family but an independent read-only context,
reviewed the build against the goal and flagged both deviations as Critical.

The loop then stopped at `IMPROVE_NEEDED` and handed the final call to the human
Judge. No prompt trickery, no second model requirement - just role separation
with independent context. The same model family that made the mistake caught the
mistake, and the framework made sure a human decided what to do about it.

## Architecture

```text
React 18 + TS (Vite) -- /api, /ws --> Node/Express + WebSocket
                                      |
                                      v
                              ExecutionModeRouter
                              |-- cli-full   legacy/demo CLI executor
                              |-- cli-lite   legacy/demo read-only executor
                              |-- apsf-run   NativeApsfExecutor (TypeScript)
                              `-- api        planned
                                      |
                                      v
                  <APSF_ROOT>/runs/<run>/ *.md + run_state.json
```

The `apsf-run` mode is the production path. It is a complete TypeScript
implementation of the APSF workflow engine under
`backend/src/services/apsf-native/`: run creation from templates, file-heuristic
and canonical phase detection, prompt assembly with specialist selection,
guarded phase persistence, judge advisory extraction, crash recovery markers,
execution transcripts, and the human-gated auto-loop.

Specialist definitions and run templates ship in `backend/content/`. If you
have an existing APSF workspace, point `APSF_ROOT` at it. Otherwise any
directory containing an empty `runs/` folder is enough.

> Writes to `runs/` should go through Explorer only. Mixing writes from another
> APSF CLI against the same workspace can cause state drift.

## Getting started

Prerequisites: Node 20+, and at least one AI CLI on PATH
([Claude Code](https://claude.com/claude-code) and/or Codex CLI). Python is not
required for normal use.

```bash
# 1. Install dependencies
npm install
cd backend && npm install && cd ..

# 2. Configure the backend
cp backend/.env.example backend/.env
mkdir -p ~/apsf-workspace/runs
# set APSF_ROOT=~/apsf-workspace in backend/.env

# 3. Run the single-process app
npm run app
```

Open http://localhost:3001 and sign in with any email/password when
`AUTH_MODE=demo` (the default).

For frontend development with Vite hot reload, use two terminals instead:

```bash
cd backend && npm run dev   # backend :3001
npm run dev                 # frontend :5173
```

## Using APSF Runs

From the **APSF Runs** tab you can:

- **Create a run** with an optional target workdir. If a workdir is set, AI
  phase CLIs run from that project directory; otherwise they run from
  `APSF_ROOT`.
- **Write human phases in the browser**. `task.md`, `improve.md`, and
  `result.md` are saved through the same guarded phase writer used by the
  backend.
- **Execute AI phases**: `plan`, `build`, `review`, or `full-cycle`. DryRun is
  available to preview assembled prompts without invoking an AI CLI.
- **Override providers by role**. Planner, Builder, and Critic may each use
  `claude` or `codex`; unset roles fall back to the main provider selector.
- **Review git changes in the target workdir**. BUILD logs a dirty-worktree
  warning before execution and a diff summary afterward. The Workdir Diff panel
  shows live `git diff HEAD`, diff stat, branch, and untracked files when the
  workdir is a git repository.
- **Use Judge decisions**. `Accept`, `Return to Build`, and `Return to Plan`
  are applied through the backend judge route. Return decisions require a
  reason and record review files for the rerun path.
- **Quick-complete accepted runs**. When Accept quick-complete is enabled, the
  UI records the Accept decision, then writes `improve.md` and `result.md`
  automatically through normal phase transitions.
- **Resume after interrupted BUILD output**. If a CLI exits non-zero or times
  out with partial output, Explorer saves `salvage-<PHASE>-*.md`; the next BUILD
  prompt includes the latest salvaged attempt for recovery.
- **Split large tasks**. The split panel asks the selected provider, in
  read-only mode, to propose smaller `task.md` bodies. You choose which proposals
  to accept, and Explorer creates the selected sub-runs in bulk under
  `runs/work/`, inheriting the parent workdir.

Executions are serialized through an in-memory FIFO queue. The current run and
queued runs are visible in the UI, and queued work can be cancelled.

## Configuration

Key backend environment variables:

- `APSF_ROOT` - workspace directory containing `runs/`.
- `EXECUTION_MODE` - defaults to `cli-full`; the APSF Runs UI sends
  `mode: apsf-run` explicitly.
- `APSF_EXEC_TIMEOUT_MS` - AI CLI timeout in milliseconds. Default:
  `900000` (15 minutes).
- `APSF_PERMISSION_MODE` - permission mode passed to Claude for BUILD phases.
  Default: `acceptEdits`.
- `AUTH_MODE` - `demo` accepts any credentials; `basic` checks a `USERS_FILE`.
- `JWT_SECRET` - required when `NODE_ENV=production`.

API keys are deliberately stripped before spawning AI CLIs. Use the CLIs'
normal session authentication.

## Testing

All listed test runners exercise real implementation code: real processes,
WebSocket events, filesystem artifacts, and browser rendering where applicable.

```bash
cd backend && npx tsx run-integration-tests.ts     # real backend, 62 declared tests
cd backend && npx tsx run-cli-integration-tests.ts # real CLI detection + invocation
cd backend && npx tsx run-apsf-standalone-test.ts  # empty workspace, no Python on PATH
cd backend && npx tsx run-apsf-snapshot-test.ts    # TS-as-truth snapshot, 48 checks
cd backend && npx tsx run-apsf-parity-test.ts      # optional historical TS vs Python parity
npx tsx scripts/run-frontend-integration-tests.ts  # real WS protocol
npm run test:e2e                                   # login -> create -> write

# Opt-in: spends real CLI/model time
RUN_REAL_CLI=1 npx tsx backend/run-cli-integration-tests.ts
```

The TypeScript implementation is the source of truth. The snapshot runner
validates the frozen behavior without requiring Python; the parity runner is
kept for optional cross-checking against the historical Python implementation.

## Security notes

- `AUTH_MODE=demo` accepts any credentials and issues real JWTs. Do not expose
  demo mode to the internet.
- `AUTH_MODE=basic` checks credentials against `USERS_FILE`; self-registration
  is disabled.
- Production refuses to start without `JWT_SECRET`.
- BUILD phases run an AI CLI with file-write capability in the target workdir.
  Use a workspace you trust the agent to edit.
- Git integration is advisory only. Dirty warnings and diffs help the human
  Judge distinguish agent changes from pre-existing local changes; they do not
  block execution.

## Status

Working alpha. The APSF Runs path supports run creation, browser-authored human
phases, real AI phase execution, full-cycle execution to human gates, judge
decisions, crash recovery markers, execution transcripts, workdir-aware BUILD
execution, git diff inspection, quick-complete, and AI-assisted task splitting.

## License

[MIT](LICENSE)
