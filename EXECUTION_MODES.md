# APSF Explorer: Execution Modes Design

## Overview

This document describes the three execution modes for APSF Explorer Backend:

1. **CLI-FULL** (Default): Full execution with Artifact storage
2. **CLI-LITE**: Lightweight execution without Artifact storage
3. **API** (Future): Direct API calls without CLI installation

---

## Architecture

### Type Definitions

**File**: `backend/src/types/execution-mode.ts`

```typescript
export type ExecutionMode = 'cli-full' | 'cli-lite' | 'api';

export interface ExecutionModeConfig {
  mode: ExecutionMode;
  saveArtifacts: boolean;
  timeout: number;  // ms
  maxTurns: number;
}
```

**Configuration Defaults**:

| Mode | Save Artifacts | Timeout | Max Turns |
|------|----------------|---------|-----------|
| cli-full | ✅ Yes | 10min | 10 |
| cli-lite | ❌ No | 5min | 5 |
| api | ✅ Yes | 5min | 10 |

---

## Execution Modes

### 1. CLI-FULL (Default)

**Purpose**: Production mode with full artifact preservation

**Features**:
- ✅ Artifact 保存（build.md）
- ✅ 完全なツール出力
- ✅ 長時間実行対応（10分）
- ✅ Tool Output 完全記録

**Executor**: `CLIFullExecutor`

**Process**:
```
Request → CLI Spawn → Tool Execution → Artifact Detection → Save (build.md) → WebSocket
```

**File**: `backend/src/executors/cli-full-executor.ts`

```typescript
class CLIFullExecutor {
  // Spawns CLI process with full permissions
  // Saves artifacts to run directory
  // Records complete output
}
```

**Output Files**:
- `runs/{runId}/build.md` - Complete execution log with artifacts

---

### 2. CLI-LITE

**Purpose**: Cost-optimized lightweight mode

**Features**:
- ❌ Artifact 保存なし（低コスト）
- ✅ ツール実行制限（read-only）
- ✅ 短時間実行最適化（5分）
- ⚡ WebSocket リアルタイム配信のみ

**Executor**: `CLILiteExecutor`

**Process**:
```
Request → CLI Spawn (Restrictive) → Tool Execution → WebSocket → Discard
```

**File**: `backend/src/executors/cli-lite-executor.ts`

```typescript
class CLILiteExecutor {
  // Spawns CLI with restrictive permissions
  // No artifact storage
  // Streams output via WebSocket only
  // Results discarded after completion
}
```

**Use Cases**:
- Quick analysis
- Real-time feedback
- Low-cost exploration
- Temporary sessions

---

### 3. API Mode (Future - v2.0)

**Purpose**: Installation-free API-based execution

**Features**:
- 🔮 Coming in v2.0
- No CLI installation required
- Direct API calls (Anthropic/OpenAI)
- Optional artifact storage

**Executor**: `APIExecutor`

**File**: `backend/src/executors/api-executor.ts`

```typescript
class APIExecutor {
  // Will implement Anthropic API
  // Will implement OpenAI API
  // Supports artifact storage
}
```

---

## Routing & Router

**File**: `backend/src/services/execution-mode-router.ts`

### ExecutionModeRouter

Central router that:
1. Selects appropriate executor based on request
2. Validates execution mode
3. Checks CLI/API availability
4. Manages mode configuration

```typescript
class ExecutionModeRouter {
  setMode(mode: ExecutionMode): void
  getConfig(mode?: ExecutionMode): ExecutionModeConfig
  getExecutor(request: ExecuteRequest): Executor
  getAvailableModes(): ExecutionMode[]
}
```

---

## API Endpoints

### Execute with Mode

**Endpoint**: `POST /api/runs/:id/execute`

**Request**:
```json
{
  "command": "build",
  "provider": "claude",
  "roles": ["builder"],
  "goal": "Create a dashboard",
  "mode": "cli-full"  // or "cli-lite"
}
```

**Response**:
```json
{
  "runId": "run-123",
  "status": "executing",
  "provider": "claude",
  "mode": "cli-full",
  "message": "Executing build with claude (mode: cli-full)"
}
```

---

### Get Available Modes

**Endpoint**: `GET /api/execution-modes`

**Response**:
```json
{
  "current": "cli-full",
  "available": ["cli-full", "cli-lite"],
  "modes": {
    "cli-full": "Full execution with artifact storage",
    "cli-lite": "Lightweight execution without storage",
    "api": "API mode (coming in v2.0)"
  }
}
```

---

### Change Execution Mode

**Endpoint**: `POST /api/execution-mode`

**Request**:
```json
{
  "mode": "cli-lite"
}
```

**Response**:
```json
{
  "mode": "cli-lite",
  "message": "Execution mode changed to cli-lite"
}
```

---

## Environment Configuration

**File**: `backend/.env`

```bash
# Execution Mode
# Options: cli-full (default) | cli-lite | api
EXECUTION_MODE=cli-full

# For API mode (future)
# ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
```

---

## Implementation Flow

### CLI-FULL Flow

