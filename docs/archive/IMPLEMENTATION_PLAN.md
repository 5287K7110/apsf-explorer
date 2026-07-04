# APSF Explorer v0.1 → v1.0 Implementation Plan

**Status**: Ready for BUILD phase  
**Estimated Duration**: 28-40 hours  
**Target Completion**: ~7-10 days (4 hours/day)

---

## Executive Summary

This document outlines the step-by-step implementation plan to convert APSF Explorer from a mock prototype (v0.1) to a production-ready application with real backend integration (v1.0).

**5 Critical Issues Resolved**:
1. Backend API Integration - Replace mock delays with real API calls
2. User Authentication - Implement JWT-based login system
3. WebSocket Real-time - Replace polling with persistent WebSocket
4. Data Persistence - Save run history across reloads
5. Role/Agent Selection - Allow user to select builders/critics/judges

---

## Phase 1: Core Infrastructure & Type Definitions (2 days)

### Task 1.1: Extend Type Definitions
**File**: `src/types/index.ts`  
**Status**: Ready  
**Dependencies**: None  
**Complexity**: Low

Add these new type categories:
```typescript
// Authentication
interface AuthCredentials { email: string; password: string; }
interface AuthToken { accessToken: string; refreshToken: string; expiresIn: number; expiresAt: number; }
interface AuthUser { id: string; email: string; name: string; avatar?: string; }
interface AuthState { user: AuthUser | null; token: AuthToken | null; isAuthenticated: boolean; isLoading: boolean; error: APIError | null; }

// Roles
type AgentRole = 'builder' | 'critic' | 'judge';
interface Agent { id: string; name: string; role: AgentRole; description: string; capabilities: string[]; maxConcurrent: number; estimatedDuration: number; }
interface RoleSelection { builders: Agent[]; critics: Agent[]; judges: Agent[]; selectedBuilderId?: string; selectedCriticId?: string; selectedJudgeId?: string; }

// API
interface CommandRequest { runId: string; command: CommandType; roles?: RoleSelection; parameters?: Record<string, any>; }
interface CommandResult { success: boolean; runId: string; command: CommandType; message: string; timestamp: number; data?: Record<string, any>; }

// WebSocket
type WSMessageType = 'PROGRESS_UPDATE' | 'PHASE_COMPLETE' | 'RUN_STATUS_CHANGE' | 'LOG_ENTRY' | 'ERROR_OCCURRED' | 'CONNECTION_ESTABLISHED' | 'PING';
interface WSMessage { type: WSMessageType; runId: string; timestamp: number; data: { progress?: number; phase?: Phase; status?: RunStatus; logLine?: string; error?: APIError; [key: string]: any; }; }

// Persistence
interface PersistenceConfig { useLocalStorage: boolean; useDatabase: boolean; syncInterval: number; maxLocalRuns: number; }
interface PersistedRunData { run: Run; persistedAt: number; syncedWith: 'database' | 'localStorage' | 'both' | 'pending'; }

// Extended Run
interface Run { /* existing */ executedWith?: { builderId?: string; criticId?: string; judgeId?: string; }; wsConnectionId?: string; }
```

**Acceptance Criteria**:
- [ ] No TypeScript compilation errors
- [ ] All new types exportable from index.ts
- [ ] Backward compatible with existing Run usage

---

## Phase 2: API Client & HTTP Layer (2-3 days)

### Task 2.1: Create API Client Service
**File**: `src/services/apiClient.ts` (NEW)  
**Status**: Ready  
**Dependencies**: `src/types/index.ts`  
**Complexity**: Medium

Responsibilities:
- Fetch wrapper with Authorization header injection
- Automatic token refresh on 401
- Retry logic (3 attempts) for network failures
- Error standardization
- Request/response logging (dev only)

Key Functions:
```typescript
export class APIClient {
  static setBaseURL(url: string): void
  static setAuthToken(token: AuthToken): void
  static async request<T>(config: APIRequestConfig): Promise<T>
  private static getAuthHeader(): string
  private static async refreshTokenIfNeeded(): Promise<boolean>
  private static standardizeError(err: any): APIError
}

interface APIRequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  endpoint: string;
  body?: any;
  headers?: Record<string, string>;
  retries?: number;
  timeout?: number;
}
```

**Acceptance Criteria**:
- [ ] HTTP requests include Authorization header when token exists
- [ ] 401 response triggers token refresh
- [ ] Fails after 3 retries
- [ ] Non-retryable errors (4xx except 401) fail immediately
- [ ] Logs requests/responses in dev mode only
- [ ] Handles network timeouts gracefully

### Task 2.2: Create Run API Service
**File**: `src/services/runAPI.ts` (NEW)  
**Status**: Ready  
**Dependencies**: `src/services/apiClient.ts`  
**Complexity**: Low

```typescript
export class RunAPI {
  static async executeCommand(runId: string, command: CommandType, roles?: RoleSelection): Promise<CommandResult>
  static async listRuns(filters?: RunState['filter']): Promise<Run[]>
  static async getRunDetail(runId: string): Promise<Run>
  static async createRun(domain: string, description: string): Promise<Run>
  static async cancelRun(runId: string): Promise<boolean>
  static async getRoles(): Promise<RoleSelection>
}
```

