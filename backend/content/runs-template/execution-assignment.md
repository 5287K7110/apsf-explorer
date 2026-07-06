# Execution Assignment

---

## Run Name

## Goal Summary

---

## Role Execution Assignments

| Role | Execution Type | Tool / Method | Workspace | Notes |
|---|---|---|---|---|
| Planner | human | Human / Codex | workspaces/planner/ | Main planning responsibility and planning boundary |
| JuniorBuilder | cli | gemini-cli | workspaces/junior_builder/ | Optional draft / low-risk support only if useful |
| Builder | cli | claude / codex | workspaces/builder/ | Main implementation responsibility and build boundary |
| Critic | human / cli | Human / Codex | workspaces/critic/ | Main review lens and acceptance concerns |
| Judge | human | Human | workspaces/judge/ | Final accept / continue decision standard |

---

## Minimum Procedure

### Planner

1. Read `goal.md`
2. Write `plan.md`
3. Leave `handoff.md` only if the next role needs extra transfer context

### Builder

1. Read `plan.md`
2. Implement the scoped work
3. Write `build.md`

### Critic

1. Read `plan.md` and `build.md`
2. Review with the assigned lens
3. Write `review.md`

### Judge

1. Read `review.md`
2. Decide whether to continue or adopt
3. Write `improve.md` or `result.md`

---

## Why This Execution Plan

- 

---

## Operational Risks

- [ ]

---

## Optional Specialist Notes

### Planner Specialist

- Primary P-TYPE:
- Specialist Path:
- Selection Basis:

### Critic Specialist

- Primary C-TYPE:
- Specialist Path:
- Selection Basis:

### Builder Specialist

- Primary B-TYPE:
- Specialist Path:
- Selection Basis:
