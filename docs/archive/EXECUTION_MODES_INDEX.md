# Execution Modes - Complete Documentation Index

Welcome to the APSF Explorer Execution Modes system. This index guides you through all available documentation.

---

## Quick Start (2 minutes)

### For Users
1. Read: **[EXECUTION_MODES_QUICK_REFERENCE.md](EXECUTION_MODES_QUICK_REFERENCE.md)**
2. Choose: CLI-FULL (save artifacts) or CLI-LITE (fast & cheap)
3. Send request with `mode` parameter

### For Developers
1. Read: **[EXECUTION_MODES_IMPLEMENTATION_SUMMARY.md](EXECUTION_MODES_IMPLEMENTATION_SUMMARY.md)**
2. Review: **[ARCHITECTURE_DIAGRAM.md](ARCHITECTURE_DIAGRAM.md)**
3. Implement tests: Follow **[IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md)**

---

## Documentation Files

### 1. EXECUTION_MODES.md (Comprehensive Technical Guide)
**Level**: Advanced | **Read Time**: 30 min
- Complete architecture overview
- All three execution modes detailed
- Full API endpoint documentation with examples
- Configuration and environment setup
- Implementation flow diagrams
- Testing checklist
- Troubleshooting guide
- Performance metrics
- Security considerations
- Future roadmap

**When to read**: Need full technical understanding

---

### 2. EXECUTION_MODES_QUICK_REFERENCE.md (User Guide)
**Level**: Beginner | **Read Time**: 5 min
- TL;DR mode comparison table
- Real curl examples
- Configuration guide
- Decision tree for mode selection
- Performance summary
- Common patterns
- File structure

**When to read**: Need quick answers, API usage, examples

---

### 3. EXECUTION_MODES_IMPLEMENTATION_SUMMARY.md (Project Overview)
**Level**: Intermediate | **Read Time**: 15 min
- What was built
- Architecture components
- Key features
- File structure
- Configuration matrix
- Integration points
- Next steps & roadmap
- Verification checklist

**When to read**: Need high-level project overview, status check

---

### 4. ARCHITECTURE_DIAGRAM.md (Visual Architecture)
**Level**: All | **Read Time**: 10 min
- System architecture diagram
- Request flow (CLI-FULL and CLI-LITE)
- Data flow diagram
- Configuration hierarchy
- Error handling flow
- Module dependencies

**When to read**: Need visual understanding of system flow

---

### 5. IMPLEMENTATION_CHECKLIST.md (Project Tracking)
**Level**: Developer | **Read Time**: 10 min
- Phase-by-phase implementation status
- File inventory (created & modified)
- Verification steps
- Testing requirements
- Deployment checklist
- Success criteria
- Next steps by priority

**When to read**: Track progress, run verification, deploy

---

### 6. This File (INDEX)
**Level**: All | **Read Time**: 5 min
- Navigation guide
- Document index with descriptions
- Use cases and paths
- File location reference

---

## Documentation by Use Case

### "I just want to use the API"
Read in order:
1. **EXECUTION_MODES_QUICK_REFERENCE.md** (2 min)
2. **EXECUTION_MODES.md** § API Endpoints (5 min)

---

### "I need to implement and test this"
Read in order:
1. **EXECUTION_MODES_IMPLEMENTATION_SUMMARY.md** (15 min)
2. **ARCHITECTURE_DIAGRAM.md** (10 min)
3. **EXECUTION_MODES.md** § Implementation Flow (10 min)
4. **IMPLEMENTATION_CHECKLIST.md** § Phase 3 (10 min)

---

### "I'm debugging an issue"
Read in order:
1. **EXECUTION_MODES_QUICK_REFERENCE.md** § Troubleshooting (2 min)
2. **EXECUTION_MODES.md** § Troubleshooting (10 min)
3. **ARCHITECTURE_DIAGRAM.md** § Error Handling Flow (5 min)

---

### "I need to understand the architecture"
Read in order:
1. **ARCHITECTURE_DIAGRAM.md** (10 min)
2. **EXECUTION_MODES.md** § Architecture (15 min)
3. **EXECUTION_MODES_IMPLEMENTATION_SUMMARY.md** § Components (10 min)

---

### "I need to add a new feature"
Read in order:
1. **ARCHITECTURE_DIAGRAM.md** § Module Dependencies (5 min)
2. **EXECUTION_MODES.md** § Implementation Flow (10 min)
3. **IMPLEMENTATION_CHECKLIST.md** § Enhancement (5 min)

---

### "I'm deploying this to production"
Read in order:
1. **EXECUTION_MODES_IMPLEMENTATION_SUMMARY.md** § Verification (5 min)
2. **EXECUTION_MODES.md** § Security Considerations (5 min)
3. **IMPLEMENTATION_CHECKLIST.md** § Deployment Checklist (10 min)

---

## File Locations

### Implementation Files
```
backend/src/
├── types/
│   ├── execution-mode.ts           ← Mode types & configs
│   └── index.ts                    ← Updated ExecuteRequest
├── services/
│   └── execution-mode-router.ts    ← Mode routing logic
├── executors/
│   ├── cli-full-executor.ts        ← Full artifact mode
│   ├── cli-lite-executor.ts        ← Lightweight mode
│   └── api-executor.ts             ← API placeholder
└── routes/
    └── runs.route.ts               ← Updated endpoints

backend/
└── .env                            ← Configuration
```

### Documentation Files
```
root/
├── EXECUTION_MODES.md                          ← Technical guide
├── EXECUTION_MODES_QUICK_REFERENCE.md         ← User guide
├── EXECUTION_MODES_IMPLEMENTATION_SUMMARY.md  ← Project overview
├── ARCHITECTURE_DIAGRAM.md                     ← Visual diagrams
├── IMPLEMENTATION_CHECKLIST.md                ← Progress tracking
└── EXECUTION_MODES_INDEX.md                   ← This file
```

---

## Key Concepts

### Three Execution Modes

| Mode | Purpose | Storage | Speed | Cost |
|------|---------|---------|-------|------|
| **CLI-FULL** 📦 | Production, long-term | ✅ build.md | Medium | High |
| **CLI-LITE** ⚡ | Quick analysis | ❌ Temporary | Fast | Low |
| **API** 🔮 | Cloud/serverless | ✅ Config | Fast | Pay-per-call |

### Core Components

1. **ExecutionModeRouter** - Selects appropriate executor
2. **CLIFullExecutor** - Executes with artifact storage
3. **CLILiteExecutor** - Executes without storage (lightweight)
4. **APIExecutor** - Placeholder for v2.0 implementation

### API Endpoints

- `POST /api/runs/:id/execute` - Execute with optional mode
- `GET /api/execution-modes` - List available modes
- `POST /api/execution-mode` - Change default mode

### Environment

```bash
EXECUTION_MODE=cli-full  # Default mode
```

---

## Navigation Quick Links

