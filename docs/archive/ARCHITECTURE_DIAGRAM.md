# Execution Modes - Architecture Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Frontend / Client                         │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                    REST API / WebSocket
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                   Backend: Express.js                           │
│                                                                  │
│  ┌─────────────────────────────────────────────────────┐        │
│  │  Routes: backend/src/routes/runs.route.ts           │        │
│  │                                                      │        │
│  │  POST   /api/runs/:id/execute                       │        │
│  │  GET    /api/execution-modes                        │        │
│  │  POST   /api/execution-mode                         │        │
│  └────────────────────────┬────────────────────────────┘        │
│                           │                                      │
│  ┌────────────────────────▼────────────────────────────┐        │
│  │  ExecutionModeRouter                                │        │
│  │  backend/src/services/execution-mode-router.ts      │        │
│  │                                                      │        │
│  │  - setMode(mode)                                    │        │
│  │  - getConfig()                                      │        │
│  │  - getExecutor(request)                             │        │
│  │  - getAvailableModes()                              │        │
│  │  - detectCliAvailable()                             │        │
│  └──┬─────────────────────────────────────┬──────────┬─┘        │
│     │                                       │          │         │
│     │ CLI Available?                        │          │         │
│     │ ┌─────────┬─────────┬──────────┐    │          │         │
│     │ │                  │          │    │          │         │
└─────┼─▼────┬───▼──────┬──▼────────┬──────┼──────────┼────────┘
      │      │          │           │      │          │
      │      │          │           │      │          └─ API Key?
      │      │          │           │      │             │
      │      │          │           │      │             │
    No │  Yes│    Yes   │    Yes    │   No │           Yes│
      │      │          │           │      │             │
      │      │          │           │      │             │
    API │ CLI Available Decision Tree     │        For v2.0
      │      │          │           │      │        (Future)
      │      │          │           │      │
      │      ▼          │           │      │
      │  ┌──────────────┤           │      │
      │  │   CLI Tools  │           │      │
      │  │   Available? │           │      │
      │  └──────────────┘           │      │
      │           │                 │      │
      │       Yes │ No              │      │
      │           ▼                 │      │
      │       ┌────┬────────────┐   │      │
      │       │                 │   │      │
      │       ▼                 ▼   │      ▼
      │   ┌────────────────┐   ┌──────────────┐
      │   │  CLI-FULL      │   │  CLI-LITE    │
      │   │  Executor      │   │  Executor    │
      │   └────────────────┘   └──────────────┘
      │
      └─ ┌──────────────┐
         │ API Executor │ (v2.0)
         └──────────────┘


┌────────────────────────────────────────────────────────────────┐
│               Executor Layer                                    │
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────┐            │
│  │  CLIFullExecutor     │  │  CLILiteExecutor     │            │
│  │                      │  │                      │            │
│  │ Mode: cli-full       │  │ Mode: cli-lite       │            │
│  │ Artifacts: YES ✅    │  │ Artifacts: NO ❌     │            │
│  │ Permissions: Full    │  │ Permissions: Restr.  │            │
│  │ Timeout: 10min       │  │ Timeout: 5min        │            │
│  │ Max Turns: 10        │  │ Max Turns: 5         │            │
│  │                      │  │                      │            │
│  │ Spawns CLI process   │  │ Spawns CLI process   │            │
│  │ Captures output      │  │ Captures output      │            │
│  │ Detects artifacts    │  │ No file storage      │            │
│  │ Saves build.md       │  │ Streams via WS       │            │
│  │ Emits WebSocket      │  │ Emits WebSocket      │            │
│  └──────────────────────┘  └──────────────────────┘            │
│                                                                 │
│  ┌──────────────────────┐                                       │
│  │  APIExecutor (v2.0)  │                                       │
│  │                      │                                       │
│  │ Mode: api            │                                       │
│  │ Artifacts: Config    │                                       │
│  │ Permissions: Fine-grained                                   │
│  │ Timeout: 5min        │                                       │
│  │ Max Turns: 10        │                                       │
│  │                      │                                       │
│  │ Uses Anthropic API   │                                       │
│  │ Uses OpenAI API      │                                       │
│  │ Streaming responses  │                                       │
│  │ Optional artifacts   │                                       │
│  └──────────────────────┘                                       │
│                                                                 │
└────────────────────────────────────────────────────────────────┘


┌────────────────────────────────────────────────────────────────┐
│               CLI Process Management                            │
│                                                                 │
│   ┌─────────────────────────────────────────────┐              │
│   │  CLI: claude | codex | gemini               │              │
│   └────────────────┬────────────────────────────┘              │
│                    │                                           │
│          ┌─────────┼─────────┐                                 │
│          │                   │                                 │
│    CLI-FULL       CLI-LITE                                     │
│    Arguments:     Arguments:                                   │
│    - -p           - -p                                         │
│    - --tools      - --tools                                    │
│      Full list      Restricted                                 │
│    - --permission-mode  --permission-mode                      │
│      bypassPermissions  restrictive                            │
│    - --max-turns 10     --max-turns 5                          │
│    - timeout 10min      timeout 5min                           │
│          │                   │                                 │
│          └─────────┬─────────┘                                 │
│                    │                                           │
│           Tool Execution                                       │
│           - Bash                                               │
│           - Edit                                               │
│           - Glob                                               │
│           - Grep                                               │
│           - Read                                               │
│           - Write                                              │
│           - etc.                                               │
│                    │                                           │
│          ┌─────────┼─────────┐                                 │
│          │                   │                                 │
│    Artifact Detection   No Artifacts                           │
│    ↓                                                           │
│    Parse & Store                                              │
│    ↓                                                           │
│    Save to build.md                                           │
│                                                                │
│                                                                │
│          └─────────┬─────────┘                                 │
│                    │                                           │
│           WebSocket Events                                     │
│           - progress                                           │
│           - complete                                           │
│           - error                                              │
│                                                                │
└────────────────────────────────────────────────────────────────┘


┌────────────────────────────────────────────────────────────────┐
│               Storage Layer                                     │
│                                                                 │
│   CLI-FULL Mode:                                               │
│   ┌──────────────────────────────────────────────┐             │
│   │ runs/                                        │             │
│   │ └── {runId}/                                │             │
│   │     └── build.md    ← Artifacts saved here  │             │
│   │         (Execution log + artifact details)  │             │
│   └──────────────────────────────────────────────┘             │
│                                                                │
│   CLI-LITE Mode:                                              │
│   ┌──────────────────────────────────────────────┐             │
│   │ Memory Only                                 │             │
│   │ (No persistence)                            │             │
│   │ Results discarded after completion          │             │
│   └──────────────────────────────────────────────┘             │
│                                                                │
│   API Mode (v2.0):                                            │
│   ┌──────────────────────────────────────────────┐             │
│   │ Optional:                                   │             │
│   │ - Cloud storage                             │             │
│   │ - Database records                          │             │
│   │ - Archive system                            │             │
│   └──────────────────────────────────────────────┘             │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Request Flow Diagram

### CLI-FULL Mode

```
Request: POST /api/runs/run-1/execute
{ "mode": "cli-full", ... }
         │
         ▼
    Route Handler
    (runs.route.ts)
         │
         ▼
    ExecutionModeRouter
    .getExecutor(request)
         │
         ├─ mode === 'cli-full'?
         │  └─ YES
         │
         ▼
    CLIFullExecutor
    .execute(request)
         │
         ├─ Select CLI (claude/codex/gemini)
         │
         ├─ Build prompt
         │
         ├─ Spawn process with args
         │  └─ --permission-mode bypassPermissions
         │  └─ --max-turns 10
         │  └─ timeout: 10min
         │
         ├─ Handle stdout data
         │  ├─ Detect artifacts [ARTIFACT:xyz]
         │  └─ Emit WebSocket: progress
         │
         ├─ On process close (code=0)
         │  ├─ Save artifacts to build.md
         │  ├─ Create runs/{runId}/build.md
         │  └─ Emit WebSocket: complete
         │
         ▼
    Response 200 OK
    { status: 'executing', mode: 'cli-full' }
         │
         ▼
    Client receives WebSocket events:
    - progress: { message: '...' }
    - complete: { artifactCount: 5 }
```

---

### CLI-LITE Mode

```
Request: POST /api/runs/run-2/execute
{ "mode": "cli-lite", ... }
         │
         ▼
    Route Handler
    (runs.route.ts)
         │
         ▼
    ExecutionModeRouter
    .getExecutor(request)
         │
         ├─ mode === 'cli-lite'?
         │  └─ YES
         │
         ▼
    CLILiteExecutor
    .execute(request)
         │
         ├─ Select CLI (claude/codex/gemini)
         │
         ├─ Build prompt
         │
         ├─ Spawn process with args
         │  └─ --permission-mode restrictive
         │  └─ --max-turns 5
         │  └─ timeout: 5min
         │
         ├─ Handle stdout data
         │  └─ Emit WebSocket: progress
         │     (No artifact detection)
         │
         ├─ On process close (code=0)
         │  ├─ Discard output (no storage)
         │  ├─ No file written
         │  └─ Emit WebSocket: complete
         │
         ▼
    Response 200 OK
    { status: 'executing', mode: 'cli-lite' }
         │
         ▼
    Client receives WebSocket events:
    - progress: { message: '...' }
    - complete: { mode: 'cli-lite' }
    
    ✅ Results NOT saved
    ✅ Low cost
    ✅ Fast execution
```