**Backend Endpoints Required**:
```
GET /api/runs
GET /api/runs/:id
POST /api/runs
DELETE /api/runs/:id
POST /api/runs/:id/plan
POST /api/runs/:id/build
POST /api/runs/:id/review
POST /api/runs/:id/judge
POST /api/runs/:id/retry
GET /api/roles/builders
GET /api/roles/critics
GET /api/roles/judges
```

**Acceptance Criteria**:
- [ ] All methods use APIClient.request()
- [ ] Proper error handling
- [ ] Request body includes roles when provided
- [ ] Parses backend response correctly

---

## Phase 3: Authentication System (2-3 days)

### Task 3.1: Create Auth Store
**File**: `src/store/authStore.ts` (NEW)  
**Status**: Ready  
**Dependencies**: `src/types/index.ts`  
**Complexity**: Medium

```typescript
export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {/* ... */},
  logout: () => {/* ... */},
  refreshToken: async () => {/* ... */},
  clearError: () => {/* ... */},
  setToken: (token: AuthToken) => {/* ... */},
  checkAuthStatus: async () => {/* ... */},
}));
```

**Initialization Logic**:
- On app load, restore token from localStorage
- Validate token with GET /api/auth/me
- Redirect to login if invalid or expired
- Auto-refresh 5 minutes before expiry

**Acceptance Criteria**:
- [ ] Stores user, token, and auth status
- [ ] login() calls backend and stores token
- [ ] logout() clears token and user
- [ ] refreshToken() works before expiry
- [ ] checkAuthStatus() validates on app start
- [ ] Token persists in localStorage

### Task 3.2: Create Auth API Service
**File**: `src/services/authAPI.ts` (NEW)  
**Status**: Ready  
**Dependencies**: `src/services/apiClient.ts`  
**Complexity**: Low

```typescript
export class AuthAPI {
  static async login(credentials: AuthCredentials): Promise<AuthToken>
  static async refresh(refreshToken: string): Promise<AuthToken>
  static async logout(): Promise<void>
  static async validateToken(token: string): Promise<AuthUser>
}
```

**Backend Endpoints Required**:
```
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET /api/auth/me
```

**Acceptance Criteria**:
- [ ] login() sends email/password, receives token
- [ ] refresh() sends refreshToken, receives new token
- [ ] logout() clears server session
- [ ] validateToken() returns current user info

### Task 3.3: Create Login Page Component
**File**: `src/components/LoginPage.tsx` (NEW)  
**Status**: Ready  
**Dependencies**: `src/store/authStore.ts`, `src/services/authAPI.ts`  
**Complexity**: Medium

Features:
- Email/password form
- Error message display
- Loading state during login
- Redirect to dashboard on success
- Remember email in localStorage
- Distinguish "Invalid credentials" vs "Network error"

**Acceptance Criteria**:
- [ ] Form renders with email and password inputs
- [ ] Validates email format
- [ ] Shows loading spinner during login
- [ ] Displays auth errors clearly
- [ ] Redirects to /dashboard on success
- [ ] Mobile responsive
- [ ] Accessible (labels, focus, ARIA)

### Task 3.4: Create Protected Route Component
**File**: `src/components/ProtectedRoute.tsx` (NEW)  
**Status**: Ready  
**Dependencies**: `src/store/authStore.ts`  
**Complexity**: Low

```typescript
export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();
  
  if (isLoading) return <LoadingPage />;
  if (!isAuthenticated) return <Navigate to="/login" />;
  return <>{children}</>;
};
```

**Acceptance Criteria**:
- [ ] Shows loading state while checking auth
- [ ] Redirects to /login if not authenticated
- [ ] Renders children if authenticated
- [ ] Preserves returnTo for post-login redirect

### Task 3.5: Modify App.tsx for Auth Flow
**File**: `src/App.tsx` (MODIFY)  
**Status**: Ready  
**Dependencies**: All auth files  
**Complexity**: Medium

Replace:
```typescript
export const App: React.FC = () => {
  return <div><Dashboard /></div>;
};
```

With:
```typescript
export const App: React.FC = () => {
  const [route, setRoute] = useState<'login' | 'dashboard'>('login');
  const { isAuthenticated, checkAuthStatus } = useAuthStore();

  useEffect(() => {
    checkAuthStatus().then(() => {
      setRoute(isAuthenticated ? 'dashboard' : 'login');
    });
  }, []);

  return (
    <div>
      {route === 'login' ? <LoginPage /> : <ProtectedRoute><Dashboard /></ProtectedRoute>}
    </div>
  );
};
```

**Acceptance Criteria**:
- [ ] App loads with loading state
- [ ] Redirects to login if not authenticated
- [ ] Shows dashboard if authenticated
- [ ] Handles auth status changes

---

## Phase 4: WebSocket Real-time Updates (2-3 days)

### Task 4.1: Create WebSocket Service
**File**: `src/services/wsClient.ts` (NEW)  
**Status**: Ready  
**Dependencies**: `src/types/index.ts`  
**Complexity**: High

