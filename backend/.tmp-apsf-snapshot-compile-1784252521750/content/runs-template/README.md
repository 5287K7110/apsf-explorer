# Run Template

## Create A Run

Heavy run:

```bash
apsf init-run YYYY-MM-DD_case-key_topic
apsf start-run case-key_topic
```

Light run:

```bash
apsf init-run YYYY-MM-DD_case-key_topic --light
apsf start-run case-key_topic --light
```

Manual heavy-run copy is still possible when needed:

```bash
cp -r runs/_template runs/YYYY-MM-DD_case-key_topic
```

When copying manually, rename `run_state.seed.json` to `run_state.json`,
fill in `run_id` (must equal the directory name) and `phase_entered_at`,
and delete the `_*_note` helper keys.

The seed is deliberately NOT named `run_state.json`: the state initializer
keeps any pre-existing `run_state.json` untouched, so a live-named seed would
poison CLI-created runs with placeholder values. As of 2026-07-02 (run
2026-07-02-003), `apsf init-run` additionally excludes `*.seed.json` from the
copy entirely — CLI-created runs never contain the seed. If you need the seed
in a CLI-created run, copy it manually after `init-run`.
Canonical schema: `src/apsf/core/state/run_state.py`.
Sync policy for this directory: `framework/SYNC_GOVERNANCE.md`.

## Expected Artifacts

Standard heavy-run artifacts in this template:

- `execution-assignment.md`
- `goal.md`
- `plan.md`
- `build.md`
- `review.md`
- `improve.md`
- `result.md`

Optional artifacts are created only when needed, not during fresh run creation:

- `model-assignment.md`
- `handoff.md`
- `plan_review.md`
- `build_review.md`
- `review_review.md`
- `improve_review.md`
- `improve-plan.md`
- `verify.md`
- `transcript.md`

## Notes

- Use `apsf build <run>` or `scripts/apsf-claude-build.ps1 <run>` for `BUILD_NEEDED`.
- Use `apsf act <run>` or `scripts/apsf-claude-act.ps1 <run>` for non-build phases.
- Light runs are task-centered and use `task.md` plus canonical `run_state.json`.
- For light runs, write `task.md` first, then run `apsf next <run>` or `apsf act <run>`.
- The light-run reference template lives at `framework/templates/run_light_template.md`.
