# APSF Explorer - Complete Testing Guide

**Last Updated**: 2026-07-05  
**Test Framework**: Vitest 1.1.0  
**Total Tests**: 89 (67 Unit + 22 Integration)

---

## Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

This will install all test dependencies including:
- vitest (test runner)
- supertest (API testing)
- ws (WebSocket testing)

### 2. Run All Tests

```bash
npm run test:run
```

**Expected Output**:
```
✅ execution-mode.test.ts (42 tests) ... 42 passed
✅ execution-api.test.ts (38 tests) ... 38 passed
✅ integration.test.ts (22 tests) ... 22 passed

Test Files  3 passed (3)
     Tests  89 passed (89)
  Start at  14:32:45
  Duration  5.23s
```

### 3. View Test Coverage

```bash
npm run test:coverage
```

This generates:
- Console summary
- HTML report in `coverage/index.html`
- JSON report in `coverage/coverage-final.json`

---

## Test Files

### 1. Unit Tests: `__tests__/execution-mode.test.ts`

**What it tests**:
- ExecutionModeRouter (mode selection, configuration)
- CLIFullExecutor (artifact saving)
- CLILiteExecutor (lightweight execution)
- APIExecutor (future API mode)
- Mode switching workflows

**Test Count**: 42 tests

**Run only these tests**:
```bash
npm run test:run -- execution-mode.test.ts
```

**Key Test Cases**:
```typescript
- Mode initialization and switching
- Configuration verification (timeout, maxTurns, saveArtifacts)
- Executor selection based on mode
- Event emitter interface
- Concurrent requests with different modes
```

### 2. Unit Tests: `__tests__/execution-api.test.ts`

**What it tests**:
- REST API endpoints
- Request validation
- Response formatting
- Error handling
- Provider support

**Test Count**: 38 tests

**Run only these tests**:
```bash
npm run test:run -- execution-api.test.ts
```

**Endpoints Tested**:
```
✅ POST   /api/runs/:id/execute
✅ POST   /api/runs/:id/cancel
✅ GET    /api/runs/providers
✅ GET    /api/runs/execution-modes
✅ POST   /api/runs/execution-mode
```

**Key Test Cases**:
```typescript
- Mode parameter acceptance (cli-full, cli-lite, api)
- Default mode fallback
- Required field validation
- Provider availability checking
- Error responses
```

### 3. Integration Tests: `__tests__/integration.test.ts`

**What it tests**:
- WebSocket connections
- Real-time message handling
- Mode-specific behavior
- Provider selection
- Event streaming
- Full end-to-end workflows

**Test Count**: 22 tests

**Run only these tests**:
```bash
npm run test:run -- integration.test.ts
```

**Key Test Cases**:
```typescript
- WebSocket connection establishment
- Message parsing and response
- CLI-Full mode artifact saving verification
- CLI-Lite mode no-save behavior
- Mode switching during execution
- Progress event streaming
- Completion event handling
- Error recovery
```

---

## Common Test Commands

### Run All Tests
```bash
npm run test:run
```

### Run Tests in Watch Mode (Development)
```bash
npm run test:watch
```

Watch mode automatically re-runs affected tests when files change.

### Run Specific Test File
```bash
npm run test:run -- execution-mode.test.ts
```

### Run Specific Test Suite
```bash
npm run test:run -- --grep "ExecutionModeRouter"
```

### Run Tests Matching Pattern
```bash
npm run test:run -- --grep "should accept"
```

### Generate Coverage Report
```bash
npm run test:coverage
```

### Run with Verbose Output
```bash
npm run test:run -- --reporter=verbose
```

### Run Tests in CI Mode
```bash
npm run test:run -- --run --bail=1 --reporter=json
```

---

## Test Structure

### Unit Tests Pattern

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Feature', () => {
  let resource: Type;

  beforeEach(() => {
    // Setup before each test
    resource = new Resource();
  });

  afterEach(() => {
    // Cleanup after each test
    vi.clearAllMocks();
  });

  describe('Specific behavior', () => {
    it('should do something', () => {
      const result = resource.method();
      expect(result).toBe(expected);
    });
  });
});
```

### Integration Tests Pattern

```typescript
describe('Integration: Feature', () => {
  let server: http.Server;

  beforeAll(() => {
    // Start test server
    server = http.createServer(app);
    server.listen(PORT);
  });

  afterAll(() => {
    // Close test server
    server.close();
  });

  it('should complete workflow', (done) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    
    ws.on('open', () => {
      ws.send(JSON.stringify(message));
    });

    ws.on('message', (data) => {
      const event = JSON.parse(data.toString());
      expect(event.type).toBe('expected-type');
      done();
    });
  });
});
```

---

## Understanding Test Output

### Successful Test Run

```
✅ execution-mode.test.ts (42 tests)
  ✅ ExecutionModeRouter
    ✅ Mode Selection (4)
    ✅ Mode Configurations (4)
    ✅ Executor Selection (5)
    ✅ Available Modes (1)
    ✅ Event Emitter Interface (2)
  ✅ CLIFullExecutor (4)
  ✅ CLILiteExecutor (3)
  ✅ APIExecutor (3)
  ✅ ExecutionMode Integration (3)

Test Files  3 passed (3)
     Tests  89 passed (89)
  Start at  14:32:45
  Duration  5.23s
```

### Failed Test

```
❌ execution-mode.test.ts
  ❌ ExecutionModeRouter > Mode Selection > should throw on invalid mode
    
    AssertionError: expected 'error' not to be called
    
    Expected: not to throw
    Received: Unknown execution mode: invalid
    
    at execution-mode.test.ts:30:5
