# Goal: Resolve 5 Critical Issues for APSF Explorer

## 🎯 Objective
Convert APSF Explorer from **v0.1 Prototype (Mock)** to **v1.0 Beta (Real Backend)**

---

## Critical Issues to Resolve

### 1. Backend API Integration
**Current**: useAPI hook で mock delays のみ  
**Target**: 実際の APSF CLI/API に接続  
**Impact**: Explorer が本当に動作開始

### 2. User Authentication
**Current**: Auth なし、誰でもアクセス可能  
**Target**: Login/logout システム + JWT token  
**Impact**: Multi-user support 開始

### 3. WebSocket Real-time
**Current**: Mock polling (2秒ごと)  
**Target**: 実際の WebSocket 接続  
**Impact**: 本当のリアルタイム更新

### 4. Data Persistence
**Current**: Session のみ、reload で全削除  
**Target**: Database/localStorage 永続化  
**Impact**: Run history が保存される

### 5. Role/Agent Selection
**Current**: 未実装（固定 agent のみ）  
**Target**: Builder/Critic/Judge 選択可能  
**Impact**: APSF の本当の価値を発揮

---

## Success Criteria

### Backend API
- [ ] useAPI が real backend に接続
- [ ] plan/build/review/judge コマンド実行成功
- [ ] Error handling で適切に失敗処理
- [ ] Loading states 表示
- [ ] Network errors gracefully handled

### Authentication
- [ ] Login page renders
- [ ] JWT token stored securely
- [ ] Protected routes working
- [ ] Logout clears session
- [ ] Auto-refresh token

### WebSocket
- [ ] WebSocket connection established
- [ ] Real-time run updates flowing
- [ ] Reconnection logic working
- [ ] Connection status indicator
- [ ] No polling fallback needed

### Persistence
- [ ] Run history saved to database
- [ ] User preferences persisted
- [ ] Data loaded on app startup
- [ ] Sync across tabs
- [ ] No data loss on reload

### Role Selection
- [ ] Role selector UI renders
- [ ] Available roles fetched from backend
- [ ] User can select roles before execution
- [ ] Selected roles passed to API
- [ ] Executed roles displayed in UI

---

## Acceptance Criteria
- [ ] Build passes: `npm run build`
- [ ] No TypeScript errors
- [ ] All 5 issues resolved
- [ ] UI/UX not degraded
- [ ] Mobile responsive maintained
- [ ] Accessibility preserved
- [ ] Performance acceptable

---

## Out of Scope (v1.0)
- Advanced security (OAuth, SSO)
- Multi-region deployment
- Advanced caching strategies
- Rate limiting
- Comprehensive logging

---

## Estimated Effort
- Backend API: 8-12 hours
- Authentication: 6-8 hours
- WebSocket: 4-6 hours
- Persistence: 4-6 hours
- Role Selection: 6-8 hours
- **Total: 28-40 hours**

---

## Dependencies
- Real APSF backend available
- Database setup complete
- WebSocket server ready
- Role metadata accessible

---

**Status**: Goal Definition Complete - Ready for Planning Phase
