# Frontend Integration Test Examples

## Quick Reference

### Run Tests with Mock Server

```bash
npm run test:integration:with-mock
```

This automatically:
1. Starts the mock WebSocket server
2. Waits 2 seconds for server to be ready
3. Runs integration tests
4. Stops the server when complete

### Run Tests Against Production Backend

```bash
npm run test:integration
```

### Run Tests in Watch Mode

```bash
npm run test:integration:watch
```

## Example 1: Basic Test Execution

### Command
```bash
npm run test:integration:with-mock
```

### Expected Output
```
🚀 Starting Frontend Integration Test Runner...

📋 Tests: WebSocket Client ↔ Backend Server

📝 Running 6 Frontend Integration Tests...

✅ Test 1/6: WebSocket Connection - PASS (42ms)
✅ Test 2/6: Message Parsing - PASS (1234ms)
✅ Test 3/6: Execution Request - PASS (1312ms)
✅ Test 4/6: Progress Events - PASS (1245ms)
✅ Test 5/6: Complete Events - PASS (1256ms)
✅ Test 6/6: Error Handling - PASS (2013ms)

============================================================
📊 FRONTEND INTEGRATION TEST RESULTS
============================================================

1. ✅ WebSocket Connection
   Duration: 42ms
2. ✅ Message Parsing & Validation
   Duration: 1234ms
3. ✅ Execution Request Handling
   Duration: 1312ms
4. ✅ Progress Event Handling
   Duration: 1245ms
5. ✅ Complete Event Handling
   Duration: 1256ms
6. ✅ Error Scenario Handling
   Duration: 2013ms

============================================================
PASSED: 6/6
FAILED: 0/6
TOTAL TIME: 7543ms
============================================================

🎉 ALL FRONTEND TESTS PASSED! 🎉
```

## Example 2: Tests with Vitest Reporter

### Command
```bash
npm run test:integration:watch
```

### Expected Output
```
 ✓ src/__tests__/integration/frontend-integration.test.ts (6)
   ✓ Frontend Integration Tests (6)
     ✓ should run all integration tests
     ✓ WebSocket connection test
     ✓ Message parsing test
     ✓ Execution request test
     ✓ Progress event handling test
     ✓ Complete event handling test
     ✓ Error scenario handling test

Test Files  1 passed (1)
     Tests  6 passed (6)
  Screens  0 passed (0)
  Server   0 passed (0)
  Speed    8.23ms
```

## Example 3: Custom WebSocket URL

### Command
```bash
WS_URL=ws://staging-api.example.com:3000/ws npm run test:integration
```

### Expected Output
```
🚀 Starting Frontend Integration Test Runner...

📋 Tests: WebSocket Client ↔ Backend Server (Custom URL: ws://staging-api.example.com:3000/ws)

📝 Running 6 Frontend Integration Tests...

✅ Test 1/6: WebSocket Connection - PASS (156ms)
✅ Test 2/6: Message Parsing - PASS (1842ms)
... (all tests pass)
```

## Example 4: Failed Connection Scenario

### Situation
Backend server is not running

### Command
```bash
npm run test:integration
```

### Expected Output
```
🚀 Starting Frontend Integration Test Runner...

📋 Tests: WebSocket Client ↔ Backend Server

📝 Running 6 Frontend Integration Tests...

❌ Test 1/6: WebSocket Connection - FAIL (timeout)
❌ Test 2/6: Message Parsing - FAIL (1500ms)
❌ Test 3/6: Execution Request - FAIL (1500ms)
❌ Test 4/6: Progress Events - FAIL (1500ms)
❌ Test 5/6: Complete Events - FAIL (1500ms)
❌ Test 6/6: Error Handling - FAIL (2000ms)

============================================================
📊 FRONTEND INTEGRATION TEST RESULTS
============================================================

1. ❌ WebSocket Connection
   Duration: 5087ms
   Message: Connection timeout after 5s
2. ❌ Message Parsing & Validation
   Duration: 1501ms
   Message: Connection failed
3. ❌ Execution Request Handling
   Duration: 1502ms
   Message: Connection failed
4. ❌ Progress Event Handling
   Duration: 1501ms
   Message: Connection failed
5. ❌ Complete Event Handling
   Duration: 1501ms
   Message: Connection failed
6. ❌ Error Scenario Handling
   Duration: 2000ms
   Message: Connection failed

============================================================
PASSED: 0/6
FAILED: 6/6
TOTAL TIME: 13693ms
============================================================

⚠️ SOME FRONTEND TESTS FAILED

Exit Code: 1
```

## Example 5: Partial Failure (Backend Not Responding)

### Situation
Backend connects but doesn't respond to messages

### Expected Output
```
✅ Test 1/6: WebSocket Connection - PASS (31ms)
❌ Test 2/6: Message Parsing - FAIL (1500ms)
❌ Test 3/6: Execution Request - FAIL (1500ms)
❌ Test 4/6: Progress Events - FAIL (1500ms)
❌ Test 5/6: Complete Events - FAIL (1500ms)
❌ Test 6/6: Error Handling - FAIL (2000ms)

============================================================
PASSED: 1/6
FAILED: 5/6
TOTAL TIME: 9032ms
============================================================

⚠️ SOME FRONTEND TESTS FAILED

Exit Code: 1
```

## Example 6: Mock Server Output

### Command
```bash
npm run test:mock-server
```