```
1. Request arrives with mode: "cli-full"
2. ExecutionModeRouter selects CLIFullExecutor
3. CLIFullExecutor spawns CLI with full permissions
4. CLI executes tools and generates artifacts
5. Output streamed via WebSocket
6. Artifacts detected and parsed
7. build.md saved to run directory
8. Complete event sent via WebSocket
```

### CLI-LITE Flow

```
1. Request arrives with mode: "cli-lite"
2. ExecutionModeRouter selects CLILiteExecutor
3. CLILiteExecutor spawns CLI with restrictive permissions
4. CLI executes read-only tools
5. Output streamed via WebSocket
6. No artifacts saved
7. Output discarded after completion
8. Complete event sent via WebSocket
```

---

## Mode Selection Guide

### Use CLI-FULL when:
- ✅ Production deployments
- ✅ Long-term artifact preservation needed
- ✅ Full tool capabilities required
- ✅ Audit trails necessary

### Use CLI-LITE when:
- ✅ Quick exploration
- ✅ Cost optimization critical
- ✅ Real-time feedback only
- ✅ Temporary analysis
- ✅ Read-only operations sufficient

### Waiting for API when:
- 🔮 No CLI installation available
- 🔮 Cloud-only environments
- 🔮 Minimal dependencies needed
- 🔮 Serverless deployments

---

## Files Created

### Types
- `backend/src/types/execution-mode.ts` - ExecutionMode definitions

### Services
- `backend/src/services/execution-mode-router.ts` - Mode routing logic

### Executors
- `backend/src/executors/cli-full-executor.ts` - Full artifact preservation
- `backend/src/executors/cli-lite-executor.ts` - Lightweight streaming
- `backend/src/executors/api-executor.ts` - API placeholder (v2.0)

### Routes
- `backend/src/routes/runs.route.ts` - Updated with mode endpoints

### Configuration
- `backend/.env` - EXECUTION_MODE setting

---

## Type Extensions

**File**: `backend/src/types/index.ts`

ExecuteRequest now includes:
```typescript
interface ExecuteRequest {
  // ... existing fields
  mode?: 'cli-full' | 'cli-lite' | 'api';  // NEW
}
```

---

## Future Enhancements

### v2.0 - API Mode
- [ ] Implement Anthropic API executor
- [ ] Implement OpenAI API executor
- [ ] Add API key validation
- [ ] Support streaming responses
- [ ] Artifact storage via API

### v3.0 - Advanced Features
- [ ] Mode auto-selection based on workload
- [ ] Cost estimation per mode
- [ ] Hybrid mode (partial CLI + API fallback)
- [ ] Mode-specific telemetry

---

## Testing Checklist

### CLI-FULL
- [ ] Artifacts saved to build.md
- [ ] Full tool output captured
- [ ] WebSocket events received
- [ ] CLI process spawned correctly
- [ ] Permissions granted

### CLI-LITE
- [ ] No artifacts saved
- [ ] Restrictive permissions applied
- [ ] WebSocket events received
- [ ] Output discarded on completion
- [ ] Faster execution time

### Mode Router
- [ ] Available modes listed correctly
- [ ] Mode validation working
- [ ] Executor selection correct
- [ ] CLI availability detection works
- [ ] Mode change persists

---

## Troubleshooting

### Issue: "CLI not found"
```
✗ Message: claude CLI is not available
→ Solution: Install Claude CLI or use API mode (v2.0)
```

### Issue: "API mode not yet implemented"
```
✗ Message: API mode coming in v2.0
→ Solution: Use cli-full or cli-lite mode
```

### Issue: "Unknown execution mode"
```
✗ Message: Unknown execution mode: invalid-mode
→ Solution: Use cli-full, cli-lite, or api
```

---

## Performance Metrics

### CLI-FULL
- **Startup**: ~2s (CLI spawn)
- **Execution**: 10min timeout
- **Artifact**: Saved to disk
- **Cost**: Full CLI execution cost

### CLI-LITE
- **Startup**: ~1s (CLI spawn, restricted)
- **Execution**: 5min timeout
- **Artifact**: None (memory only)
- **Cost**: Reduced (read-only)

### API (Future)
- **Startup**: ~100ms (HTTP)
- **Execution**: 5min timeout
- **Artifact**: Optional API storage
- **Cost**: Pay-per-call

---

## Support Matrix

| Mode | Providers | Storage | Permissions | CLI Required |
|------|-----------|---------|-------------|--------------|
| cli-full | claude, codex, gemini | ✅ Yes | Full | ✅ Yes |
| cli-lite | claude, codex, gemini | ❌ No | Restricted | ✅ Yes |
| api | claude, openai | ✅ Yes | Full | ❌ No |

---

## Security Considerations

### CLI-FULL
- Uses `bypassPermissions` mode
- Full file system access
- Should only be used in trusted environments
- All operations logged

### CLI-LITE
- Uses `restrictive` permission mode
- Read-only operations preferred
- Safe for untrusted inputs
- Minimal file system access

### API Mode (v2.0)
- API key-based authentication
- Fine-grained tool permissions
- Rate limiting available
- Audit logging recommended

