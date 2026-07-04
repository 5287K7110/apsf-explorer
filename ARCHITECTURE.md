# APSF Explorer v1.0 Architecture Document

**Version**: 1.0 (Target)  
**Status**: Design Specification  
**Last Updated**: 2026-07-04

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Layers](#architecture-layers)
3. [Data Flow](#data-flow)
4. [State Management](#state-management)
5. [API Contract](#api-contract)
6. [WebSocket Protocol](#websocket-protocol)
7. [Authentication Flow](#authentication-flow)
8. [Data Persistence](#data-persistence)
9. [Component Hierarchy](#component-hierarchy)
10. [Error Handling](#error-handling)
11. [Performance Optimizations](#performance-optimizations)
12. [Security Considerations](#security-considerations)

---

## System Overview

### v0.1 Architecture (Current - Mock)
```
┌─────────────────────────────────────────────┐
│           React Components                   │
│  (Dashboard, CommandPanel, etc.)             │
│                                              │
│  useAPI Hook → setTimeout (mock)             │
│  useRunStore → generateMockRuns()            │
└─────────────────────────────────────────────┘
         │
         └─→ Session Storage Only
         └─→ No Auth
         └─→ Polling Simulation
         └─→ No Role Selection
```

### v1.0 Architecture (Target - Real Backend)
```
┌──────────────────────────────────────────────────────┐
│              React Frontend Layer                     │
│  (Dashboard, LoginPage, RoleSelector, etc.)          │
├──────────────────────────────────────────────────────┤
│              State Management (Zustand)              │
│  ┌─────────────────────────────────────────────────┐ │
│  │ useAuthStore (User, Token, Auth Status)        │ │
│  │ useRunStore (Runs, Filters, UI State)          │ │
│  │ useRoleStore (Available Roles, Selections)     │ │
│  │ useWSStore (Connection Status, Messages)       │ │
│  └─────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────┤
│              Services Layer                          │
│  ┌──────────────────┐  ┌────────────────────────┐   │
│  │ HTTP Services    │  │ Real-time Services     │   │
│  ├──────────────────┤  ├────────────────────────┤   │
│  │ APIClient        │  │ WSClient               │   │
│  │ AuthAPI          │  │ Sync Service           │   │
│  │ RunAPI           │  │ LocalStorage Service   │   │
│  └──────────────────┘  └────────────────────────┘   │
├──────────────────────────────────────────────────────┤
│              Backend API & WebSocket                 │
│  ┌──────────────┐  ┌────────────────────────────┐   │
│  │ REST API     │  │ WebSocket Server           │   │
│  │ /api/...     │  │ ws://backend/ws/runs/:id   │   │
│  └──────────────┘  └────────────────────────────┘   │
├──────────────────────────────────────────────────────┤
│              Backend Services                        │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │ Auth Service │  │ APSF CLI/API │                 │
│  └──────────────┘  └──────────────┘                 │
├──────────────────────────────────────────────────────┤
│              Persistent Storage                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ Browser: localStorage (100 runs max)         │   │
│  │ Server: Database (full run history)          │   │
│  └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

---

## Architecture Layers

### Layer 1: UI/Components
**Responsibility**: Render and user interaction  
**Technologies**: React 18, Lucide Icons, Tailwind CSS

**Key Components**:
- `LoginPage` - Authentication UI
- `Dashboard` - Main application layout
- `CommandPanel` - Run control buttons
- `RoleSelector` - Agent selection UI
- `Header` - Connection status indicator
- `Sidebar` - Run list and filtering
- `PhaseIndicator` - Current phase display
- `LogViewer` - Run output logs

**Design Principle**: Stateless components, all state in Zustand stores

### Layer 2: React Hooks (Custom)
**Responsibility**: Bridge between components and services  
**Technologies**: React Hooks, Zustand selectors

**Key Hooks**:
- `useAPI()` - Execute commands, call API
- `useAuth()` - Access auth state, login/logout
- `useRunStore()` - Access/modify run data
- `useRoleStore()` - Access/modify role selections
- `useWebSocket()` - Real-time updates
- `useRoles()` - Fetch and manage agent roles
- `useAppInitialization()` - Bootstrap app

**Design Principle**: Hooks are thin wrappers around services + stores

### Layer 3: State Management
**Responsibility**: Centralized application state  
**Technology**: Zustand (lightweight, no boilerplate)

**Stores**:

#### `useAuthStore`
```typescript
State:
  - user: AuthUser | null
  - token: AuthToken | null
  - isAuthenticated: boolean
  - isLoading: boolean
  - error: APIError | null

Actions:
  - login(email, password): Promise<void>
  - logout(): void
  - refreshToken(): Promise<boolean>
  - checkAuthStatus(): Promise<boolean>
  - setToken(token): void
  - clearError(): void

Persistence:
  - Token stored in localStorage
  - Auto-restore on app load
  - Auto-refresh before expiry
```

#### `useRunStore`
```typescript
State:
  - runs: Run[]
  - activeRunId: string | null
  - selectedRunId: string | null
  - filter: { status?, domain?, phase? }
  - sidebarOpen: boolean
  - expandedPhases: Set<string>
  - expandedLogs: boolean

Actions:
  - setRuns(runs): void
  - addRun(run): void
  - updateRun(runId, updates): void
  - updateRunPhase(runId, phase, progress): void
  - markRunSuccess(runId): void
  - markRunFailed(runId, error): void
  - getFilteredRuns(): Run[]

Initialization:
  - Populated by useAppInitialization()
  - Loaded from SyncService
```

#### `useRoleStore`
```typescript
State:
  - availableBuilders: Agent[]
  - availableCritics: Agent[]
  - availableJudges: Agent[]
  - selectedBuilderId?: string
  - selectedCriticId?: string
  - selectedJudgeId?: string
  - isLoading: boolean
  - error: APIError | null

Actions:
  - fetchAvailableRoles(): Promise<void>
  - selectBuilder(id): void
  - selectCritic(id): void
  - selectJudge(id): void
  - clearSelections(): void
  - getSelectedRoles(): RoleSelection
```

#### `useWSStore`
```typescript
State:
  - connectionsByRunId: Map<string, ConnectionStatus>
  - lastMessageTimestamp: Map<string, number>
  - pendingMessages: Map<string, WSMessage[]>
  - connectionErrors: Map<string, APIError | null>

Actions:
  - connectToRun(runId): void
  - disconnectFromRun(runId): void
  - getRunConnectionStatus(runId): ConnectionStatus
  - recordMessage(runId, msg): void
  - clearError(runId): void
```

### Layer 4: Services (Business Logic)
**Responsibility**: API calls, WebSocket, persistence  
**Technologies**: Fetch API, WebSocket API, localStorage

**Service Classes**:

#### `APIClient` (src/services/apiClient.ts)
```typescript
Purpose: Base HTTP client with auth, retry, error handling

Key Methods:
  - static setBaseURL(url: string)
  - static setAuthToken(token: AuthToken)
  - static async request<T>(config: APIRequestConfig): Promise<T>
  - static getAuthHeader(): string
  - static async refreshTokenIfNeeded(): Promise<boolean>

Features:
  - Automatically injects Authorization header
  - Retries on network errors (3 attempts)
  - Refreshes token on 401
  - Standardizes error responses
  - Logs requests/responses in dev mode
  - Handles timeouts (30 seconds default)

Error Handling:
  - Network errors: retry with exponential backoff
  - 401: attempt token refresh, then retry
  - 403: redirect to login (permission denied)
  - 4xx (non-401): fail immediately (validation error)
  - 5xx: retry once, then fail
```

#### `AuthAPI` (src/services/authAPI.ts)
```typescript
Purpose: Authentication endpoint calls (no auth required)

Key Methods:
  - static async login(credentials): Promise<AuthToken>
  - static async refresh(refreshToken): Promise<AuthToken>
  - static async logout(): Promise<void>
  - static async validateToken(): Promise<AuthUser>

Backend Endpoints:
  - POST /api/auth/login
  - POST /api/auth/refresh
  - POST /api/auth/logout
  - GET /api/auth/me
```

#### `RunAPI` (src/services/runAPI.ts)
```typescript
Purpose: Run management API calls (auth required)

Key Methods:
  - static async listRuns(filters?): Promise<Run[]>
  - static async getRunDetail(id): Promise<Run>
  - static async createRun(domain, description): Promise<Run>
  - static async executeCommand(runId, command, roles?): Promise<CommandResult>
  - static async cancelRun(id): Promise<boolean>
  - static async getRoles(): Promise<RoleSelection>

Backend Endpoints:
  - GET /api/runs
  - GET /api/runs/:id
  - POST /api/runs
  - DELETE /api/runs/:id
  - POST /api/runs/:id/plan
  - POST /api/runs/:id/build
  - POST /api/runs/:id/review
  - POST /api/runs/:id/judge
  - POST /api/runs/:id/retry
  - GET /api/roles/builders
  - GET /api/roles/critics
  - GET /api/roles/judges
```

#### `WSClient` (src/services/wsClient.ts)
```typescript
Purpose: WebSocket connection management

Key Methods:
  - constructor(runId: string, onMessage: (msg: WSMessage) => void)
  - async connect(): Promise<void>
  - disconnect(): void
  - private handleMessage(event): void
  - private attemptReconnect(): void
  - private sendHeartbeat(): void

Features:
  - Persistent connection per run
  - Auto-reconnect with exponential backoff
  - Heartbeat/ping-pong every 30 seconds
  - Message queue during disconnection
  - Validates WebSocket messages
  - Logs connection state changes

Connection URL: ws://backend/ws/runs/:runId?token=JWT

Reconnection Strategy:
  - Attempt 1: Wait 1 second
  - Attempt 2: Wait 2 seconds
  - Attempt 3: Wait 4 seconds
  - ...exponential backoff...
  - Attempt 10: Wait 10 seconds
  - Give up after 10 failed attempts
  - Notify user if reconnection failing
```

#### `LocalStorageService` (src/services/localStorage.ts)
```typescript
Purpose: Browser storage access with versioning

Key Methods:
  - static getRuns(): Run[]
  - static setRuns(runs): void
  - static updateRun(run): void
  - static getAuthToken(): AuthToken | null
  - static setAuthToken(token): void
  - static getUserPreferences(userId): UserPreferences
  - static setUserPreferences(userId, prefs): void
  - static getSyncStatus(): Map<string, SyncStatus>
  - static clearAll(): void

Storage Schema v1:
  apsf_runs_v1: Run[] (max 100)
  apsf_auth_token: AuthToken
  apsf_user_prefs_{userId}: UserPreferences
  apsf_sync_status: Map<runId, status>

Limits:
  - Max 100 runs stored
  - FIFO removal of oldest runs
  - Total size limit: 5MB (browser default)
```

#### `SyncService` (src/services/syncService.ts)
```typescript
Purpose: Bi-directional sync between localStorage and backend

Key Methods:
  - static async initializeData(): Promise<Run[]>
  - static async startPeriodicSync(interval?): void
  - static async syncPendingRuns(): Promise<boolean>
  - static async saveLocally(runs): void
  - static getOfflineMode(): boolean
  - static setOfflineMode(offline): void

Sync Strategy:
  1. On app load: Try backend, fallback to localStorage
  2. Periodically (every 30s): Sync pending runs
  3. Before unload: Save to localStorage
  4. On reconnection: Merge offline changes

Handling Conflicts:
  - Server-side wins on timestamp mismatch
  - Client-side changes queued as 'pending'
  - Manual sync button for user control
```

### Layer 5: External Systems
**Responsibility**: Backend APIs and services  
**Technologies**: HTTP/REST, WebSocket

**Backend API Server** (`http://localhost:3000`)
- Authentication endpoints
- Run management endpoints
- Role/agent discovery

**WebSocket Server** (`ws://localhost:3000`)
- Real-time run updates
- Progress tracking
- Phase completion notifications

---

## Data Flow

### User Authentication Flow

```
1. App Startup
   ├─ Check localStorage for token
   ├─ If token exists:
   │  ├─ Call GET /api/auth/me to validate
   │  ├─ If valid: Set user in authStore
   │  └─ If expired: Attempt refresh with POST /api/auth/refresh
   └─ If no token: Redirect to LoginPage

2. User Logs In
   ├─ User enters email/password on LoginPage
   ├─ POST /api/auth/login
   ├─ Receive accessToken + refreshToken
   ├─ Store token in:
   │  ├─ authStore (in-memory)
   │  └─ localStorage (persistent)
   └─ Redirect to Dashboard

3. Subsequent Requests
   ├─ APIClient adds Authorization header from authStore.token
   ├─ If 401 response:
   │  ├─ POST /api/auth/refresh with refreshToken
   │  ├─ Receive new accessToken
   │  ├─ Update authStore and localStorage
   │  └─ Retry original request
   └─ Continue

4. Token Expiry Management
   ├─ Set expiry timer: expiresAt - 5 minutes
   ├─ On timer fire: POST /api/auth/refresh
   ├─ Get new token, restart timer
   └─ Repeat cycle

5. User Logs Out
   ├─ POST /api/auth/logout (optional backend cleanup)
   ├─ Clear authStore
   ├─ Clear localStorage
   ├─ Close WebSocket connections
   └─ Redirect to LoginPage
```

### Run Execution Flow

```
1. User Clicks "Build" in CommandPanel
   ├─ Show RoleSelector modal if enabled
   ├─ User selects Builder, Critic, Judge
   └─ User clicks "Confirm"

2. Confirm Command Execution
   ├─ Update runStore: status = 'running'
   ├─ Connect WebSocket to ws://backend/ws/runs/:runId
   ├─ POST /api/runs/:id/build with { roles: {...} }
   └─ Receive CommandResult { success, runId, message }

3. Monitor Real-time Updates via WebSocket
   ├─ Receive PROGRESS_UPDATE { progress: 25, phase: 'building' }
   │  └─ Update runStore via useAPI callback
   ├─ Receive PROGRESS_UPDATE { progress: 50, phase: 'building' }
   │  └─ Update runStore
   ├─ Receive PROGRESS_UPDATE { progress: 75, phase: 'building' }
   │  └─ Update runStore
   └─ Receive PHASE_COMPLETE { phase: 'building', duration: 15000 }
      └─ Mark phase complete in runStore

4. Run Completes
   ├─ Receive RUN_STATUS_CHANGE { status: 'success' }
   ├─ Update runStore: status = 'success', progress = 100
   ├─ Close WebSocket
   ├─ Save run to localStorage (via SyncService)
   └─ Show success toast

5. On Failure
   ├─ Receive ERROR_OCCURRED { error: {...} }
   ├─ Update runStore: status = 'failed'
   ├─ Display error in ErrorDisplay component
   ├─ Save to localStorage
   └─ Show retry button
```

### Data Persistence Flow

```
1. App Initialization
   ├─ Check if online (navigator.onLine)
   ├─ If yes:
   │  ├─ GET /api/runs from backend
   │  └─ Merge with localStorage
   └─ If no:
      └─ Load from localStorage (offline mode)

2. During Session
   ├─ useRunStore updates automatically
   ├─ Every command execution:
   │  └─ Add run to localStorage
   └─ Periodic sync (every 30s):
      ├─ Find runs with status 'pending'
      ├─ POST each to /api/runs/:id/sync
      └─ Update sync status in localStorage

3. Before Page Unload
   ├─ beforeunload event fires
   ├─ Save all runs to localStorage
   └─ Close connections

4. Page Reload
   ├─ Load localStorage
   ├─ Fetch from backend (merge)
   └─ Continue session

5. Sync Conflict Resolution
   ├─ Server-side version wins if newer
   ├─ Client-side queued as 'pending'
   ├─ Manual refresh button available
   └─ Notification if sync fails
```

### WebSocket Message Flow

```
1. Connection Handshake
   Client → Server: CONNECT { token: JWT, runId: string }
   Server → Client: CONNECTION_ESTABLISHED { connectionId: string }

2. Periodic Heartbeat
   Every 30 seconds:
   Client → Server: PING { }
   Server → Client: PONG { }
   If no PONG in 5 seconds → Reconnect

3. Run Progress Update
   Server → Client: PROGRESS_UPDATE { 
     runId: string,
     progress: number (0-100),
     phase: Phase,
     status: RunStatus,
     timestamp: number
   }

4. Phase Completion
   Server → Client: PHASE_COMPLETE {
     runId: string,
     phase: Phase,
     duration: number (ms),
     timestamp: number
   }

5. Run Status Change
   Server → Client: RUN_STATUS_CHANGE {
     runId: string,
     status: RunStatus,
     timestamp: number
   }

6. Log Entry
   Server → Client: LOG_ENTRY {
     runId: string,
     logLine: string,
     timestamp: number
   }

7. Error Occurred
   Server → Client: ERROR_OCCURRED {
     runId: string,
     error: { code: string, message: string },
     timestamp: number
   }

8. Disconnection
   Client:
   ├─ Detects close event
   ├─ Queue pending operations
   ├─ Attempt reconnect with backoff
   └─ Notify user after 10 failures
   
   Server:
   ├─ Cleanup connection
   └─ Allow reconnection within timeout window
```

---

## State Management

### State Tree Structure

```typescript
// useAuthStore
{
  user: {
    id: string,
    email: string,
    name: string,
    avatar?: string
  } | null,
  token: {
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
    expiresAt: number
  } | null,
  isAuthenticated: boolean,
  isLoading: boolean,
  error: APIError | null
}

// useRunStore
{
  runs: Run[],
  activeRunId: string | null,
  selectedRunId: string | null,
  filter: {
    status?: RunStatus,
    domain?: string,
    phase?: Phase
  },
  sidebarOpen: boolean,
  expandedPhases: Set<string>,
  expandedLogs: boolean
}

// useRoleStore
{
  availableBuilders: Agent[],
  availableCritics: Agent[],
  availableJudges: Agent[],
  selectedBuilderId?: string,
  selectedCriticId?: string,
  selectedJudgeId?: string,
  isLoading: boolean,
  error: APIError | null
}

// useWSStore
{
  connectionsByRunId: Map<string, 'connecting' | 'connected' | 'disconnected' | 'error'>,
  lastMessageTimestamp: Map<string, number>,
  pendingMessages: Map<string, WSMessage[]>,
  connectionErrors: Map<string, APIError | null>
}
```

### State Update Flow

```
Component User Interaction
    ↓
Event Handler (onClick, onChange, etc.)
    ↓
Service Call (APIClient.request, WSClient, etc.)
    ↓
Backend Response
    ↓
Update Zustand Store (setState)
    ↓
Component Re-render (via hook selector)
    ↓
DOM Update
```

### State Persistence Strategy

```
In-Memory (Zustand)
├─ Fast access
├─ Lost on refresh
└─ Source of truth during session

localStorage
├─ Persistent across reloads
├─ Limited to 5MB
├─ Max 100 runs stored
└─ Synced with in-memory state

Backend Database
├─ Persistent and authoritative
├─ Full run history
├─ Synced every 30 seconds
└─ Source of truth long-term
```

---

## API Contract

### Base Configuration
```typescript
Base URL: http://localhost:3000 (configurable via VITE_API_URL)
Authentication: Bearer token in Authorization header
Content-Type: application/json
Timeout: 30 seconds
Retry: 3 attempts on network errors
```

### Authentication Endpoints

#### POST /api/auth/login
```typescript
Request: {
  email: string,
  password: string
}

Response (200): {
  accessToken: string,
  refreshToken: string,
  expiresIn: number, // seconds
  expiresAt: number, // timestamp
  user: {
    id: string,
    email: string,
    name: string
  }
}

Errors:
  400: Invalid email/password format
  401: Incorrect credentials
  429: Too many login attempts
```

#### POST /api/auth/refresh
```typescript
Request: {
  refreshToken: string
}

Response (200): {
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  expiresAt: number
}

Errors:
  400: Invalid refresh token format
  401: Refresh token expired or invalid
```

#### POST /api/auth/logout
```typescript
Request: { }

Response (200): {
  success: true
}

Errors:
  400: No token provided
```

#### GET /api/auth/me
```typescript
Request: (no body, requires Authorization header)

Response (200): {
  id: string,
  email: string,
  name: string,
  avatar?: string
}

Errors:
  401: Token invalid or expired
  403: User account disabled
```

### Run Management Endpoints

#### GET /api/runs
```typescript
Query Parameters:
  ?status=running|success|failed
  ?domain=Frontend
  ?phase=planning|building|reviewing|judging
  ?limit=20
  ?offset=0

Response (200): {
  runs: Run[],
  total: number,
  hasMore: boolean
}

Errors:
  400: Invalid filter parameters
  401: Unauthorized
```

#### GET /api/runs/:id
```typescript
Path Parameters:
  id: string (run ID)

Response (200): Run

Errors:
  400: Invalid ID format
  401: Unauthorized
  404: Run not found
  403: Not owned by current user
```

#### POST /api/runs
```typescript
Request: {
  domain: string,
  description: string,
  parameters?: Record<string, any>
}

Response (201): Run

Errors:
  400: Missing required fields
  401: Unauthorized
  429: Rate limit exceeded
```

#### DELETE /api/runs/:id
```typescript
Path Parameters:
  id: string (run ID)

Response (200): {
  success: true
}

Errors:
  400: Invalid ID format
  401: Unauthorized
  404: Run not found
  403: Not owned by current user
  409: Run in progress, cannot delete
```

#### POST /api/runs/:id/plan
```typescript
Path Parameters:
  id: string (run ID)

Request: {
  roles?: {
    selectedBuilderId?: string,
    selectedCriticId?: string,
    selectedJudgeId?: string
  },
  parameters?: Record<string, any>
}

Response (202): {
  success: true,
  runId: string,
  message: string,
  timestamp: number,
  data?: { estimatedDuration?: number }
}

Errors:
  400: Invalid parameters
  401: Unauthorized
  404: Run not found
  409: Run not in correct state
  429: Rate limit exceeded
```

#### POST /api/runs/:id/build
```typescript
(Same as /plan)
```

#### POST /api/runs/:id/review
```typescript
(Same as /plan)
```

#### POST /api/runs/:id/judge
```typescript
(Same as /plan)
```

#### POST /api/runs/:id/retry
```typescript
(Same as /plan)
```

### Role Discovery Endpoints

#### GET /api/roles/builders
```typescript
Query Parameters:
  ?capability=code_generation
  ?limit=20

Response (200): Agent[]
// Where Agent = { id, name, role, description, capabilities, maxConcurrent, estimatedDuration }

Errors:
  400: Invalid query parameters
  401: Unauthorized
```

#### GET /api/roles/critics
```typescript
(Same format as /roles/builders)
```

#### GET /api/roles/judges
```typescript
(Same format as /roles/builders)
```

---

## WebSocket Protocol

### Connection
```
URL: ws://localhost:3000/ws/runs/:runId
Query Parameters: ?token=JWT_ACCESS_TOKEN

Headers:
  Sec-WebSocket-Key: [auto]
  Sec-WebSocket-Version: 13

Connection Upgrade:
  HTTP/1.1 101 Switching Protocols
  Upgrade: websocket
  Connection: Upgrade
```

### Message Format
```typescript
// All messages are JSON
interface WSMessage {
  type: WSMessageType,
  runId: string,
  timestamp: number,
  data: any
}

type WSMessageType = 
  | 'PROGRESS_UPDATE'
  | 'PHASE_COMPLETE'
  | 'RUN_STATUS_CHANGE'
  | 'LOG_ENTRY'
  | 'ERROR_OCCURRED'
  | 'CONNECTION_ESTABLISHED'
  | 'PING'
  | 'PONG'
```

### Message Specifications

#### PROGRESS_UPDATE (Server → Client)
```typescript
{
  type: 'PROGRESS_UPDATE',
  runId: string,
  timestamp: number,
  data: {
    progress: number, // 0-100
    phase: Phase,     // 'planning' | 'building' | 'reviewing' | 'judging'
    status: RunStatus, // 'running' | 'queued'
    message?: string
  }
}

Frequency: Every few seconds during execution
```

#### PHASE_COMPLETE (Server → Client)
```typescript
{
  type: 'PHASE_COMPLETE',
  runId: string,
  timestamp: number,
  data: {
    phase: Phase,
    duration: number, // milliseconds
    verdict?: VerdictType, // 'pass' | 'improve' | 'redesign' | 'blocker'
    summary?: string
  }
}

Frequency: Once per phase completion
```

#### RUN_STATUS_CHANGE (Server → Client)
```typescript
{
  type: 'RUN_STATUS_CHANGE',
  runId: string,
  timestamp: number,
  data: {
    status: RunStatus, // 'success' | 'failed' | 'cancelled'
    message?: string
  }
}

Frequency: When run completes
```

#### LOG_ENTRY (Server → Client)
```typescript
{
  type: 'LOG_ENTRY',
  runId: string,
  timestamp: number,
  data: {
    logLine: string,
    level?: 'info' | 'warn' | 'error'
  }
}

Frequency: Multiple times during execution
```

#### ERROR_OCCURRED (Server → Client)
```typescript
{
  type: 'ERROR_OCCURRED',
  runId: string,
  timestamp: number,
  data: {
    error: {
      code: string,
      message: string,
      details?: any
    },
    recoverable: boolean
  }
}

Frequency: When errors occur
```

#### CONNECTION_ESTABLISHED (Server → Client)
```typescript
{
  type: 'CONNECTION_ESTABLISHED',
  runId: string,
  timestamp: number,
  data: {
    connectionId: string,
    serverTime: number
  }
}

Frequency: Once on connection
```

#### PING (Server → Client, every 30s)
```typescript
{
  type: 'PING',
  runId: string,
  timestamp: number,
  data: {}
}

Expected Response: PONG (same structure)
Timeout: 5 seconds, reconnect if no PONG
```

---

## Authentication Flow

### Detailed Sequence Diagram

```
User                      Frontend                     Backend
 │                            │                            │
 ├─ Enters email/password ─→  │                            │
 │                            ├─ POST /api/auth/login ────→ │
 │                            │                            ├─ Validate credentials
 │                            │                            ├─ Generate JWT tokens
 │                            │ ← accessToken, expiresAt ← │
 │                            ├─ Store in localStorage   │
 │                            ├─ Store in authStore      │
 │ ← Redirected to Dashboard  │                            │
 │                            │                            │
 │ Clicks "Build" button    → │                            │
 │                            ├─ Add auth header          │
 │                            ├─ POST /api/runs/123/build ─→ │
 │                            │                            ├─ Check token validity
 │                            │ ← Command accepted ←       │
 │ Sees progress updating   ← ├─ Connect WebSocket        │
 │                            ├─ ws://backend/ws/runs/123  │
 │                            │                            ├─ Validate token
 │                            │ ← CONNECTION_ESTABLISHED ← │
 │                            │ ← PROGRESS_UPDATE (25%) ←  │
 │ Progress bar updates     ← │ ← PROGRESS_UPDATE (50%) ←  │
 │                            │ ← PROGRESS_UPDATE (75%) ←  │
 │                            │ ← RUN_STATUS_CHANGE ←      │
 │ Shows "Build Complete"   ← │                            │
 │                            │                            │
 │ After 24 hours (token exp) │                            │
 │ (User not active)        │                            │
 │ Clicks something        → │                            │
 │                            ├─ GET /api/runs (401)      │
 │                            ├─ POST /api/auth/refresh ──→ │
 │                            │                            ├─ Validate refresh token
 │                            │ ← new accessToken ←       │
 │                            ├─ Update authStore        │
 │                            ├─ Update localStorage      │
 │                            ├─ Retry original request   │
 │                            │ ← GET /api/runs OK ←      │
 │ Continues working       ← │                            │
 │                            │                            │
 │ Clicks "Logout"         → │                            │
 │                            ├─ POST /api/auth/logout ───→ │
 │                            │                            ├─ Invalidate refresh token
 │                            │ ← success ←               │
 │                            ├─ Clear localStorage       │
 │                            ├─ Clear authStore          │
 │ Redirected to Login      ← │                            │
```

### Token Refresh Strategy

```
On App Load:
  1. Load token from localStorage
  2. If token.expiresAt < now: Token expired
     a. Use refreshToken to get new token
     b. If refresh fails: Redirect to login
  3. If token.expiresAt > now: Token valid
     a. Calculate: timeUntilExpiry = token.expiresAt - now
     b. Set timer: timeUntilExpiry - 5 minutes
     c. On timer: Call refresh to get new token

On API Request:
  1. Check if token exists
  2. If not: Redirect to login
  3. If yes: Add "Authorization: Bearer token" header
  4. On 401 response:
     a. Attempt token refresh
     b. If successful: Retry request with new token
     c. If fails: Redirect to login

On User Action:
  1. User clicks logout button
  2. Call POST /api/auth/logout (optional)
  3. Clear token from localStorage
  4. Clear authStore
  5. Redirect to login
```

---

## Data Persistence

### Storage Architecture

```
┌────────────────────────────────────────────────────────┐
│                  In-Memory State                        │
│  useRunStore, useAuthStore, useRoleStore (Zustand)    │
└────────────────────────────────────────────────────────┘
           ↓ (synchronize)              ↓ (synchronize)
┌───────────────────────┐      ┌─────────────────────────┐
│    localStorage       │      │   Backend Database       │
│  (5MB limit)          │      │   (unlimited)            │
│  - 100 max runs       │      │   - Full history         │
│  - Lost on clear      │      │   - Source of truth      │
│  - Fast access        │      │   - Synced every 30s     │
└───────────────────────┘      └─────────────────────────┘
```

### Sync Lifecycle

```
App Initialization:
  1. Load localStorage
  2. Check online status
  3. If online:
     a. Fetch /api/runs
     b. Merge with localStorage
     c. Mark all as 'synced'
  4. If offline:
     a. Use localStorage only
     b. Mark all as 'pending'
  5. Populate useRunStore
  6. Start periodic sync (every 30s)

During Session:
  1. User creates/updates run
  2. Immediately save to localStorage
  3. Mark run as 'pending' if offline
  4. Periodic sync (every 30s):
     a. Find all 'pending' runs
     b. Try to POST to backend
     c. Update sync status
  5. Retry failed syncs on next cycle

Before Unload:
  1. beforeunload event fires
  2. Save useRunStore to localStorage
  3. Close connections

After Reconnection:
  1. Check online status
  2. If was offline, now online:
     a. Trigger immediate sync
     b. Fetch latest from backend
     c. Merge any conflicts
```

### Conflict Resolution

```
Conflict Scenario:
  - User offline, creates run locally
  - Time passes, backend has newer version
  - User comes back online
  - Sync detects: local.updatedAt < server.updatedAt

Resolution:
  1. Server version takes precedence
  2. Local unsaved changes queued as 'pending'
  3. User notified of conflict
  4. Manual merge option available
  5. Or: User can discard local, accept server

Prevention:
  1. Track run.syncedAt timestamp
  2. Compare versions before sync
  3. Log conflicts for debugging
```

---

## Component Hierarchy

```
App
├─ useAppInitialization (hook)
├─ ProtectedRoute (if authenticated)
│  └─ Dashboard
│     ├─ Header
│     │  ├─ Connection Status Indicator
│     │  └─ User Menu (Logout)
│     ├─ Sidebar
│     │  ├─ RunList (filtered)
│     │  └─ Filters
│     └─ MainContent
│        ├─ PhaseIndicator (current phase)
│        ├─ CommandPanel
│        │  ├─ Command Buttons
│        │  └─ RoleSelector (modal)
│        │     ├─ BuilderSelector
│        │     ├─ CriticSelector
│        │     └─ JudgeSelector
│        ├─ ACProgress (acceptance criteria)
│        ├─ DecisionFlow (verdicts)
│        ├─ LogViewer (output)
│        └─ Analytics (charts)
└─ LoginPage (if not authenticated)
   ├─ EmailInput
   ├─ PasswordInput
   ├─ LoginButton
   └─ ErrorDisplay
```

---

## Error Handling

### Error Categories

#### Network Errors
```typescript
Symptoms: fetch() throws NetworkError
User Impact: App can't communicate
Handling:
  1. Show "Connection lost" toast
  2. Retry with exponential backoff
  3. Fall back to localStorage (offline mode)
  4. Show manual refresh button
  5. Notify after 10 failed attempts
```

#### Authentication Errors
```typescript
Symptoms: 401 or 403 response

401 Unauthorized (Token invalid/expired):
  1. Attempt token refresh
  2. If successful: Retry request
  3. If fails: Redirect to login

403 Forbidden (Permission denied):
  1. Show error message
  2. Redirect to login
  3. Log incident
```

#### Validation Errors
```typescript
Symptoms: 400 Bad Request
User Impact: User provided invalid data
Handling:
  1. Display form errors
  2. Highlight invalid fields
  3. Don't retry (user must fix)
```

#### Server Errors
```typescript
Symptoms: 5xx Server Error
User Impact: Backend is broken
Handling:
  1. Show generic error message
  2. Retry (backend may be recovering)
  3. After 3 failed retries: Show "Server unavailable"
  4. Suggest contact support
```

### Error Boundary Pattern

```typescript
<ErrorBoundary>
  <Dashboard />
</ErrorBoundary>

Catches:
  - React rendering errors
  - Event handler errors (with wrapper)
  - Lifecycle errors

Displays:
  - Error message
  - Retry button
  - Contact support link

Does NOT catch:
  - Async promise rejections (use .catch())
  - Event listener errors (use try/catch in handlers)
```

### Error Standardization

```typescript
// All errors standardized to APIError
interface APIError {
  code: string,
  message: string,
  details?: Record<string, any>
}

Examples:
  { code: 'NETWORK_ERROR', message: 'Failed to connect to server' }
  { code: 'AUTH_FAILED', message: 'Invalid credentials' }
  { code: 'RUN_NOT_FOUND', message: 'Run with ID xxx not found' }
  { code: 'VALIDATION_ERROR', message: 'Invalid email format', details: { field: 'email' } }
  { code: 'INTERNAL_ERROR', message: 'Server error occurred' }
```

---

## Performance Optimizations

### Bundle Size Optimization
```typescript
1. Remove mock data generator from production:
   - Use tree-shaking with @deprecated comment
   - Or: Conditional import based on ENV

2. Code splitting by route:
   - LoginPage: Lazy load
   - Dashboard: Eager load (main route)

3. Dependencies:
   - Zustand: ~2KB (small state library)
   - Lucide: Icons on demand
   - Tailwind: Tree-shake unused styles
```

### Runtime Performance
```typescript
1. State Management:
   - Use Zustand selectors to minimize re-renders
   - const run = useRunStore(state => state.activeRun)
   - Avoid selecting entire store state

2. Rendering:
   - React.memo() for list items
   - useMemo() for expensive calculations
   - useCallback() for event handlers

3. API Calls:
   - Batch related requests
   - Use request deduplication
   - Cache GET responses (simple Map)

4. WebSocket:
   - Batch messages (don't update on every message)
   - Debounce progress updates (max 1/second)
   - Close connection when not needed

5. localStorage:
   - Limit to 100 runs (trim oldest)
   - Compress if needed
   - Access in useEffect, not render
```

### Network Optimization
```typescript
1. Request Compression:
   - gzip compression enabled on backend
   - Minimize JSON payload size

2. Caching:
   - Browser cache for static assets
   - ETag support for API responses
   - Simple in-memory cache for roles

3. Lazy Loading:
   - Load run details only when selected
   - Load logs on demand
   - Paginate large lists

4. WebSocket:
   - Single persistent connection per run
   - Message batching to reduce overhead
   - Close when run complete
```

---

## Security Considerations

### Authentication Security
```typescript
1. Token Storage:
   - Use localStorage (browser default)
   - Consider httpOnly cookies in future
   - Never store in plain JavaScript variable only

2. Token Refresh:
   - Use refreshToken to get new accessToken
   - Never expose refreshToken in localStorage API calls
   - Rotate token on each refresh

3. CSRF Protection:
   - Backend validates origin header
   - Use SameSite cookie attribute
   - Include CSRF token in POST requests (if needed)

4. Session Management:
   - Logout clears both accessToken and refreshToken
   - Server-side session invalidation
   - Timeout after inactivity (configurable)
```

### API Security
```typescript
1. HTTPS/TLS:
   - All API calls over HTTPS
   - WebSocket over WSS
   - No downgrade to HTTP

2. Authorization:
   - Every API call checked for valid token
   - User can only access own runs
   - Backend enforces permission checks

3. Input Validation:
   - Validate all form inputs
   - Sanitize user-provided strings
   - Use React's built-in XSS prevention

4. Error Messages:
   - Don't expose internal server details
   - Generic error messages for auth failures
   - Specific errors only for validation

5. Rate Limiting:
   - Backend implements rate limits
   - Show "Too many requests" message
   - Implement exponential backoff retry
```

### Data Security
```typescript
1. Sensitive Data:
   - Never log tokens to console (production)
   - Don't store passwords anywhere
   - Mask email in error messages when possible

2. localStorage:
   - Contains accessToken (acceptable risk)
   - SameSite cookies for refreshToken (future)
   - Clear on logout

3. WebSocket:
   - Validate token on connection
   - Use WSS in production
   - Validate message origin
```

### XSS Prevention
```typescript
1. React Built-in:
   - HTML content automatically escaped
   - Use dangerouslySetInnerHTML sparingly

2. URL Handling:
   - Validate redirect URLs
   - Only allow same-origin redirects

3. Event Handlers:
   - Validate all user input in handlers
   - Use event.preventDefault() when needed

4. Content Security Policy:
   - Implement CSP headers
   - Restrict script sources
```

---

## Monitoring & Debugging

### Development Tools
```typescript
window.__devTools__ = {
  loadMockData(): void,
  resetDatabase(): Promise<void>,
  simulateNetworkError(): void,
  simulateWSDisconnect(): void,
  inspectStore(): Store,
  exportLogs(): string
};
```

### Logging Strategy
```typescript
// Development: Verbose logging
if (import.meta.env.DEV) {
  console.log('[API]', method, endpoint, { body, response });
  console.log('[WS]', message.type, message.data);
  console.log('[Store]', actionName, before, after);
}

// Production: Error logging only
if (import.meta.env.PROD) {
  // Send errors to backend
  logErrorToBackend({ code, message, stack });
}
```

### Metrics to Track
```typescript
1. Authentication:
   - Login success/failure rate
   - Token refresh frequency
   - Average token lifetime

2. API Calls:
   - Response time by endpoint
   - Error rate by type
   - Retry frequency

3. WebSocket:
   - Connection uptime %
   - Reconnection frequency
   - Message latency
   - Dropped message count

4. User Interactions:
   - Command execution completion rate
   - Error recovery rate
   - Time from issue to resolution
```

---

## Deployment Considerations

### Environment Setup
```typescript
Development:
  API_URL: http://localhost:3000
  WS_URL: ws://localhost:3000
  DEBUG: true

Staging:
  API_URL: https://staging.api.example.com
  WS_URL: wss://staging.api.example.com
  DEBUG: false

Production:
  API_URL: https://api.example.com
  WS_URL: wss://api.example.com
  DEBUG: false
```

### CI/CD Pipeline
```
1. Code Commit
2. Run Tests
3. Build: `npm run build`
4. Lint: `npm run lint`
5. Type Check: `tsc`
6. Bundle Analysis: Check size limits
7. Security Scan: Check dependencies
8. Deploy to Staging
9. Smoke Tests
10. Deploy to Production
11. Monitor error rate (1 hour)
```

---

## Future Enhancements

### Phase 2 Features
- [ ] OAuth/SSO authentication
- [ ] Multi-user collaboration
- [ ] Run sharing/comments
- [ ] Advanced caching strategies
- [ ] Offline mode enhancements
- [ ] Performance monitoring dashboard
- [ ] A/B testing framework
- [ ] Advanced filtering/search
- [ ] Custom dashboards

### Phase 3 Features
- [ ] Multi-region deployment
- [ ] Database replication
- [ ] GraphQL API (alongside REST)
- [ ] Real-time collaboration
- [ ] Advanced audit logging
- [ ] Compliance features (SOC2, HIPAA)

---

## Conclusion

This architecture provides:
- **Scalability**: Clear separation of concerns
- **Maintainability**: Simple, understandable patterns
- **Reliability**: Error handling at every layer
- **Performance**: Optimizations throughout
- **Security**: Multiple layers of protection

The modular design allows for incremental improvements and feature additions without major refactoring.