### Server Output (in separate terminal)
```
🚀 Mock WebSocket Server started on ws://localhost:3000

Listening for integration test connections...

[WS] Client connected
[MSG] Received: execute
[OK] Execute request for runId: test-parse-001
[OK] Run test-parse-001 completed
[WS] Client disconnected

[WS] Client connected
[MSG] Received: execute
[OK] Execute request for runId: test-exec-12345
[OK] Run test-exec-12345 completed
[WS] Client disconnected

[WS] Client connected
[MSG] Received: execute
[OK] Execute request for runId: test-progress-001
[OK] Run test-progress-001 completed
[WS] Client disconnected

[WS] Client connected
[MSG] Received: execute
[OK] Execute request for runId: test-complete-001
[OK] Run test-complete-001 completed
[WS] Client disconnected

[WS] Client connected
[MSG] Received: execute
[FAIL] Invalid provider: invalid
[WS] Client disconnected

✅ Mock WebSocket Server is ready for integration tests
   Run: npm run test:integration
```

## Example 7: CI/CD Pipeline Integration

### GitHub Actions Workflow
```yaml
name: Frontend Integration Tests

on: [push, pull_request]

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run integration tests
        run: npm run test:integration:with-mock
      
      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: test-results/
```

## Example 8: Performance Benchmarks

### With Mock Server (Local Machine)
```
Test Duration Breakdown:
- WebSocket Connection:       42ms
- Message Parsing:            1234ms
- Execution Request:          1312ms
- Progress Events:            1245ms
- Complete Events:            1256ms
- Error Handling:             2013ms
─────────────────────────────────
Total:                        7543ms (9 seconds with setup)

Average per test:             1257ms
Network overhead:             ~100-200ms total
Backend simulation time:      ~1500ms per test
```

### Compared to Real Backend
```
Test Duration Breakdown:
- WebSocket Connection:       25ms
- Message Parsing:            1234ms (real processing)
- Execution Request:          2100ms (real processing)
- Progress Events:            1800ms (real processing)
- Complete Events:            1900ms (real processing)
- Error Handling:             2000ms (real error handling)
─────────────────────────────────
Total:                        9059ms

Average per test:             1510ms
Network overhead:             ~50-100ms total
Backend processing time:      variable per endpoint
```

## Example 9: Test Logs with Timestamps

### Full Test Log
```
11:23:45.123 [INFO] Starting test runner
11:23:45.234 [INFO] Connecting to ws://localhost:3000/ws
11:23:45.256 [PASS] WebSocket Connection (42ms)
11:23:45.258 [INFO] Sending execute message for test-parse-001
11:23:45.500 [DEBUG] Received: run-updated (runId: test-parse-001)
11:23:46.289 [PASS] Message Parsing (1031ms)
11:23:46.291 [INFO] Sending execute message for test-exec-12345
11:23:46.700 [DEBUG] Received: run-updated (runId: test-exec-12345)
11:23:47.603 [PASS] Execution Request (1312ms)
11:23:47.605 [INFO] Sending execute message for test-progress-001
11:23:47.900 [DEBUG] Received: phase-progress (phase: processing)
11:23:48.850 [PASS] Progress Events (1245ms)
11:23:48.852 [INFO] Sending execute message for test-complete-001
11:23:49.100 [DEBUG] Received: run-updated (status: running)
11:23:50.108 [PASS] Complete Events (1256ms)
11:23:50.110 [INFO] Sending execute message with invalid provider
11:23:50.400 [DEBUG] Received: error (provider: invalid)
11:23:52.123 [PASS] Error Handling (2013ms)
11:23:52.125 [SUMMARY] 6/6 tests passed in 7002ms
```

## Example 10: Error Scenarios

### Missing runId
```json
Request:
{
  "type": "execute",
  "data": {
    "provider": "claude"
  }
}

Response:
{
  "type": "error",
  "error": "runId is required"
}
```

### Invalid Provider
```json
Request:
{
  "type": "execute",
  "data": {
    "runId": "test-123",
    "provider": "invalid",
    "mode": "cli-lite"
  }
}

Response:
{
  "type": "error",
  "error": "Invalid provider specified",
  "provider": "invalid"
}
```

### Malformed JSON
```json
Request:
{not valid json}

Response:
{
  "type": "error",
  "error": "Failed to parse message",
  "message": "Unexpected token..."
}
```

## Test Execution Timeline

```
Timeline for Single Test Run:
0ms     ├─ Start
100ms   ├─ Connect to WebSocket
150ms   ├─ Test 1: WebSocket Connection (42ms)
300ms   ├─ Test 2: Message Parsing starts
1500ms  ├─ Test 2: Message Parsing ends (1234ms)
1600ms  ├─ Test 3: Execution Request starts
2900ms  ├─ Test 3: Execution Request ends (1312ms)
3000ms  ├─ Test 4: Progress Events starts
4300ms  ├─ Test 4: Progress Events ends (1245ms)
4400ms  ├─ Test 5: Complete Events starts
5700ms  ├─ Test 5: Complete Events ends (1256ms)
5800ms  ├─ Test 6: Error Handling starts
7900ms  ├─ Test 6: Error Handling ends (2013ms)
8000ms  └─ Complete and exit
```

## Running Specific Tests

### Test Only Connection
```typescript
// Modify test file to comment out other tests
await this.testWebSocketConnection();
```

### Test Only Error Handling
```typescript
// Run only error test
await this.testErrorScenarioHandling();
```

### Test with Extended Timeout
```bash
# Modify in source:
private testTimeout: number = 15000; // 15 seconds
```

## Exit Codes

| Code | Meaning | Example |
|------|---------|---------|
| 0 | All tests passed | All 6/6 tests successful |
| 1 | Some tests failed | 3/6 tests failed |
| 2 | Test runner error | Cannot start server |
| 127 | Command not found | tsx not installed |

## Next Steps

1. Choose execution method (mock server or real backend)
2. Run tests
3. Interpret results
4. Debug failures if any
5. Integrate into CI/CD
6. Monitor over time
