# APSF Explorer - Testing Documentation Index

## Overview

Complete testing infrastructure for APSF Explorer Frontend ↔ Backend ↔ CLI integration.

## Quick Links

### Start Here
- [Integration Test Quick Start](INTEGRATION_TEST_GUIDE.md#quick-start)
- [Installation Instructions](INTEGRATION_TEST_GUIDE.md#installation)

### Run Tests
```bash
# Recommended: Using npm script
cd backend && npm run test:integration

# Alternative: Using master scripts
bash run-integration-tests.sh          # Linux/macOS
.\run-integration-tests.ps1             # Windows
```

## Documentation Files

### 1. **INTEGRATION_TEST_SUMMARY.txt** (This Level)
- High-level overview of what was delivered
- Quick reference for test specifications
- File locations and specifications
- Usage instructions
- Validation checklist

### 2. **INTEGRATION_TEST_GUIDE.md** (User-Focused)
- Quick start instructions
- Installation guide
- Test descriptions (1-9)
- Expected output format
- Troubleshooting section
- Performance metrics
- CI/CD integration examples
- Architecture diagrams

**Best for**: First-time users, quick reference

### 3. **INTEGRATION_TEST_IMPLEMENTATION.md** (Technical)
- Technical implementation details
- Architecture and design patterns
- Execution flow diagrams
- Technology stack
- Error handling strategies
- Performance characteristics
- Scalability roadmap
- CI/CD pipeline examples
- Future enhancements

**Best for**: Developers, architects, maintainers

## Test Files

### Backend Integration Tests
- **File**: `backend/run-integration-tests.ts`
- **Language**: TypeScript
- **Size**: 400+ lines
- **Purpose**: Main test runner with 9 comprehensive tests
- **Tests**: WebSocket, CLI-FULL, CLI-LITE, Claude, Codex, Error Handling, Artifacts, Events, Concurrency

### Orchestration Scripts
- **Bash**: `run-integration-tests.sh` (Linux/macOS)
- **PowerShell**: `run-integration-tests.ps1` (Windows)
- **Size**: 1.3KB and 1.8KB respectively
- **Purpose**: Automated server startup, test execution, and cleanup

### Configuration
- **File**: `backend/package.json`
- **Script**: `"test:integration": "tsx run-integration-tests.ts"`
- **Usage**: `cd backend && npm run test:integration`

## Test Specifications

### 9 Comprehensive Tests

| # | Test | Mode | Provider | Duration | Coverage |
|---|------|------|----------|----------|----------|
| 1 | WebSocket Connection | - | - | 50ms | Connectivity |
| 2 | CLI-FULL Mode | cli-full | claude | 500ms | Full execution mode |
| 3 | CLI-LITE Mode | cli-lite | codex | 500ms | Lightweight mode |
| 4 | Claude Provider | cli-full | claude | 500ms | Claude integration |
| 5 | Codex Provider | cli-lite | codex | 500ms | Codex integration |
| 6 | Error Handling | - | invalid | 200ms | Error paths |
| 7 | Artifact Saving | cli-full | claude | 500ms | Artifact persistence |
| 8 | Event Streaming | - | claude | 500ms | Event broadcasting |
| 9 | Concurrent Requests | mixed | mixed | 1200ms | Concurrency |

**Total Time**: 5-6 seconds (including server startup)

## Getting Started

### Step 1: Install Dependencies
```bash
cd backend
npm install
```

### Step 2: Run Tests
```bash
npm run test:integration
```

### Step 3: Review Output
The test suite outputs:
- Per-test duration
- Pass/Fail status
- Total execution time
- Summary statistics

### Step 4: (Optional) Troubleshoot
See [INTEGRATION_TEST_GUIDE.md](INTEGRATION_TEST_GUIDE.md#troubleshooting) for solutions.

## Platform Support

- **Linux**: Bash script (`run-integration-tests.sh`)
- **macOS**: Bash script (`run-integration-tests.sh`)
- **Windows**: PowerShell script (`run-integration-tests.ps1`)

## Features

### Comprehensive Coverage
- WebSocket connectivity
- Multiple execution modes (CLI-FULL, CLI-LITE)
- Multiple AI providers (Claude, Codex)
- Error handling and edge cases
- Artifact persistence
- Event streaming
- Concurrent request processing

### Performance Monitoring
- Per-test duration tracking
- Total execution time
- Detailed timing breakdown
- Performance bottleneck identification

### Easy Integration
- Single npm command entry point
- Master orchestration scripts
- CI/CD pipeline ready
- GitHub Actions example included

### Production Ready
- Cross-platform support
- Detailed error handling
- Resource cleanup guarantees
- Comprehensive documentation

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Run Integration Tests
  run: |
    cd backend
    npm install
    npm run test:integration
```

## Architecture

```
APSF Explorer
├── Frontend (React + Vite)
│   └── WebSocket Client
├── Backend (Express + WebSocket)
│   ├── HTTP Server
│   ├── WebSocket Server
│   └── Execution Handlers
└── CLI (Execution Modes)
    ├── CLI-FULL
    └── CLI-LITE
```

Integration tests verify all communication paths between components.

## Key Files Summary

| File | Location | Purpose | Size |
|------|----------|---------|------|
| run-integration-tests.ts | backend/ | Main test runner | 18KB |
| run-integration-tests.sh | root/ | Linux/macOS orchestration | 1.3KB |
| run-integration-tests.ps1 | root/ | Windows orchestration | 1.8KB |
| INTEGRATION_TEST_GUIDE.md | root/ | User documentation | 7.2KB |
| INTEGRATION_TEST_IMPLEMENTATION.md | root/ | Technical documentation | 11KB |
| INTEGRATION_TEST_SUMMARY.txt | root/ | Quick reference | 8KB |
| TESTING_INDEX.md | root/ | This file | 3KB |

## Next Steps

1. **Install Dependencies**
   ```bash
   cd backend && npm install
   ```

2. **Run Tests**
   ```bash
   npm run test:integration
   ```

3. **Review Documentation**
   - User Guide: [INTEGRATION_TEST_GUIDE.md](INTEGRATION_TEST_GUIDE.md)
   - Technical Details: [INTEGRATION_TEST_IMPLEMENTATION.md](INTEGRATION_TEST_IMPLEMENTATION.md)

4. **Integrate with CI/CD**
   - See CI/CD examples in [INTEGRATION_TEST_IMPLEMENTATION.md](INTEGRATION_TEST_IMPLEMENTATION.md#cicd-integration-example)

5. **Extend Tests**
   - Add more tests to [backend/run-integration-tests.ts](backend/run-integration-tests.ts)
   - Follow existing test patterns

## Support

### Quick Help
- **Installation Issues**: See [INTEGRATION_TEST_GUIDE.md](INTEGRATION_TEST_GUIDE.md#troubleshooting)
- **Technical Questions**: See [INTEGRATION_TEST_IMPLEMENTATION.md](INTEGRATION_TEST_IMPLEMENTATION.md)
- **Usage Examples**: See [INTEGRATION_TEST_GUIDE.md](INTEGRATION_TEST_GUIDE.md#usage-instructions)

### Additional Resources
- Backend Architecture: [backend/ARCHITECTURE.md](backend/ARCHITECTURE.md)
- Execution Modes: [EXECUTION_MODES.md](EXECUTION_MODES.md)
- Backend Quickstart: [backend/QUICKSTART.md](backend/QUICKSTART.md)

## Success Indicators

After running tests successfully, you should see:
- All 9 tests showing PASS status
- Total execution time: 5-6 seconds
- Message: "ALL TESTS PASSED!"
- Exit code: 0

## Status

- **Status**: COMPLETE
- **Version**: 1.0.0
- **Created**: 2026-07-05
- **Platform Support**: Linux, macOS, Windows

---

For detailed information, see the comprehensive documentation files listed above.