```typescript
export class WSClient {
  private ws: WebSocket | null = null;
  private runId: string;
  private messageQueue: WSMessage[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private onMessage: (msg: WSMessage) => void;

  constructor(runId: string, onMessage: (msg: WSMessage) => void);
  async connect(): Promise<void>;
  disconnect(): void;
  private handleMessage(event: MessageEvent): void;
  private handleError(event: Event): void;
  private handleClose(event: CloseEvent): void;
  private attemptReconnect(): void;
  private sendHeartbeat(): void;
  private queueMessage(msg: WSMessage): void;
}
```

**WebSocket Protocol**:
```
URL: ws://backend/ws/runs/:runId?token=JWT
Messages: JSON { type, runId, timestamp, data }

Server → Client:
  { type: 'PROGRESS_UPDATE', data: { progress: 50, phase: 'building' } }
  { type: 'PHASE_COMPLETE', data: { phase: 'planning', duration: 12000 } }
  { type: 'RUN_STATUS_CHANGE', data: { status: 'running' } }
  { type: 'LOG_ENTRY', data: { logLine: '> Starting build...' } }
  { type: 'ERROR_OCCURRED', data: { error: { code, message } } }
  { type: 'PING', data: {} }

Client → Server:
  { type: 'PONG', data: {} }
```

**Acceptance Criteria**:
- [ ] WebSocket connects to correct URL with token
- [ ] Parses JSON messages correctly
- [ ] Calls onMessage callback for each message
- [ ] Handles disconnection gracefully
- [ ] Attempts reconnection with exponential backoff (1s → 2s → 4s... max 10s)
- [ ] Gives up after 10 failed attempts
- [ ] Sends heartbeat every 30 seconds
- [ ] Times out heartbeat after 5 seconds

### Task 4.2: Create WebSocket Store
**File**: `src/store/wsStore.ts` (NEW)  
**Status**: Ready  
**Dependencies**: `src/types/index.ts`  
**Complexity**: Medium

```typescript
export const useWSStore = create<WSStore>((set, get) => ({
  connectionsByRunId: new Map(),
  lastMessageTimestamp: new Map(),
  pendingMessages: new Map(),
  connectionErrors: new Map(),

  connectToRun: (runId: string) => {/* ... */},
  disconnectFromRun: (runId: string) => {/* ... */},
  getRunConnectionStatus: (runId: string) => {/* ... */},
  clearError: (runId: string) => {/* ... */},
}));
```

**Acceptance Criteria**:
- [ ] Tracks connection status per run
- [ ] Stores last message timestamp
- [ ] Queues messages during disconnect
- [ ] Stores connection errors

### Task 4.3: Create useWebSocket Hook
**File**: `src/hooks/useWebSocket.ts` (NEW)  
**Status**: Ready  
**Dependencies**: `src/services/wsClient.ts`, `src/store/wsStore.ts`  
**Complexity**: Medium

```typescript
export function useWebSocket(runId: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<APIError | null>(null);
  const [lastUpdate, setLastUpdate] = useState<WSMessage | null>(null);

  useEffect(() => {
    const wsClient = new WSClient(runId, (msg) => {
      setLastUpdate(msg);
      handleMessage(msg);
    });
    
    wsClient.connect();
    setIsConnected(true);

    return () => {
      wsClient.disconnect();
      setIsConnected(false);
    };
  }, [runId]);

  return { isConnected, isReconnecting, connectionError, lastUpdate };
}
```

**Acceptance Criteria**:
- [ ] Auto-connects on mount
- [ ] Auto-disconnects on unmount
- [ ] Updates run in store when messages received
- [ ] Handles reconnection transparently
- [ ] Returns connection status to component
- [ ] Prevents memory leaks (cleanup)

### Task 4.4: Remove Polling from Dashboard
**File**: `src/components/Dashboard.tsx` (MODIFY)  
**Status**: Ready  
**Dependencies**: `src/hooks/useWebSocket.ts`  
**Complexity**: Low

Remove lines 25-47 (polling simulation) and replace with WebSocket updates.

**Acceptance Criteria**:
- [ ] Polling interval removed
- [ ] useWebSocket hook integrated
- [ ] Run updates via WebSocket messages
- [ ] No setTimeout for progress updates

### Task 4.5: Modify useAPI Hook
**File**: `src/hooks/useAPI.ts` (MODIFY)  
**Status**: Ready  
**Dependencies**: `src/services/runAPI.ts`, `src/services/wsClient.ts`  
**Complexity**: High

Remove all setTimeout mocks. Replace executeCommand with:

```typescript
const executeCommand = useCallback(
  async (
    runId: string,
    command: CommandType,
    options?: UseAPIOptions,
    roles?: RoleSelection
  ): Promise<CommandResponse | null> => {
    setLoading(true);
    setError(null);

    try {
      // Connect WebSocket for real-time updates
      const wsClient = new WSClient(runId, (msg) => {
        if (msg.type === 'PROGRESS_UPDATE') {
          updateRunPhase(runId, msg.data.phase, msg.data.progress);
        }
        if (msg.type === 'PHASE_COMPLETE') {
          updateRunPhase(runId, msg.data.phase, 100);
        }
        if (msg.type === 'RUN_STATUS_CHANGE') {
          if (msg.data.status === 'success') {
            markRunSuccess(runId);
          } else if (msg.data.status === 'failed') {
            markRunFailed(runId, msg.data.error?.message || 'Unknown error');
          }
        }
      });
      await wsClient.connect();

      // Call actual API endpoint
      const result = await RunAPI.executeCommand(runId, command, roles);

      if (result.success) {
        options?.onSuccess?.();
      } else {
        throw new Error(result.message);
      }

      return { success: result.success, runId, message: result.message, timestamp: result.timestamp };
    } catch (err) {
      const apiError: APIError = { code: 'COMMAND_FAILED', message: err instanceof Error ? err.message : 'Unknown error' };
      setError(apiError);
      options?.onError?.(apiError);
      return null;
    } finally {
      setLoading(false);
    }
  },
  [updateRun, updateRunPhase, markRunSuccess, markRunFailed]
);
```

**Acceptance Criteria**:
- [ ] No setTimeout delays
- [ ] Calls real RunAPI.executeCommand()
- [ ] Connects WebSocket for updates
- [ ] Updates store on WebSocket messages
- [ ] Error handling with retry callback
- [ ] Disconnects WebSocket on error/cleanup

---

## Phase 5: Data Persistence (2-3 days)

### Task 5.1: Create Local Storage Service
**File**: `src/services/localStorage.ts` (NEW)  
**Status**: Ready  
**Dependencies**: `src/types/index.ts`  
**Complexity**: Low

```typescript
export class LocalStorageService {
  private static PREFIX = 'apsf_';
  private static SCHEMA_VERSION = 1;

  static setRuns(runs: Run[]): void
  // Key: 'apsf_runs_v1', limit to 100 runs

  static getRuns(): Run[]
  // Deserialize, validate, return array

  static updateRun(run: Run): void
  // Update single run in array

  static getUserPreferences(userId: string): UserPreferences
  static setUserPreferences(userId: string, prefs: UserPreferences): void

  static getAuthToken(): AuthToken | null
  static setAuthToken(token: AuthToken): void

  static clearAll(): void
  // Wipe all APSF data on logout

  static getSyncStatus(): Map<string, 'synced' | 'pending' | 'error'>
  static setSyncStatus(runId: string, status: string): void
}
```

**localStorage Structure**:
```
apsf_runs_v1: [{ id, status, ... }, ...]  // Max 100 runs
apsf_user_prefs_{userId}: { theme, sidebarOpen, ... }
apsf_auth_token: { accessToken, refreshToken, expiresAt }
apsf_sync_status: { runId: 'synced' | 'pending' | 'error', ... }
```

**Acceptance Criteria**:
- [ ] Stores/retrieves runs from localStorage
- [ ] Limits to 100 runs (FIFO oldest first)
- [ ] Preserves auth token across reloads
- [ ] Tracks sync status per run
- [ ] clearAll() removes all APSF data

### Task 5.2: Create Sync Service
**File**: `src/services/syncService.ts` (NEW)  
**Status**: Ready  
**Dependencies**: `src/services/runAPI.ts`, `src/services/localStorage.ts`  
**Complexity**: High

```typescript
export class SyncService {
  static async initializeData(): Promise<Run[]>
  // 1. Check online status
  // 2. If yes: GET /api/runs from backend
  // 3. If no: Load from localStorage
  // 4. Merge/deduplicate
  // 5. Save to localStorage
  // 6. Return combined list

  static async startPeriodicSync(intervalMs: number = 30000): void
  // Periodically call syncPendingRuns()

  static async syncPendingRuns(): Promise<boolean>
  // For each run with status 'pending':
  //   POST to backend
  //   Update sync status in localStorage
  //   Handle partial failures

  static async saveLocally(runs: Run[]): void
  // Write to localStorage immediately

  static getOfflineMode(): boolean
  static setOfflineMode(offline: boolean): void
}
```

**Sync Flow**:
```
App Start:
  1. Load token from localStorage
  2. Validate with GET /api/auth/me
  3. Fetch runs with GET /api/runs
  4. Save to localStorage
  5. Start periodic sync (every 30s)

Periodic Sync (every 30s):
  1. Find runs with syncStatus='pending'
  2. POST each to backend
  3. Update syncStatus in localStorage
  4. Mark 'synced' if successful
  5. Handle network errors (retry next cycle)

On Unload:
  1. Save all runs to localStorage
  2. Stop sync interval
  3. Close WebSocket
```

**Acceptance Criteria**:
- [ ] Initializes from backend, falls back to localStorage
- [ ] Periodic sync every 30 seconds
- [ ] Merges and deduplicates runs
- [ ] Tracks sync status per run
- [ ] Handles offline mode gracefully
- [ ] Retries failed syncs

### Task 5.3: Modify Store Initialization
**File**: `src/store/runStore.ts` (MODIFY)  
**Status**: Ready  
**Dependencies**: `src/services/syncService.ts`  
**Complexity**: Medium

Replace:
```typescript
const initialRuns = generateMockRuns(8);
```

With:
```typescript
export const useRunStore = create<RunStore>((set, get) => {
  // Initialize async
  SyncService.initializeData().then((runs) => {
    set({ runs });
    SyncService.startPeriodicSync();
  }).catch((err) => {
    console.error('Failed to initialize runs:', err);
    set({ runs: [] });
  });

  return {
    runs: [],
    // ... rest of store
  };
});
```