**Need API examples?**
→ [EXECUTION_MODES_QUICK_REFERENCE.md](EXECUTION_MODES_QUICK_REFERENCE.md#usage-examples)

**Need architecture diagram?**
→ [ARCHITECTURE_DIAGRAM.md](ARCHITECTURE_DIAGRAM.md#system-architecture)

**Need troubleshooting?**
→ [EXECUTION_MODES.md](EXECUTION_MODES.md#troubleshooting)

**Need to verify implementation?**
→ [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md#verification-steps)

**Need deployment checklist?**
→ [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md#deployment-checklist)

**Need performance metrics?**
→ [EXECUTION_MODES.md](EXECUTION_MODES.md#performance-metrics)

**Need security info?**
→ [EXECUTION_MODES.md](EXECUTION_MODES.md#security-considerations)

---

## Summary Statistics

- **Documentation Files**: 6
- **Implementation Files**: 8 (created) + 3 (modified)
- **Total Lines of Code**: ~1000
- **Total Lines of Documentation**: ~2000+
- **API Endpoints**: 3 (1 updated, 2 new)
- **Execution Modes**: 3 (2 implemented, 1 placeholder)
- **TypeScript Interfaces**: 5+
- **Test Coverage**: Ready for Phase 3 (testing)

---

## Reading Paths

### Path 1: "Just Show Me How to Use It" (10 minutes)
1. EXECUTION_MODES_QUICK_REFERENCE.md
2. Done! 

### Path 2: "I Need the Full Picture" (45 minutes)
1. EXECUTION_MODES_QUICK_REFERENCE.md (5 min)
2. ARCHITECTURE_DIAGRAM.md (10 min)
3. EXECUTION_MODES.md (30 min)

### Path 3: "I'm Implementing This" (90 minutes)
1. EXECUTION_MODES_IMPLEMENTATION_SUMMARY.md (15 min)
2. ARCHITECTURE_DIAGRAM.md (10 min)
3. EXECUTION_MODES.md (30 min)
4. IMPLEMENTATION_CHECKLIST.md (20 min)
5. Review source code (15 min)

### Path 4: "I'm Deploying This" (30 minutes)
1. EXECUTION_MODES_IMPLEMENTATION_SUMMARY.md § Verification (5 min)
2. EXECUTION_MODES.md § Security (5 min)
3. IMPLEMENTATION_CHECKLIST.md § Deployment (10 min)
4. Verify in development environment (10 min)

---

## FAQ Quick Links

**Q: Which mode should I use?**
A: See decision tree in [EXECUTION_MODES_QUICK_REFERENCE.md](EXECUTION_MODES_QUICK_REFERENCE.md#decision-tree)

**Q: How do I set the execution mode?**
A: See configuration guide in [EXECUTION_MODES_QUICK_REFERENCE.md](EXECUTION_MODES_QUICK_REFERENCE.md#configuration)

**Q: What's the difference between CLI-FULL and CLI-LITE?**
A: See comparison table in [EXECUTION_MODES_QUICK_REFERENCE.md](EXECUTION_MODES_QUICK_REFERENCE.md#tldr)

**Q: How do I execute with a specific mode?**
A: See examples in [EXECUTION_MODES_QUICK_REFERENCE.md](EXECUTION_MODES_QUICK_REFERENCE.md#usage-examples)

**Q: When will API mode be available?**
A: See roadmap in [EXECUTION_MODES_IMPLEMENTATION_SUMMARY.md](EXECUTION_MODES_IMPLEMENTATION_SUMMARY.md#next-steps--roadmap)

**Q: How do I test this implementation?**
A: See testing checklist in [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md#phase-3-integration-testing)

**Q: What's the security model?**
A: See security section in [EXECUTION_MODES.md](EXECUTION_MODES.md#security-considerations)

**Q: What performance can I expect?**
A: See metrics in [EXECUTION_MODES.md](EXECUTION_MODES.md#performance-metrics)

---

## Version & Status

**Version**: 1.0  
**Release Date**: 2026-07-05  
**Status**: ✅ Implementation Complete (Phase 1-2)  
**Next Phase**: 🔧 Testing (Phase 3)

### Implementation Status
- ✅ CLI-FULL Executor (Complete)
- ✅ CLI-LITE Executor (Complete)
- ✅ ExecutionModeRouter (Complete)
- ✅ API Endpoints (Complete)
- ✅ Documentation (Complete)
- 🔧 Unit Tests (Phase 3)
- 🔧 Integration Tests (Phase 3)
- 🔮 API Mode (v2.0)

---

## Support

### For Implementation Questions
→ See [EXECUTION_MODES.md](EXECUTION_MODES.md#faqs)

### For Architecture Questions
→ See [ARCHITECTURE_DIAGRAM.md](ARCHITECTURE_DIAGRAM.md)

### For Deployment Questions
→ See [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md#deployment-checklist)

### For API Usage
→ See [EXECUTION_MODES_QUICK_REFERENCE.md](EXECUTION_MODES_QUICK_REFERENCE.md#usage-examples)

---

## Files Overview

### 📘 User Guides
- `EXECUTION_MODES_QUICK_REFERENCE.md` - Fast user guide with examples

### 📗 Technical Guides  
- `EXECUTION_MODES.md` - Complete technical documentation
- `ARCHITECTURE_DIAGRAM.md` - Visual architecture & flows

### 📙 Project Guides
- `EXECUTION_MODES_IMPLEMENTATION_SUMMARY.md` - Project overview
- `IMPLEMENTATION_CHECKLIST.md` - Implementation progress & checklist
- `EXECUTION_MODES_INDEX.md` - This navigation file

---

## Next Steps

1. **Choose your path** above based on your needs
2. **Read the appropriate documentation**
3. **For developers**: Run verification steps in IMPLEMENTATION_CHECKLIST.md
4. **For deployers**: Follow deployment checklist in IMPLEMENTATION_CHECKLIST.md
5. **For testers**: Implement Phase 3 in IMPLEMENTATION_CHECKLIST.md

---

**Last Updated**: 2026-07-05  
**Maintainer**: APSF Explorer Team  
**Status**: Active Development

