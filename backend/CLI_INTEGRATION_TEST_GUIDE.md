# CLI Integration Test Guide

Backend ↔ Real Claude/Codex CLI 統合テスト

## Overview

The CLI Integration Test Suite (`run-cli-integration-tests.ts`) is designed to test the integration between the APSF Explorer backend and actual Claude/Codex CLI commands available on the system.

## Test Coverage

The test suite runs 6 integration tests:

### 1. Claude CLI Detection
- **Status**: PASS/SKIP
- **Purpose**: Verify Claude CLI is available in PATH
- **Expected Output**: Confirms CLI path location

### 2. Codex CLI Detection
- **Status**: PASS/SKIP
- **Purpose**: Verify Codex CLI is available in PATH
- **Expected Output**: Confirms CLI path location

### 3. Claude CLI Invocation
- **Status**: PASS/FAIL/SKIP
- **Purpose**: Test actual invocation of Claude CLI `--version` command
- **Expected Output**: Exit code 0 with version information

### 4. Codex CLI Invocation
- **Status**: PASS/FAIL/SKIP
- **Purpose**: Test actual invocation of Codex CLI `--version` command
- **Expected Output**: Exit code 0 with version information

### 5. Claude CLI Output Parsing
- **Status**: PASS/FAIL/SKIP
- **Purpose**: Parse semantic version from Claude CLI output
- **Expected Output**: Version number detected (e.g., "2.1.197")

### 6. Error Handling (Invalid Command)
- **Status**: PASS/FAIL
- **Purpose**: Verify proper error handling for nonexistent commands
- **Expected Output**: Error properly caught and handled

## Running the Tests

### From npm Script
```bash
cd backend
npm run test:integration:cli
```

### Directly with tsx
```bash
cd backend
npx tsx run-cli-integration-tests.ts
```

### Directly with node
```bash
cd backend
node run-cli-integration-tests.ts
```

## Expected Results

### With Claude CLI installed:
```
🚀 Starting CLI Integration Test Runner...

🔍 CLI Detection Results:

   Claude CLI: ✅ Found
   Codex CLI: ❌ Not found

📝 Running 6 CLI Integration Tests...

✅ Test 1/6: Claude CLI Detection - PASS
⏭️  Test 2/6: Codex CLI Detection - SKIP (not in PATH)
✅ Test 3/6: Claude CLI Invocation - PASS (65ms)
⏭️  Test 4/6: Codex CLI Invocation - SKIP
✅ Test 5/6: Claude CLI Output Parsing - PASS
✅ Test 6/6: Error Handling - PASS

============================================================
📊 CLI INTEGRATION TEST RESULTS
============================================================

1. ✅ Claude CLI Detection
   Status: PASS | Duration: 0ms
   Message: Found at: claude

2. ⏭️  Codex CLI Detection
   Status: SKIP | Duration: 0ms
   Message: Codex CLI not found in PATH

3. ✅ Claude CLI Invocation
   Status: PASS | Duration: 65ms
   Output: 2.1.197 (Claude Code)

4. ⏭️  Codex CLI Invocation
   Status: SKIP | Duration: 0ms
   Message: Codex CLI not available

5. ✅ Claude CLI Output Parsing
   Status: PASS | Duration: 62ms
   Message: Version detected: 2.1.197

6. ✅ Error Handling (Invalid Command)
   Status: PASS | Duration: 1ms
   Message: Error properly caught

============================================================
PASSED: 4/6
FAILED: 0/6
SKIPPED: 2/6
TOTAL TIME: 128ms
============================================================

🎉 CLI INTEGRATION TESTS PASSED! 🎉

⚠️  Note: 2 test(s) skipped (Claude/Codex CLI not found in PATH)
   To enable full CLI testing:
   1. Install Claude CLI: https://github.com/anthropics/claude-dev
   2. Add to PATH or install globally
```

## Architecture

### CLIIntegrationTestRunner Class

```typescript
class CLIIntegrationTestRunner {
  // CLI path detection
  private claudePath: string | null
  private codexPath: string | null
  
  // Test execution
  async start(): Promise<void>
  private async runTests(): Promise<void>
  
  // Detection methods
  private detectClaudeCommand(): string | null
  private detectCodexCommand(): string | null
  
  // Test methods
  private testClaudeDetection(): Promise<void>
  private testCodexDetection(): Promise<void>
  private testClaudeInvocation(): Promise<void>
  private testCodexInvocation(): Promise<void>
  private testClaudeOutputParsing(): Promise<void>
  private testErrorHandling(): Promise<void>
  
  // Results
  private printResults(): void
}
```

### Test Result Interface

```typescript
interface TestResult {
  name: string;           // Test name
  status: 'PASS' | 'FAIL' | 'SKIP';
  duration: number;       // Execution time in ms
  message?: string;       // Optional message
  output?: string;        // Optional command output
}
```

## CLI Detection Strategy

The test suite attempts to detect CLI commands in multiple locations:

### Claude CLI Candidates:
- `claude` (PATH)
- `claude.exe` (Windows PATH)
- `C:\Program Files\Claude\claude.exe` (Windows standard)
- `/usr/local/bin/claude` (Linux/Mac standard)
- `/opt/claude/bin/claude` (Linux alternative)

### Codex CLI Candidates:
- `codex` (PATH)
- `codex.exe` (Windows PATH)
- `C:\Program Files\Codex\codex.exe` (Windows standard)
- `/usr/local/bin/codex` (Linux/Mac standard)
- `/opt/codex/bin/codex` (Linux alternative)

## Timeout Handling

All CLI invocation tests have a 5-second timeout to prevent hanging on unresponsive commands.

## Exit Codes

- **0**: All tests passed (no failures)
- **1**: Some tests failed (but may have skipped tests)

## Integration with CI/CD

Add to your CI pipeline:

```yaml
- name: Run CLI Integration Tests
  run: cd backend && npm run test:integration:cli
```

## Troubleshooting

### Test Skipped (CLI not found)
**Issue**: Tests are skipped for Claude/Codex CLI
**Solution**: Install the CLI and ensure it's in your PATH

### Test Failed (spawn command ENOENT)
**Issue**: CLI found in detection but fails during invocation
**Solution**: Verify CLI is executable and accessible from shell

### Test Timeout
**Issue**: CLI command takes longer than 5 seconds
**Solution**: Increase timeout in test code or optimize CLI command

## Dependencies

- Node.js 18.0.0+
- Express (for backend)
- ws (for WebSocket support)
- TypeScript (optional, but tsx requires it)

## Integration Points

This CLI Integration Test Suite integrates with:

1. **run-integration-tests.ts**: Full stack integration tests
2. **package.json**: npm scripts for test execution
3. **src/index.ts**: Backend server implementation
4. **Frontend**: Consumer of CLI integration results

## Performance Metrics

Typical execution times:
- Claude CLI Detection: < 1ms
- Claude CLI Invocation: 50-100ms
- Claude CLI Output Parsing: 50-100ms
- Codex CLI Detection: < 1ms
- Codex CLI Invocation: 50-100ms (if installed)
- Error Handling: 1-2ms

Total runtime: 100-250ms (depending on CLI availability)

## Future Enhancements

- [ ] Add more CLI commands beyond `--version`
- [ ] Support provider-specific options
- [ ] Integration with actual execution modes
- [ ] Performance benchmarking
- [ ] CI environment detection
- [ ] Parallel test execution
- [ ] Custom reporter formats (JSON, XML, etc.)