**Acceptance Criteria**:
- [ ] Loads runs from backend on app start
- [ ] Falls back to localStorage on error
- [ ] Starts periodic sync after initialization
- [ ] No mock data in production

### Task 5.4: Add App Initialization Hook
**File**: `src/hooks/useAppInitialization.ts` (NEW)  
**Status**: Ready  
**Dependencies**: `src/store/authStore.ts`, `src/services/syncService.ts`  
**Complexity**: Medium

```typescript
export function useAppInitialization() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<APIError | null>(null);
  const { checkAuthStatus } = useAuthStore();
  
  useEffect(() => {
    const initialize = async () => {
      try {
        // 1. Check auth
        await checkAuthStatus();
        // 2. Initialize data
        await SyncService.initializeData();
        // 3. Start periodic sync
        SyncService.startPeriodicSync();
      } catch (err) {
        setError(err as APIError);
      } finally {
        setIsInitializing(false);
      }
    };
    initialize();
  }, [checkAuthStatus]);

  return { isInitializing, error };
}
```

**Acceptance Criteria**:
- [ ] Checks auth on app load
- [ ] Initializes data after auth
- [ ] Starts periodic sync
- [ ] Returns initialization state to app
- [ ] Handles and reports errors

### Task 5.5: Add Unload Handler
**File**: `src/App.tsx` (MODIFY)  
**Status**: Ready  
**Dependencies**: `src/services/localStorage.ts`  
**Complexity**: Low

Add to App.tsx:
```typescript
useEffect(() => {
  const handleBeforeUnload = () => {
    // Save runs to localStorage before page unload
    const runs = useRunStore.getState().runs;
    LocalStorageService.setRuns(runs);
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, []);
```

**Acceptance Criteria**:
- [ ] Saves runs to localStorage on page unload
- [ ] Prevents data loss on browser close
- [ ] Cleanup listener on unmount

---

## Phase 6: Role Selection UI (2 days)

### Task 6.1: Create Role Store
**File**: `src/store/roleStore.ts` (NEW)  
**Status**: Ready  
**Dependencies**: `src/types/index.ts`  
**Complexity**: Low

```typescript
export const useRoleStore = create<RoleStore>((set, get) => ({
  availableBuilders: [],
  availableCritics: [],
  availableJudges: [],
  selectedBuilderId: null,
  selectedCriticId: null,
  selectedJudgeId: null,
  isLoading: false,
  error: null,

  fetchAvailableRoles: async () => {/* ... */},
  selectBuilder: (id: string) => set({ selectedBuilderId: id }),
  selectCritic: (id: string) => set({ selectedCriticId: id }),
  selectJudge: (id: string) => set({ selectedJudgeId: id }),
  clearSelections: () => set({ selectedBuilderId: null, selectedCriticId: null, selectedJudgeId: null }),
  getSelectedRoles: (): RoleSelection => {/* ... */},
}));
```

**Acceptance Criteria**:
- [ ] Stores available agents by role type
- [ ] Tracks user selections
- [ ] Fetches from backend on demand
- [ ] Returns RoleSelection object

### Task 6.2: Create RoleSelector Component
**File**: `src/components/RoleSelector.tsx` (NEW)  
**Status**: Ready  
**Dependencies**: `src/store/roleStore.ts`, `src/hooks/useRoles.ts`  
**Complexity**: Medium

Features:
- Three columns: Builders | Critics | Judges
- Display agent name, description, capabilities
- Single-select radio buttons per role
- Loading state while fetching
- Confirm/Cancel buttons

**Acceptance Criteria**:
- [ ] Shows available agents grouped by role
- [ ] Single select per role type
- [ ] Loading state during fetch
- [ ] Confirm/Cancel callbacks
- [ ] Mobile responsive (stack vertically)
- [ ] Accessible (labels, ARIA)

### Task 6.3: Create useRoles Hook
**File**: `src/hooks/useRoles.ts` (NEW)  
**Status**: Ready  
**Dependencies**: `src/store/roleStore.ts`  
**Complexity**: Low

```typescript
export function useRoles() {
  const { 
    availableBuilders, 
    availableCritics, 
    availableJudges,
    selectedBuilderId,
    selectedCriticId,
    selectedJudgeId,
    isLoading,
    error,
    fetchAvailableRoles,
    getSelectedRoles,
  } = useRoleStore();

  useEffect(() => {
    fetchAvailableRoles();
  }, [fetchAvailableRoles]);

  return {
    agents: { builders: availableBuilders, critics: availableCritics, judges: availableJudges },
    selections: { selectedBuilderId, selectedCriticId, selectedJudgeId },
    getSelectedRoles,
    isLoading,
    error,
  };
}
```

**Acceptance Criteria**:
- [ ] Auto-fetches on mount
- [ ] Returns agents grouped by type
- [ ] Returns current selections
- [ ] Provides getSelectedRoles() method
- [ ] Reports loading/error state

### Task 6.4: Modify CommandPanel for Role Selection
**File**: `src/components/CommandPanel.tsx` (MODIFY)  
**Status**: Ready  
**Dependencies**: `src/components/RoleSelector.tsx`  
**Complexity**: Medium

