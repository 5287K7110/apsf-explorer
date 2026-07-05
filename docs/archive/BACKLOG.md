# APSF Explorer Product Backlog

**Status**: v0.1 Prototype - UI & Mock Infrastructure Complete  
**Implementation**: ~85% features, 0% backend integration  
**Ready for**: Demo, Internal testing  
**NOT ready for**: Production, Real data

---

## 🔴 CRITICAL (Blocks Production)

### 1. Backend API Integration
**Impact**: Explorer is completely disconnected from real APSF  
**Status**: Not started  
**Effort**: 8-12 hours  
**Blocks**: Everything real-time  

Tasks:
- [ ] Connect to real APSF CLI/API
- [ ] Replace mock data with actual API calls
- [ ] Implement proper error handling
- [ ] Add loading states
- [ ] Handle API timeouts

**File**: `src/hooks/useAPI.ts`

---

### 2. User Authentication
**Impact**: No auth system, anyone can access  
**Status**: Not started  
**Effort**: 6-8 hours  

Tasks:
- [ ] Add login page
- [ ] Implement JWT token handling
- [ ] Add logout flow
- [ ] Protect routes
- [ ] Store user preferences

**Files**: New - `src/pages/Login.tsx`

---

### 3. WebSocket Real-time Updates
**Impact**: No true real-time, only mock polling  
**Status**: Not started  
**Effort**: 4-6 hours  

Tasks:
- [ ] Replace polling with WebSocket
- [ ] Handle reconnection logic
- [ ] Add connection status indicator
- [ ] Update run state in real-time

**File**: `src/hooks/useAPI.ts`

---

### 4. Data Persistence
**Impact**: All data lost on page reload  
**Status**: Not started  
**Effort**: 4-6 hours  

Tasks:
- [ ] Implement database connection
- [ ] Add run history persistence
- [ ] Save user preferences
- [ ] Add data sync on startup

**File**: Backend API layer

---

### 5. Role/Agent Selection ⭐
**Impact**: Cannot leverage APSF's multi-agent capability  
**Status**: Not started  
**Effort**: 6-8 hours  
**Related**: `TODO_ROLE_SELECTION.md`

Tasks:
- [ ] Fetch available roles from backend
- [ ] Create role selector UI
- [ ] Pass selected roles to execution
- [ ] Display which agents were used

**Files**: 
- New - `src/components/RoleSelector.tsx`
- Modify - `src/components/CommandPanel.tsx`

---

## 🟡 HIGH (Enhances Core Functionality)

### 6. Scroll Implementation Fix
**Impact**: Sidebar/Main content not fully scrollable  
**Status**: In Progress (via PLAN.md)  
**Effort**: 1-2 hours  
**Fix**: Per PLAN.md - layout hierarchy  

### 7. Advanced Filtering
**Impact**: Can only filter by status (Running/All)  
**Status**: Not started  
**Effort**: 3-4 hours  

Options:
- Domain filter
- Phase filter  
- Date range filter
- AC progress filter
- Multiple selection

**File**: `src/components/Sidebar.tsx`

---

### 8. Search Capability
**Impact**: Cannot find specific runs  
**Status**: Not started  
**Effort**: 2-3 hours  

Tasks:
- [ ] Add search input to sidebar
- [ ] Implement fuzzy search
- [ ] Search by domain, description, ID
- [ ] Highlight matches

---

### 9. Run Creation/Submission
**Impact**: Can only view existing runs, cannot start new  
**Status**: Not started  
**Effort**: 4-5 hours  

Tasks:
- [ ] Create "New Run" modal
- [ ] Add goal/description input
- [ ] Submit to backend
- [ ] Redirect to run view
- [ ] Validation

**Files**: 
- New - `src/components/NewRunModal.tsx`
- Modify - `src/components/Sidebar.tsx`

---

### 10. Theme Toggle Functionality
**Impact**: Settings icon shows but does nothing  
**Status**: Not started  
**Effort**: 1-2 hours  

Tasks:
- [ ] Implement theme state (Zustand)
- [ ] Add toggle handler
- [ ] Save to localStorage
- [ ] Apply dark/light theme
- [ ] Add transitions

**Files**: 
- Modify - `src/components/Header.tsx`
- Modify - `tailwind.config.js`

---

### 11. Settings Panel
**Impact**: No user configuration  
**Status**: Not started  
**Effort**: 2-3 hours  

Options:
- Auto-refresh interval
- Log verbosity
- Notifications toggle
- Timezone
- Display preferences

