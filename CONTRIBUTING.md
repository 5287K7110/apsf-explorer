# Contributing to APSF Explorer

Thanks for your interest! This project is a working alpha — issues, ideas, and
PRs are all welcome.

## Ground rules

1. **Tests must exercise real code.** This repo has a hard-earned policy: no
   mock servers, no stub assertions (`Promise.resolve(true)`), no fake
   detection. Integration tests spawn the real backend, real processes, and a
   real browser. If your test passes without touching the implementation, it
   will be rejected.
2. **Human gates are sacred.** Anything that lets the auto-loop skip a
   human-owned phase (`IMPROVE_NEEDED`, `RESULT_NEEDED`, ...) is a bug, not a
   feature.
3. **State mutations go through the framework.** Run state changes must use
   `apsf write-phase` / `apsf start-run` (overwrite protection, transition
   validation, event logs) — do not write phase files or `run_state.json`
   directly from Explorer code.

## Development setup

See [README.md](README.md#getting-started). In short: `npm install` at root
and in `backend/`, copy `backend/.env.example` to `backend/.env`, run both dev
servers.

## Before opening a PR

```bash
cd backend && npx tsx run-apsf-snapshot-test.ts     # must be all PASS (no python needed)
cd backend && npx tsx run-integration-tests.ts     # must be all PASS
cd backend && npx tsx run-cli-integration-tests.ts
npx tsx scripts/run-frontend-integration-tests.ts
npm run test:e2e
# Optional: historical cross-verification against Python (requires apsf CLI on PATH)
# cd backend && npx tsx run-apsf-parity-test.ts
```

CI runs the same suites on Linux — cross-platform breakage (path separators,
shell assumptions) is the most common failure mode.

## Reporting issues

Please include: OS, Node version, which AI CLIs are on PATH
(`claude --version` / `codex --version`), and whether `APSF_ROOT` is set.