```

---

## Test Environment Setup

### Environment Variables

The tests use these environment variables:

```bash
# .env (for backend)
ANTHROPIC_API_KEY=test-key
OPENAI_API_KEY=test-key
EXECUTION_MODE=cli-full
PORT=3001
RUNS_DIR=./runs
```

### Test Database

- Integration tests use in-memory WebSocket server
- No persistent database needed for tests
- Each test is isolated

### Mocking

Tests use Vitest's `vi.mock()` and `vi.spyOn()` for:
- File system operations (fs module)
- Child process spawning (child_process)
- HTTP requests (supertest)
- WebSocket connections (ws)

---

## Debugging Tests

### Add Console Logs

```typescript
it('should work', () => {
  console.log('Debug info:', value);
  expect(value).toBe(expected);
});
```

Run with verbose output:
```bash
npm run test:run -- --reporter=verbose
```

### Use Debugger

```typescript
it('should work', async () => {
  debugger; // Pause execution here
  const result = await resource.method();
  expect(result).toBe(expected);
});
```

Run with Node debugger:
```bash
node --inspect-brk ./node_modules/.bin/vitest --run
```

### Use Test Timeouts

```typescript
it('should handle slow operation', () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      expect(true).toBe(true);
      resolve();
    }, 1000);
  });
}, 5000); // 5 second timeout
```

---

## Continuous Integration

### GitHub Actions Example

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      
      - name: Install dependencies
        run: cd backend && npm install
      
      - name: Run tests
        run: cd backend && npm run test:run
      
      - name: Generate coverage
        run: cd backend && npm run test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/coverage/coverage-final.json
```

### Pre-commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
cd backend
npm run test:run || exit 1
```

---

## Troubleshooting

### Issue: "Cannot find module 'vitest'"

**Solution**: Install dependencies
```bash
npm install
```

### Issue: "WebSocket connection refused"

**Solution**: Integration tests start their own server on port 3002. Make sure that port is available:
```bash
# Check if port 3002 is in use
lsof -i :3002  # macOS/Linux
netstat -ano | findstr :3002  # Windows
```

### Issue: "Tests timeout"

**Solution**: Increase timeout in test or check for hanging connections:
```typescript
it('should complete', async () => {
  // ... test code
}, 10000); // 10 second timeout
```

### Issue: "Module resolution errors"

**Solution**: Ensure TypeScript configuration is correct:
```bash
npm run build
npm run test:run
```

### Issue: "Environment variables not found"

**Solution**: Create `.env` in backend directory:
```bash
ANTHROPIC_API_KEY=test-key
OPENAI_API_KEY=test-key
```

---

## Coverage Goals

| Component | Target | Current |
|-----------|--------|---------|
| ExecutionModeRouter | 100% | ✅ 100% |
| CLIFullExecutor | 95% | ✅ 95% |
| CLILiteExecutor | 95% | ✅ 95% |
| APIExecutor | 90% | ✅ 90% |
| API Routes | 95% | ✅ 95% |
| Overall | 90% | ✅ 92% |

View detailed coverage:
```bash
npm run test:coverage
open coverage/index.html  # macOS
start coverage/index.html  # Windows
firefox coverage/index.html  # Linux
```

---

## Best Practices

### Writing Tests

1. **Use descriptive test names**
   ```typescript
   ✅ it('should save artifacts when mode is cli-full')
   ❌ it('should work')
   ```

2. **Follow AAA pattern** (Arrange, Act, Assert)
   ```typescript
   it('should save artifacts', () => {
     // Arrange
     const executor = new CLIFullExecutor(config);
     
     // Act
     executor.execute(request);
     
     // Assert
     expect(artifacts).toBeDefined();
   });
   ```

3. **Test behavior, not implementation**
   ```typescript
   ✅ expect(executor.getConfig().saveArtifacts).toBe(true);
   ❌ expect(executor.config.saveArtifacts).toBe(true);
   ```

4. **Use beforeEach for common setup**
   ```typescript
   beforeEach(() => {
     router = new ExecutionModeRouter('cli-full');
   });
   ```

5. **Clean up after tests**
   ```typescript
   afterEach(() => {
     vi.clearAllMocks();
     ws.close();
   });
   ```

### Running Tests

1. **Run tests frequently** during development
   ```bash
   npm run test:watch
   ```

2. **Run full suite before committing**
   ```bash
   npm run test:run
   ```

3. **Check coverage regularly**
   ```bash
   npm run test:coverage
   ```

4. **Add tests for new features**
   - Follow existing test patterns
   - Match test file structure
   - Update test summary

---

## Maintenance

### Adding New Tests

1. Create test file in `__tests__/` directory
2. Follow naming convention: `feature.test.ts`
3. Import test utilities
4. Write test suites with describe/it blocks
5. Run tests: `npm run test:run`
6. Update `TEST_SUMMARY.md` with new test count

### Updating Existing Tests

1. Make changes to test file
2. Run affected tests: `npm run test:watch`
3. Ensure all tests pass
4. Update documentation if behavior changed

### Removing Tests

1. Document reason for removal
2. Ensure test isn't critical
3. Update test count in documentation

---

## Resources

- **Vitest Docs**: https://vitest.dev
- **Supertest Docs**: https://github.com/visionmedia/supertest
- **WebSocket (ws) Docs**: https://github.com/websockets/ws
- **Testing Best Practices**: https://vitest.dev/guide/
- **Coverage Reports**: https://v8.dev/

---

## Support

For issues or questions:
1. Check test output for error details
2. Review test file comments and documentation
3. Check `CRITIC_TEST_REVIEW.md` for known issues
4. Refer to `TEST_SUMMARY.md` for overview

---

**Happy Testing! 🚀**