**Files**: New - `src/components/SettingsPanel.tsx`

---

### 12. Export/Reporting
**Impact**: Cannot export run data or generate reports  
**Status**: Not started  
**Effort**: 3-4 hours  

Formats:
- CSV export
- PDF report
- JSON export
- Email report

**Files**: New - `src/utils/export.ts`

---

## 🟢 MEDIUM (Polish & UX)

### 13. Loading States & Skeletons
**Impact**: Poor UX during data fetch  
**Status**: Not started  
**Effort**: 2-3 hours  

Components:
- Phase indicator skeleton
- AC progress skeleton
- Log viewer skeleton
- Analytics skeleton

---

### 14. Toast Notifications
**Impact**: No user feedback on actions  
**Status**: Not started  
**Effort**: 1-2 hours  

Events:
- Command execution
- Error handling
- Successful operations

**Library**: React-hot-toast or similar

---

### 15. Improved Error Handling
**Impact**: Limited error recovery  
**Status**: Partial (has ErrorDisplay component)  
**Effort**: 2-3 hours  

Tasks:
- [ ] Add error boundary components
- [ ] Better error messages
- [ ] Retry suggestions
- [ ] Error logging

---

### 16. Keyboard Shortcuts
**Impact**: Poor accessibility  
**Status**: Not started  
**Effort**: 1-2 hours  

Shortcuts:
- Ctrl+K - Search
- Ctrl+N - New run
- Escape - Close modal
- Arrow keys - Navigation

---

### 17. Accessibility Compliance
**Impact**: Claimed WCAG AA, needs verification  
**Status**: Partial (claims in code)  
**Effort**: 2-3 hours  

Tasks:
- [ ] Add ARIA labels
- [ ] Improve color contrast
- [ ] Keyboard navigation test
- [ ] Screen reader test

---

### 18. Performance Optimization
**Impact**: Mock analytics only, no real metrics  
**Status**: Not started  
**Effort**: 2-3 hours  

Tasks:
- [ ] Code splitting
- [ ] Lazy loading
- [ ] Memoization optimization
- [ ] Bundle size reduction

---

## 📊 Summary by Priority

| Priority | Count | Effort | Critical? |
|----------|-------|--------|-----------|
| 🔴 CRITICAL | 5 | 32-40h | YES |
| 🟡 HIGH | 8 | 21-27h | IMPORTANT |
| 🟢 MEDIUM | 5 | 10-14h | POLISH |
| **TOTAL** | **18** | **63-81h** | - |

---

## 📅 Recommended Roadmap

### Phase 1: MVP (Week 1-2)
- [ ] Backend API integration
- [ ] Real WebSocket connection
- [ ] User authentication
- [ ] Scroll fixes

**Result**: Working prototype with real data

### Phase 2: Core (Week 3-4)
- [ ] Role selection feature
- [ ] Advanced filtering
- [ ] Run creation
- [ ] Data persistence

**Result**: Fully functional for power users

### Phase 3: Polish (Week 5-6)
- [ ] Theme toggle
- [ ] Settings panel
- [ ] Export/reporting
- [ ] Loading states

**Result**: Production-ready UI

### Phase 4: Excellence (Week 7+)
- [ ] Keyboard shortcuts
- [ ] Accessibility compliance
- [ ] Performance optimization
- [ ] Advanced features

**Result**: Enterprise-grade explorer

---

## ⚠️ Known Issues

1. **Scroll not fully working** - Sidebar and main content scroll incomplete (PLAN.md in progress)
2. **Mock data tightly coupled** - Hard to switch to real API
3. **No error boundaries** - Crashes not gracefully handled
4. **Accessibility untested** - WCAG AA claimed but not verified
5. **Settings UI non-functional** - Icons present but no implementation

---

## 🎯 What's Working NOW

✅ Beautiful, responsive UI  
✅ Complete mock infrastructure  
✅ Type-safe codebase  
✅ Dashboard layout  
✅ Command buttons  
✅ Analytics charts  
✅ Dark theme  
✅ Mobile responsive  

## 🚀 What's Next

1. **Backend Integration** (CRITICAL)
2. **Real Runs** (CRITICAL)
3. **Role Selection** (Feature)
4. **Advanced Filtering** (Feature)

---

**Version**: 0.1 Prototype  
**Last Updated**: 2026-07-04  
**Owner**: APSF Explorer Team  
**Status**: Ready for Phase 1 development
