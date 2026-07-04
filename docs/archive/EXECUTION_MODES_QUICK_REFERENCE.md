# Execution Modes - Quick Reference

## TL;DR

| Mode | Best For | Storage | Speed | Cost |
|------|----------|---------|-------|------|
| **CLI-FULL** 📦 | Production, long-term results | ✅ Saves to build.md | Medium | High |
| **CLI-LITE** ⚡ | Quick analysis, exploration | ❌ Temporary only | Fast | Low |
| **API** 🔮 | Cloud/serverless (v2.0) | ✅ Configurable | Fast | Pay-per-call |

---

## Usage Examples

### CLI-FULL (With Artifact Storage)

```bash
curl -X POST http://localhost:3001/api/runs/run-1/execute \
  -H "Content-Type: application/json" \
  -d '{
    "command": "build",
    "provider": "claude",
    "roles": ["builder"],
    "mode": "cli-full"
  }'
```

**Result**: Artifacts saved to `runs/run-1/build.md`

---

### CLI-LITE (Fast & Cheap)

```bash
curl -X POST http://localhost:3001/api/runs/run-2/execute \
  -H "Content-Type: application/json" \
  -d '{
    "command": "review",
    "provider": "claude",
    "roles": ["reviewer"],
    "mode": "cli-lite"
  }'
```

**Result**: Output streamed, then discarded

---

### Check Available Modes

```bash
curl http://localhost:3001/api/execution-modes
```

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

### Change Default Mode

```bash
curl -X POST http://localhost:3001/api/execution-mode \
  -H "Content-Type: application/json" \
  -d '{ "mode": "cli-lite" }'
```

---

## Configuration

### Environment Variable

```bash
# .env
EXECUTION_MODE=cli-full  # Default
# or
EXECUTION_MODE=cli-lite
```

### Request Override

```javascript
// Always override env variable if specified
{
  mode: 'cli-lite'  // Use this even if env is cli-full
}
```

---

## Decision Tree

```
Need to save results long-term?
  ├─ YES → CLI-FULL 📦
  └─ NO  → Need CLI installed?
         ├─ YES → CLI-LITE ⚡
         └─ NO  → API 🔮 (coming v2.0)
```

---

## Performance

- **CLI-FULL**: 2s startup + 10min execution max
- **CLI-LITE**: 1s startup + 5min execution max  
- **API**: 100ms startup + 5min execution max (v2.0)

---

## Files Structure

```
backend/
├── src/
│   ├── types/
│   │   ├── execution-mode.ts        ← Mode definitions
│   │   └── index.ts                 ← Updated ExecuteRequest
│   ├── services/
│   │   └── execution-mode-router.ts ← Mode routing
│   ├── executors/
│   │   ├── cli-full-executor.ts     ← Full mode
│   │   ├── cli-lite-executor.ts     ← Lite mode
│   │   └── api-executor.ts          ← API mode (future)
│   └── routes/
│       └── runs.route.ts            ← Updated endpoints
└── .env                              ← Configuration
```

---

## Common Patterns

### Production Build with Artifacts
```json
{
  "command": "build",
  "provider": "claude",
  "roles": ["builder"],
  "mode": "cli-full"  ← Save everything
}
```

### Quick Code Review
```json
{
  "command": "review",
  "provider": "claude",
  "roles": ["reviewer"],
  "mode": "cli-lite"  ← Just stream, don't save
}
```

### Batch Analysis (Low Cost)
```json
{
  "command": "analyze",
  "provider": "claude",
  "roles": ["analyst"],
  "mode": "cli-lite"  ← Multiple runs, cheap
}
```

---

## Troubleshooting

### "CLI not found"
→ Install Claude CLI or wait for API mode (v2.0)

### "Mode not available"
→ Check EXECUTION_MODE env variable

### "API mode not implemented"
→ Use cli-full or cli-lite for now

---

## Future: API Mode (v2.0)

```json
{
  "command": "build",
  "provider": "claude",
  "mode": "api"  ← Coming soon
}
```

**Benefits**:
- No CLI installation
- Cloud/serverless ready
- Pay-per-call pricing
- Instant startup