Changes:
```typescript
const [showRoleSelector, setShowRoleSelector] = useState(false);
const [selectedCommand, setSelectedCommand] = useState<CommandType | null>(null);

const handleExecuteCommand = async (command: CommandType) => {
  setSelectedCommand(command);
  setShowRoleSelector(true);
};

const handleRolesConfirmed = async (roles: RoleSelection) => {
  if (selectedCommand) {
    await executeCommand(run.id, selectedCommand, { roles });
  }
  setShowRoleSelector(false);
};

return (
  <>
    {/* existing button grid */}
    {showRoleSelector && (
      <RoleSelector
        onConfirm={handleRolesConfirmed}
        onCancel={() => setShowRoleSelector(false)}
      />
    )}
  </>
);
```

**Acceptance Criteria**:
- [ ] Shows RoleSelector modal on command click
- [ ] Passes selected roles to executeCommand()
- [ ] Closes modal after confirmation
- [ ] Passes cancel callback for close button

### Task 6.5: Display Executed Roles in UI
**File**: `src/components/CommandPanel.tsx` or `ExecutedRolesDisplay.tsx` (NEW/MODIFY)  
**Status**: Ready  
**Dependencies**: `src/types/index.ts`  
**Complexity**: Low

Display in run details:
```
Last executed with:
  Builder: Claude (claude-builder-v1)
  Critic: Expert Review (expert-critic-v2)
  Judge: Strict Standards (strict-judge-v1)
```

**Acceptance Criteria**:
- [ ] Shows builder name/id if set
- [ ] Shows critic name/id if set
- [ ] Shows judge name/id if set
- [ ] Handles missing roles gracefully

---

## Phase 7: Integration & Refinement (2 days)

### Task 7.1: Remove Mock Data
**File**: `src/utils/mockData.ts` (MODIFY or DELETE)  
**Status**: Ready  
**Dependencies**: None  
**Complexity**: Low

Option 1: Keep for dev testing
```typescript
export const DEV_generateMockRuns = (count: number) => { /* ... */ };
// Mark with @deprecated comment
// Only import in development mode
```

Option 2: Delete completely

**Acceptance Criteria**:
- [ ] Mock data not used in production
- [ ] Removed from build bundle (tree-shake)
- [ ] Development testing still possible

### Task 7.2: Add Error Boundary
**File**: `src/components/ErrorBoundary.tsx` (NEW)  
**Status**: Ready  
**Dependencies**: `src/types/index.ts`  
**Complexity**: Low

Features:
- Catch runtime errors
- Display error message
- Retry button
- Error logging to backend
- Prevent app crash

**Acceptance Criteria**:
- [ ] Catches React errors
- [ ] Shows fallback UI
- [ ] Provides retry button
- [ ] Logs errors to backend

### Task 7.3: Add Loading Skeletons
**File**: `src/components/Skeleton.tsx` (NEW)  
**Status**: Ready  
**Dependencies**: None  
**Complexity**: Low

Create reusable skeleton loaders:
- RunListSkeleton
- RunDetailsSkeleton
- RoleSelectorSkeleton

**Acceptance Criteria**:
- [ ] Skeleton components render
- [ ] Match content dimensions
- [ ] Smooth animation

### Task 7.4: Add Toast Notifications
**File**: `src/services/notificationService.ts` (NEW)  
**Status**: Ready  
**Dependencies**: `src/types/index.ts`  
**Complexity**: Low

```typescript
export const notificationService = {
  success: (message: string) => { /* ... */ },
  error: (message: string) => { /* ... */ },
  warning: (message: string) => { /* ... */ },
  info: (message: string) => { /* ... */ },
};
```

Use for:
- Command execution started
- Sync status changes
- Connection status changes
- Errors

**Acceptance Criteria**:
- [ ] Shows toast notifications
- [ ] Auto-dismisses after 3 seconds
- [ ] Stack multiple toasts
- [ ] Different styles per type

### Task 7.5: Environment Configuration
**File**: `src/config.ts` (NEW)  
**Status**: Ready  
**Dependencies**: None  
**Complexity**: Low

```typescript
export const config = {
  API_BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  WS_URL: import.meta.env.VITE_WS_URL || 'ws://localhost:3000',
  TOKEN_REFRESH_INTERVAL: 5 * 60 * 1000,
  SYNC_INTERVAL: 30 * 1000,
  MAX_LOCAL_RUNS: 100,
  WS_RECONNECT_BACKOFF_MAX: 10000,
};
```

**File**: `.env.example` (NEW)
```
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
```

**Acceptance Criteria**:
- [ ] Environment variables configurable
- [ ] Defaults provided
- [ ] Used throughout codebase

### Task 7.6: Update Build Configuration
**File**: `vite.config.ts` (MODIFY)  
**Status**: Ready  
**Dependencies**: None  
**Complexity**: Low

- Add environment variable handling
- Ensure tree-shaking removes mock data
- Add source maps (dev only)
- Configure CORS proxy if needed

**Acceptance Criteria**:
- [ ] Build passes: `npm run build`
- [ ] No TypeScript errors
- [ ] Bundle size reasonable

