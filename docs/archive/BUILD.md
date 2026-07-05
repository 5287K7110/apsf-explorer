# Build: Critical Issues Resolution (5つの Critical Issues を実装)

## Phase Status
**Current**: Build Phase In Progress  
**Triggered by**: APSF Loop (Goal → Plan → Build)  
**Target Completion**: 28-40 hours (7-10 days)

---

## Build Master Plan

### 📋 Source Documents
- Goal: `CRITICAL_ISSUES_GOAL.md` ✅
- Plan: `IMPLEMENTATION_PLAN.md` (2,000 lines)
- Architecture: `ARCHITECTURE.md` (3,500 lines)
- Quick Ref: `PLANNING_COMPLETE.md` (Navigation)

### 🎯 5つの Critical Issues

#### Issue 1: Backend API Integration
**Status**: Not Started  
**Assigned to**: Fable  
**Phase Duration**: 8-12 hours

Task List:
- [ ] Create `src/utils/apiClient.ts` (API client wrapper)
- [ ] Create `src/services/runAPI.ts` (Run-specific API)
- [ ] Modify `src/hooks/useAPI.ts` (Replace mock → real API)
- [ ] Update API URLs from mock to backend endpoints
- [ ] Add error handling for API failures
- [ ] Add loading states for API calls
- [ ] Test with real backend

---

#### Issue 2: User Authentication
**Status**: Not Started  
**Assigned to**: Fable  
**Phase Duration**: 6-8 hours

Task List:
- [ ] Create `src/types/auth.ts` (Auth types)
- [ ] Create `src/hooks/useAuth.ts` (Auth hook)
- [ ] Create `src/store/authStore.ts` (Zustand auth store)
- [ ] Create `src/pages/LoginPage.tsx` (Login UI)
- [ ] Modify `src/App.tsx` (Route protection)
- [ ] Implement JWT token storage
- [ ] Add auto-refresh token logic
- [ ] Add logout functionality

---

#### Issue 3: WebSocket Real-time
**Status**: Not Started  
**Assigned to**: Fable  
**Phase Duration**: 4-6 hours

Task List:
- [ ] Create `src/utils/wsClient.ts` (WebSocket client)
- [ ] Create `src/hooks/useWebSocket.ts` (WebSocket hook)
- [ ] Modify `src/store/runStore.ts` (WebSocket integration)
- [ ] Replace polling with WebSocket listener
- [ ] Add reconnection logic
- [ ] Add connection status indicator
- [ ] Modify `src/components/Header.tsx` (Connection status)

---

#### Issue 4: Data Persistence
**Status**: Not Started  
**Assigned to**: Fable  
**Phase Duration**: 4-6 hours

Task List:
- [ ] Create `src/utils/localStorage.ts` (localStorage utils)
- [ ] Create `src/services/syncService.ts` (Sync logic)
- [ ] Modify `src/store/runStore.ts` (Persistence middleware)
- [ ] Add save-on-change logic
- [ ] Add load-on-startup logic
- [ ] Add cross-tab sync detection
- [ ] Test persistence across reloads

---

#### Issue 5: Role/Agent Selection
**Status**: Not Started  
**Assigned to**: Fable  
**Phase Duration**: 6-8 hours

Task List:
- [ ] Create `src/types/roles.ts` (Role types)
- [ ] Create `src/components/RoleSelector.tsx` (UI)
- [ ] Create `src/hooks/useRoles.ts` (Fetch roles)
- [ ] Create `src/store/roleStore.ts` (Role state)
- [ ] Modify `src/components/CommandPanel.tsx` (Integration)
- [ ] Add role selector to command flow
- [ ] Display selected roles in UI
- [ ] Pass roles to API

---

## Implementation Phases

### Phase 1: Foundation (2 days)
```
├── Create type definitions (auth, roles)
├── Create utilities (apiClient, wsClient, localStorage)
└── Create base services
```

### Phase 2: Core API Layer (2-3 days)
```
├── Implement API client
├── Replace mock delays with real calls
├── Add error handling
└── Verify with real backend
```

### Phase 3: Authentication (2-3 days)
```
├── Create login page UI
├── Implement auth hook
├── Add route protection
└── Test login flow
```

### Phase 4: Real-time (2-3 days)
```
├── Implement WebSocket client
├── Replace polling
├── Add connection status
└── Test real-time updates
```

### Phase 5: Persistence (2-3 days)
```
├── Implement localStorage
├── Add sync service
├── Test data persistence
└── Verify cross-reload
```

### Phase 6: Role Selection (2 days)
```
├── Create role selector UI
├── Implement role fetching
├── Add to command flow
└── Test role selection
```

### Phase 7: Integration (2 days)
```
├── Connect all 5 issues
├── End-to-end testing
├── Error handling polish
└── Performance check
```

### Phase 8: Polish & Docs (2 days)
```
├── Loading states
├── Error messages
├── Type safety
└── Mobile responsive
```

---

## 🚀 Start Building!

### Ready to Begin?
Next step: **Phase 1 - Foundation**

```bash
cd C:\Users\PC_User\PRJ\apsf-explorer
# Ready for Fable to start implementation
```

### Fable: Start here
1. Read `IMPLEMENTATION_PLAN.md` (tasks list)
2. Read `ARCHITECTURE.md` (design spec)
3. Start Phase 1: Type definitions
4. Create files as per plan

---

## ✅ Build Success Criteria

After all phases:
- [ ] Build passes: `npm run build`
- [ ] No TypeScript errors
- [ ] API calls go to real backend
- [ ] Login page works
- [ ] WebSocket connected
- [ ] Data persists
- [ ] Role selection works
- [ ] All 5 issues resolved
- [ ] Tests pass
- [ ] Responsive design intact

---

## 📊 Progress Tracking

| Phase | Status | Effort | Days |
|-------|--------|--------|------|
| 1: Foundation | ⏳ | 4-6h | 1 |
| 2: API Layer | ⏳ | 8-12h | 2-3 |
| 3: Auth | ⏳ | 6-8h | 2-3 |
| 4: WebSocket | ⏳ | 4-6h | 2-3 |
| 5: Persistence | ⏳ | 4-6h | 2-3 |
| 6: Roles | ⏳ | 6-8h | 2 |
| 7: Integration | ⏳ | 4-6h | 2 |
| 8: Polish | ⏳ | 4-6h | 2 |
| **TOTAL** | **⏳** | **40-58h** | **7-10 days** |

---

## 🛠️ Implementation Status

```
APSF Loop Progress:
├── Goal ✅ (CRITICAL_ISSUES_GOAL.md)
├── Plan ✅ (IMPLEMENTATION_PLAN.md + ARCHITECTURE.md)
├── Build 🔄 (THIS FILE - In Progress)
├── Review ⏳ (Next: Code review)
├── Improve ⏳ (Next: Fix issues if found)
└── Result ⏳ (Next: Completion record)
```

---

## 📝 Notes

- Detailed tasks in `IMPLEMENTATION_PLAN.md`
- Architecture details in `ARCHITECTURE.md`
- Quick reference: `PLANNING_COMPLETE.md`
- Backend API contract in `ARCHITECTURE.md`
- WebSocket protocol spec in `ARCHITECTURE.md`

---

**BUILD PHASE STARTED**  
**Ready for implementation by Fable**  
**Estimated Completion: 28-40 hours from start**
