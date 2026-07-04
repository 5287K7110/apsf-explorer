# Frontend Integration Test Suite

Frontend ↔ Backend WebSocket 統合テスト

## Overview

This integration test suite validates the communication between the React frontend and the WebSocket backend server. It tests message parsing, event handling, request/response cycles, and error scenarios.

## Test Coverage

### 1. WebSocket Connection
- Tests basic WebSocket connection establishment
- Validates connection timeout handling
- Verifies proper cleanup on disconnect

### 2. Message Parsing & Validation
- Validates JSON message parsing
- Checks message structure integrity
- Ensures proper type validation

### 3. Execution Request Handling
- Tests sending execution requests to backend
- Validates request payload formatting
- Verifies response reception

### 4. Progress Event Handling
- Tests phase progress event reception
- Validates progress data structure
- Checks real-time update capabilities

### 5. Complete Event Handling
- Tests completion event reception
- Validates status transitions
- Verifies final state consistency

### 6. Error Scenario Handling
- Tests error message reception
- Validates error handling flow
- Checks graceful degradation

## Installation

Install dependencies:

```bash
npm install
```

This adds the following packages:
- `ws`: WebSocket client library
- `tsx`: TypeScript executor
- `@types/ws`: TypeScript definitions for ws
- `@types/node`: Node.js type definitions

## Running Tests

### Option 1: Standalone CLI Runner

Run the integration tests as a standalone Node.js script:

```bash
npm run test:integration
```

This uses `tsx` to execute the TypeScript test runner directly.

**Environment Variables:**
- `WS_URL`: Custom WebSocket URL (default: `ws://localhost:3000/ws`)

```bash
WS_URL=ws://your-server:3000/ws npm run test:integration
```

### Option 2: Vitest Integration Tests

Run tests with Vitest for detailed reporting:

```bash
npm run test:integration:watch
```

Or run all tests:

```bash
npm test
```

### Option 3: Unit Tests Only

Run unit tests without integration tests:

```bash
npm run test:run -- --exclude src/__tests__/integration
```

## Test Output

### Success Output

```
🚀 Starting Frontend Integration Test Runner...

📋 Tests: WebSocket Client ↔ Backend Server

📝 Running 6 Frontend Integration Tests...

✅ Test 1/6: WebSocket Connection - PASS (25ms)
✅ Test 2/6: Message Parsing - PASS (1234ms)
✅ Test 3/6: Execution Request - PASS (1312ms)
✅ Test 4/6: Progress Events - PASS (1245ms)
✅ Test 5/6: Complete Events - PASS (1256ms)
✅ Test 6/6: Error Handling - PASS (2013ms)

============================================================
📊 FRONTEND INTEGRATION TEST RESULTS
============================================================

1. ✅ WebSocket Connection
   Duration: 25ms
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
TOTAL TIME: 7525ms
============================================================

🎉 ALL FRONTEND TESTS PASSED! 🎉
```

### Failure Output

```
❌ Test 1/6: WebSocket Connection - FAIL (timeout)
...
⚠️ SOME FRONTEND TESTS FAILED
```

## Test Files

### Main Test Files

- **`src/__tests__/integration/frontend-integration.test.ts`**
  - Vitest integration test suite
  - Full WebSocket integration tests
  - Can be run with `npm run test:integration:watch`

- **`scripts/run-frontend-integration-tests.ts`**
  - Standalone CLI test runner
  - Can be executed directly with `tsx`
  - Suitable for CI/CD pipelines

## Architecture

### Test Runner Components

```
FrontendIntegrationTestRunner
├── WebSocket Connection Test
├── Message Parsing Test
├── Execution Request Test
├── Progress Event Handling Test
├── Complete Event Handling Test
└── Error Scenario Test
```

### WebSocket Message Flow

```
Frontend Test        Backend Server
     |                    |
     |--- execute ------->|
     |                    |
     |<-- run-updated ----|
     |                    |
     |<-- phase-progress -|
     |                    |
     |<-- run-updated ----|
     |      (complete)    |
```

## Requirements

### Backend Server

The tests require a backend WebSocket server running on:
- **Default:** `ws://localhost:3000/ws`
- **Configurable:** Set `WS_URL` environment variable

### Server Message Format

The backend must respond to test messages with the following structure:

```typescript
interface ExecuteRequest {
  type: 'execute';
  data: {
    runId: string;
    provider: string;
    mode: string;
  };
}

interface RunUpdateEvent {
  type: 'run-updated';
  runId: string;
  updates: {
    status?: string;
    progress?: number;
  };
}

interface PhaseProgressEvent {
  type: 'phase-progress';
  runId: string;
  phase: string;
  progress: number;
}

interface ErrorEvent {
  type: 'error' | string;
  error?: string;
  message?: string;
}
```

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run Frontend Integration Tests
  run: npm run test:integration
  env:
    WS_URL: ws://localhost:3000/ws
```

### Docker Compose Example

```yaml
services:
  backend:
    image: apsf-backend
    ports:
      - "3000:3000"

  tests:
    image: node:18
    command: npm run test:integration
    environment:
      - WS_URL=ws://backend:3000/ws
    depends_on:
      - backend
```

## Troubleshooting

### Connection Timeout

**Problem:** Test fails with "Connection timeout after 5s"

**Solutions:**
1. Verify backend server is running on the correct port
2. Check firewall settings
3. Verify WebSocket URL with `WS_URL` environment variable
4. Increase timeout by modifying test timeout value

### Message Not Received

**Problem:** Tests pass connection but fail on message reception

**Solutions:**
1. Verify backend is sending correct message format
2. Check message event type names match test expectations
3. Verify runId matches between request and response
4. Check backend logs for errors

### Connection Refused

**Problem:** Error: "ECONNREFUSED"

**Solutions:**
1. Ensure backend server is running: `npm run dev` (backend)
2. Check correct hostname and port
3. Verify no firewall blocking WebSocket connections
4. Check for port conflicts with other services

## Performance Benchmarks

Typical test execution times (with healthy backend):

| Test | Duration |
|------|----------|
| WebSocket Connection | 20-50ms |
| Message Parsing | 1000-1500ms |
| Execution Request | 1000-1500ms |
| Progress Events | 1000-1500ms |
| Complete Events | 1000-1500ms |
| Error Handling | 1500-2000ms |
| **Total** | **~7000-9000ms** |

## Development

### Adding New Tests

1. Add test method to `FrontendIntegrationTestRunner` class
2. Increment test counter in `runTests()`
3. Update test count in console output
4. Add corresponding Vitest test case

### Modifying Timeouts

Edit `testTimeout` in test runner:

```typescript
private testTimeout: number = 5000; // 5 seconds
```

### Custom Server URL

```bash
WS_URL=ws://custom-host:3000/ws npm run test:integration
```

## Related Files

- `src/utils/wsClient.ts` - WebSocket client implementation
- `src/hooks/useWebSocket.ts` - React hook for WebSocket
- `src/types/api.ts` - Type definitions
- `src/store/runStore.ts` - State management
- `vitest.config.ts` - Vitest configuration

## License

Part of apsf-explorer project