### Task 7.7: Development Tools
**File**: `src/services/devTools.ts` (NEW)  
**Status**: Ready  
**Dependencies**: Various  
**Complexity**: Low

For development/testing only (not in production):
```typescript
if (import.meta.env.DEV) {
  window.__devTools__ = {
    loadMockData: () => { /* ... */ },
    resetDatabase: async () => { /* ... */ },
    simulateNetworkError: () => { /* ... */ },
    simulateWSDisconnect: () => { /* ... */ },
  };
}
```

**Acceptance Criteria**:
- [ ] Available in dev mode only
- [ ] Loaded on window object
- [ ] Useful for testing

---

## Phase 8: Testing & Documentation (2 days)

### Task 8.1: Create Unit Tests
**Files**: `src/**/__tests__/*.test.ts`  
**Status**: Ready  
**Dependencies**: Each service/hook  
**Complexity**: Medium

Test files needed:
- `src/services/__tests__/apiClient.test.ts`
- `src/services/__tests__/authAPI.test.ts`
- `src/store/__tests__/authStore.test.ts`
- `src/hooks/__tests__/useAPI.test.ts`
- `src/hooks/__tests__/useWebSocket.test.ts`

**Acceptance Criteria**:
- [ ] Unit tests for all services
- [ ] API client retry logic tested
- [ ] Auth flow tested
- [ ] WebSocket reconnection tested
- [ ] Tests pass: `npm test`

### Task 8.2: Create Documentation Files
**Files**:
- `docs/BACKEND_INTEGRATION.md` - API contract
- `docs/WEBSOCKET_PROTOCOL.md` - WS message format
- `docs/AUTHENTICATION.md` - Auth flow diagram
- `docs/PERSISTENCE.md` - Data sync strategy
- `docs/DEVELOPMENT.md` - Local setup
- `docs/MIGRATION.md` - v0.1 to v1.0 migration

**Acceptance Criteria**:
- [ ] All backend endpoints documented
- [ ] WebSocket messages specified
- [ ] Auth flow diagrammed
- [ ] Local dev setup instructions clear
- [ ] Migration path documented

### Task 8.3: Create Migration Guide
**File**: `MIGRATION_V1.md`  
**Status**: Ready  
**Dependencies**: All changes  
**Complexity**: Low

Document:
- Breaking changes from v0.1
- Environment setup needed
- localStorage schema changes
- API endpoint changes
- WebSocket URL changes

**Acceptance Criteria**:
- [ ] Clear breaking changes listed
- [ ] Migration steps provided
- [ ] Rollback procedure documented

---

## Implementation Sequence & Dependencies

```
Day 1-2 (Phase 1):
  ✓ Extend types (src/types/index.ts)

Day 2-4 (Phase 2):
  → apiClient.ts (depends on types)
  → runAPI.ts (depends on apiClient)

Day 4-6 (Phase 3):
  → authStore.ts (depends on types)
  → authAPI.ts (depends on apiClient)
  → LoginPage.tsx (depends on authStore, authAPI)
  → ProtectedRoute.tsx (depends on authStore)
  → App.tsx (depends on LoginPage, ProtectedRoute)

Day 6-8 (Phase 4):
  → wsClient.ts (depends on types)
  → wsStore.ts (depends on types)
  → useWebSocket.ts (depends on wsClient, wsStore)
  → useAPI.ts (modify, depends on runAPI, wsClient)
  → Dashboard.tsx (modify, remove polling, use useWebSocket)

Day 8-10 (Phase 5):
  → localStorage.ts (depends on types)
  → syncService.ts (depends on localStorage, runAPI)
  → runStore.ts (modify, depends on syncService)
  → useAppInitialization.ts (depends on all)
  → App.tsx (modify, add unload handler)

Day 10-12 (Phase 6):
  → roleStore.ts (depends on types)
  → RoleSelector.tsx (depends on roleStore)
  → useRoles.ts (depends on roleStore)
  → CommandPanel.tsx (modify, add RoleSelector)

Day 12-14 (Phase 7):
  → Remove/modify mockData.ts
  → ErrorBoundary.tsx
  → Skeleton.tsx
  → notificationService.ts
  → config.ts
  → devTools.ts
  → vite.config.ts (modify)

Day 14-15 (Phase 8):
  → Unit tests
  → Documentation
  → Migration guide
```

**Critical Path** (longest dependency chain):
1. types.ts
2. apiClient.ts → runAPI.ts → useAPI.ts
3. authStore.ts → authAPI.ts → LoginPage.tsx → App.tsx
4. App.tsx → Dashboard.tsx → wsClient.ts, useWebSocket.ts
5. syncService.ts → runStore.ts initialization

---

## Acceptance Criteria Checklist

### Build & TypeScript
- [ ] `npm run build` passes without errors
- [ ] No TypeScript compilation errors
- [ ] No ESLint warnings (strict mode)
- [ ] Bundle size reasonable (<500KB gzipped)

### API Integration
- [ ] All HTTP requests include Authorization header
- [ ] 401 responses trigger token refresh
- [ ] Retry logic works (3 attempts)
- [ ] Network errors handled gracefully
- [ ] Error responses standardized