---

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  Input                                                            │
│  ExecuteRequest {                                                 │
│    runId, command, provider, roles, goal,                         │
│    context, mode? (cli-full | cli-lite | api)                    │
│  }                                                                │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │ Mode Validation │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
    cli-full            cli-lite                api
        │                    │                    │
        ▼                    ▼                    ▼
  CLIFullExecutor   CLILiteExecutor         APIExecutor
        │                    │                    │
        │ spawn CLI          │ spawn CLI          │ HTTP request
        │ (full perms)       │ (restricted)       │ (future)
        │                    │                    │
        ▼                    ▼                    ▼
    Process               Process            API Server
    stdout ──────────────> stdout ──────────> Response
        │                    │                    │
        ├─ Detect artifacts  ├─ Stream only      ├─ Parse
        ├─ Parse             └─ No storage       ├─ Format
        ├─ Save to disk                          ├─ Return
        └─ Track                                 └─ Track
        │                    │                    │
        ▼                    ▼                    ▼
    build.md          In-Memory         (Future v2.0)
    (on disk)         (temporary)       (Configurable)
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                    ┌────────▼────────┐
                    │ WebSocket Events│
                    │                 │
                    │ - progress      │
                    │ - complete      │
                    │ - error         │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Client/UI      │
                    │  Real-time      │
                    │  Updates        │
                    └─────────────────┘
```

---

## Configuration Hierarchy

```
Environment Variables (.env)
         │
         ├─ EXECUTION_MODE = 'cli-full'  (default)
         │
         ▼
ExecutionModeRouter
(reads env variable)
         │
         ├─ Current Mode
         │
         ├─ Available Modes
         │  ├─ cli-full ✅
         │  ├─ cli-lite ✅
         │  └─ api 🔮
         │
         └─ Mode Configs
            ├─ cli-full
            │  ├─ timeout: 600000ms
            │  ├─ maxTurns: 10
            │  ├─ saveArtifacts: true
            │  └─ permissions: full
            │
            ├─ cli-lite
            │  ├─ timeout: 300000ms
            │  ├─ maxTurns: 5
            │  ├─ saveArtifacts: false
            │  └─ permissions: restricted
            │
            └─ api
               ├─ timeout: 300000ms
               ├─ maxTurns: 10
               ├─ saveArtifacts: true
               └─ permissions: api-based


Per-Request Override
         │
         └─ mode: 'cli-lite'  (overrides env)
            │
            ▼
        ExecuteRequest.mode
            │
            ▼
        Executor Selection
```

---

## Error Handling Flow

```
Request Received
         │
         ▼
    Validate Mode
    │
    ├─ Valid Mode?
    │  ├─ YES → Continue
    │  └─ NO  → Error: "Unknown execution mode"
    │
    ├─ CLI Available?
    │  ├─ YES → Continue
    │  └─ NO  → Error: "CLI not available"
    │
    └─ Executor Created?
       ├─ YES → Execute
       └─ NO  → Error: "Failed to create executor"


During Execution
         │
         ├─ Process Error?
         │  └─ YES → Emit: error event
         │
         ├─ Process Timeout?
         │  └─ YES → Kill process, Emit: error event
         │
         ├─ File Write Error?
         │  └─ YES → Log error, Continue
         │
         └─ Normal Completion?
            └─ YES → Emit: complete event


Error Response Format
{
  type: 'error',
  runId: 'run-123',
  data: {
    error: 'Error message',
    details?: { ... }
  }
}
```

---

## Module Dependencies

```
routes/runs.route.ts
    │
    ├─ import { ExecutionModeRouter }
    │  from '../services/execution-mode-router.js'
    │
    └─ ExecutionModeRouter
        │
        ├─ import { CLIFullExecutor }
        │  from '../executors/cli-full-executor.js'
        │
        ├─ import { CLILiteExecutor }
        │  from '../executors/cli-lite-executor.js'
        │
        ├─ import { APIExecutor }
        │  from '../executors/api-executor.js'
        │
        ├─ import { ExecutionMode, ExecutionModeConfig }
        │  from '../types/execution-mode.js'
        │
        └─ import { ExecuteRequest }
           from '../types/index.js'


All Executors
    │
    └─ extend EventEmitter
        │
        └─ emit('event', StreamEvent)
        └─ emit('error', StreamEvent)
```

