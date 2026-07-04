# TODO: Role Selection Feature for APSF Explorer

## Problem
apsf-explorer は APSF の workflow を可視化・実行できるが、**Role/Agent 選択機能がない**。

APSF framework の core feature である「複数の専門家を選んで各タスクを実施させる」ことができない。

## Current State
✅ Done:
- Plan/Build/Review/Judge/Retry/Cycle コマンド実行
- Run state 可視化
- Phase progress 追跡

❌ Missing:
- Builder 選択（junior / senior / specialized）
- Critic 選択（code / logic / performance）
- Judge 選択（strict / lenient / auto）
- Planner 選択（fast / thorough / adaptive）

## Desired UI Flow

```
User selects run
  ↓
[Choose Roles] modal appears
  ├─ Planner selector
  ├─ Builder selector
  ├─ Critic selector
  └─ Judge selector
  ↓
Click "Run with Selected Roles"
  ↓
APSF executes with chosen agents
  ↓
UI shows which agents were used
```

## Implementation Approach

### 1. Discover Available Roles
```bash
# From framework/agents/builders/
# From framework/agents/critics/
# From framework/agents/planners/
# Parse role metadata
```

### 2. Add Role Selection Component
```tsx
<RoleSelector run={run} />
```

Features:
- Dropdown for each role type
- Role description on hover
- Save preference (localStorage)
- Show which agents are running

### 3. Extend CommandPanel
```tsx
// Add "Configure Roles" button
// Show selected roles before execution
// Display role badges during execution
```

### 4. Update Run State
```tsx
interface Run {
  // ... existing fields
  selectedRoles?: {
    planner?: string;
    builder?: string;
    critic?: string;
    judge?: string;
  };
}
```

## Files to Create/Modify

### New Files:
- `src/components/RoleSelector.tsx` - Role selection UI
- `src/hooks/useRoles.ts` - Fetch available roles from backend
- `src/types/roles.ts` - Role type definitions

### Modify:
- `src/components/CommandPanel.tsx` - Add role selection flow
- `src/components/Dashboard.tsx` - Show selected roles in UI
- `src/store/runStore.ts` - Store selected roles

## Backend Integration Needed

API to fetch available roles:
```
GET /api/roles
→ {
    builders: [...],
    critics: [...],
    judges: [...],
    planners: [...]
  }

POST /api/runs/:id/execute
→ payload: { role_config: { builder: "...", etc } }
```

## Success Criteria

- [ ] Role selector UI renders without errors
- [ ] User can select different roles for each phase
- [ ] Selected roles are displayed during execution
- [ ] Role selection is persisted in run metadata
- [ ] Responsiveness maintained (mobile/tablet/desktop)
- [ ] No TypeScript errors
- [ ] Build passes

## Priority: HIGH 🔴

This is a **core APSF feature** that makes the explorer truly powerful.
Without it, users can't leverage the multi-agent capability that makes APSF unique.

## Estimated Effort: 4-6 hours

## Related Code References
- `framework/agents/builders/` - Builder implementations
- `framework/agents/critics/` - Critic implementations  
- `framework/agents/judges/` - Judge implementations
- `framework/agents/planners/` - Planner implementations

---

**Status**: Backlog
**Created**: 2026-07-04