### Authentication
- [ ] Login page renders correctly
- [ ] Email/password form validates
- [ ] Token stored in localStorage
- [ ] Protected routes work
- [ ] Logout clears session
- [ ] Token auto-refresh before expiry
- [ ] Mobile responsive login

### WebSocket
- [ ] WebSocket connects with token
- [ ] Run progress updates in real-time
- [ ] Phase changes reflected immediately
- [ ] Reconnection works after disconnect
- [ ] Connection status shown in Header
- [ ] Max 10 reconnect attempts
- [ ] Exponential backoff working

### Persistence
- [ ] Runs loaded from backend on app start
- [ ] localStorage fallback if offline
- [ ] Sync happens every 30 seconds
- [ ] No data loss on page reload
- [ ] Runs survive browser restart (localStorage)
- [ ] Max 100 runs stored locally

### Role Selection
- [ ] Role selector shows available agents
- [ ] User can select builders/critics/judges
- [ ] Selection passed to API call
- [ ] Executed roles displayed in UI
- [ ] RoleSelector hidden until command clicked
- [ ] Mobile responsive role selector

### UI/UX
- [ ] No TypeScript errors
- [ ] All mocks removed from production
- [ ] Error boundary catches crashes
- [ ] Loading states show skeletons
- [ ] Toast notifications appear for events
- [ ] Mobile responsive maintained
- [ ] Dark theme consistent
- [ ] Accessibility improved (ARIA, labels)

### Testing
- [ ] Unit tests for key services
- [ ] Integration tests for auth flow
- [ ] WebSocket tests with mock server
- [ ] Test coverage >70% for critical paths

### Documentation
- [ ] BACKEND_INTEGRATION.md complete
- [ ] WEBSOCKET_PROTOCOL.md complete
- [ ] AUTHENTICATION.md with flow diagram
- [ ] PERSISTENCE.md with sync strategy
- [ ] DEVELOPMENT.md with local setup
- [ ] MIGRATION.md with breaking changes

---

## Risk Management

### High Risk Items
1. **WebSocket stability** - Reconnection logic complex
   - Mitigation: Thorough testing with network failures
   
2. **Auth token refresh** - Timing critical
   - Mitigation: Unit tests for edge cases
   
3. **Data sync conflicts** - Offline/online transitions
   - Mitigation: Clear sync status tracking, manual refresh

4. **Backend availability** - Development dependency
   - Mitigation: Mock mode with dev tools for testing

### Medium Risk Items
1. **Performance with large run history**
   - Mitigation: Limit localStorage to 100 runs, pagination
   
2. **Browser storage quota exceeded**
   - Mitigation: Error handling, clear old runs
   
3. **Token expiry during long operations**
   - Mitigation: Refresh before expiry + handle 401

### Low Risk Items
1. **Component prop changes** - Refactoring low complexity
   - Mitigation: TypeScript catches most issues
   
2. **localStorage key collisions** - Using prefixes
   - Mitigation: Version in key names

---

## Success Metrics

### Code Quality
- [x] TypeScript strict mode compliance
- [x] No console errors in production
- [x] <3 second page load time
- [x] WebSocket latency <100ms

### Functionality
- [x] All 5 issues resolved
- [x] 100% backend API endpoints working
- [x] Real-time updates responsive
- [x] Offline mode functional

### User Experience
- [x] Login flow smooth
- [x] Role selection intuitive
- [x] Error messages helpful
- [x] Loading states clear

### Reliability
- [x] WebSocket reconnection stable
- [x] Auth token refresh reliable
- [x] Data sync consistent
- [x] No data loss scenarios

---

## Deployment Checklist

Before going live:
- [ ] Backend API all endpoints operational
- [ ] WebSocket server configured and tested
- [ ] Database ready for persistence
- [ ] HTTPS/WSS configured on production
- [ ] CORS settings correct
- [ ] Rate limiting configured
- [ ] Error logging to backend working
- [ ] Analytics tracking in place
- [ ] Backup/restore procedures tested
- [ ] Load testing completed
- [ ] Security audit passed
- [ ] Performance profiling done
- [ ] Monitoring/alerting setup
- [ ] Rollback procedure tested

---

## Timeline Summary

| Phase | Duration | Start | End |
|-------|----------|-------|-----|
| 1. Types & Setup | 2d | Day 1 | Day 2 |
| 2. API Client | 2-3d | Day 2 | Day 4 |
| 3. Authentication | 2-3d | Day 4 | Day 6 |
| 4. WebSocket | 2-3d | Day 6 | Day 8 |
| 5. Persistence | 2-3d | Day 8 | Day 10 |
| 6. Role Selection | 2d | Day 10 | Day 12 |
| 7. Integration | 2d | Day 12 | Day 14 |
| 8. Testing/Docs | 2d | Day 14 | Day 15 |
| **Total** | **28-40h** | | |

---

## Next Steps

1. **Review this plan** with team
2. **Verify backend availability** - All endpoints ready?
3. **Setup development environment** - .env files configured?
4. **Begin Phase 1** - Extend type definitions
5. **Track progress** - Mark tasks complete as implemented

---

**Ready to begin implementation? Start with Phase 1: Type Definitions.**
