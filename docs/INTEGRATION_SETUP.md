# Frontend Integration Test Setup Guide

## Quick Start

### 1. Install Dependencies

```bash
cd C:\Users\PC_User\PRJ\apsf-explorer
npm install
```

### 2. Start Backend Server

Ensure your backend WebSocket server is running:

```bash
# In backend directory
npm run dev
```

Default backend runs on: `ws://localhost:3000/ws`

### 3. Run Integration Tests

```bash
npm run test:integration
```

## Test Execution Flow

### Standalone Runner (Recommended for CI/CD)

```bash
npm run test:integration
```

**What happens:**
1. Connects to WebSocket backend
2. Runs 6 sequential tests
3. Reports pass/fail for each test
4. Displays summary statistics
5. Exits with code 0 (pass) or 1 (fail)

### Vitest Integration (Development)

```bash
npm run test:integration:watch
```

**What happens:**
1. Launches Vitest in watch mode
2. Runs integration tests with detailed reporting
3. Can rerun on file changes
4. Shows detailed test output

## Test Scenarios

### Scenario 1: Local Backend + Frontend Tests

```
Terminal 1 - Backend:
$ cd backend
$ npm run dev
Listening on ws://localhost:3000/ws

Terminal 2 - Tests:
$ npm run test:integration
🚀 Starting Frontend Integration Test Runner...
✅ Test 1/6: WebSocket Connection - PASS (25ms)
✅ Test 2/6: Message Parsing - PASS (1234ms)
... (all tests pass)
🎉 ALL FRONTEND TESTS PASSED! 🎉
```

### Scenario 2: Remote Backend

```bash
WS_URL=ws://staging-api.example.com:3000/ws npm run test:integration
```

### Scenario 3: Docker Compose

Create `docker-compose.test.yml`:

```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=test

  frontend-tests:
    build: .
    command: npm run test:integration
    depends_on:
      - backend
    environment:
      - WS_URL=ws://backend:3000/ws
```

Run:
```bash
docker-compose -f docker-compose.test.yml up --abort-on-container-exit
```

## Expected Results

### Healthy Backend

All 6 tests pass:
```
PASSED: 6/6
FAILED: 0/6
TOTAL TIME: ~7-9 seconds
Exit Code: 0
```

### Backend Not Running

Connection fails immediately:
```
❌ Test 1/6: WebSocket Connection - FAIL (timeout)
PASSED: 0/6
FAILED: 6/6
Exit Code: 1
```

### Backend Not Responding to Messages

Connection passes, but subsequent tests fail:
```
✅ Test 1/6: WebSocket Connection - PASS (25ms)
❌ Test 2/6: Message Parsing - FAIL (1500ms)
❌ Test 3/6: Execution Request - FAIL (1500ms)
PASSED: 1/6
FAILED: 5/6
Exit Code: 1
```

## Debugging

### Enable Verbose Logging

Modify test file to add logging:

```bash
# Run with Node debugger
node --inspect-brk node_modules/.bin/tsx scripts/run-frontend-integration-tests.ts
```

### Check Backend Connection

Test WebSocket connection manually:

```bash
# Install websocat if not present
cargo install websocat

# Connect to backend
websocat ws://localhost:3000/ws

# Send test message
{"type":"execute","data":{"runId":"test","provider":"claude"}}

# Should receive response
```

### Monitor Network Traffic

```bash
# Using curl or similar tools to debug WebSocket
node scripts/debug-ws-connection.ts
```

### Check Test Timeout

Increase timeout for slow backends:

Edit `scripts/run-frontend-integration-tests.ts`:
```typescript
private testTimeout: number = 10000; // Increase from 5000
```

## Test Message Format

### Request Format

```json
{
  "type": "execute",
  "data": {
    "runId": "test-exec-12345",
    "provider": "claude",
    "mode": "cli-lite"
  }
}
```

### Expected Responses

**Run Update Event:**
```json
{
  "type": "run-updated",
  "runId": "test-exec-12345",
  "updates": {
    "status": "running",
    "progress": 50
  }
}
```

**Phase Progress Event:**
```json
{
  "type": "phase-progress",
  "runId": "test-exec-12345",
  "phase": "execution",
  "progress": 75
}
```

**Completion Event:**
```json
{
  "type": "run-updated",
  "runId": "test-exec-12345",
  "updates": {
    "status": "completed",
    "progress": 100
  }
}
```

**Error Event:**
```json
{
  "type": "error",
  "error": "Invalid provider specified"
}
```

## Backend Implementation Checklist

For backend to pass all integration tests:

- [ ] WebSocket server listening on port 3000
- [ ] Echo execution requests with acknowledgment
- [ ] Send run-updated events for test runIds
- [ ] Send phase-progress events with valid phase data
- [ ] Send completion status update
- [ ] Send error event for invalid provider
- [ ] Proper JSON message formatting
- [ ] Connection doesn't drop unexpectedly
- [ ] Handles rapid consecutive messages
- [ ] Cleans up resources on disconnect

## Continuous Integration

### GitHub Actions

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      backend:
        image: apsf-backend:latest
        options: >-
          --health-cmd="curl -f http://localhost:3000/health || exit 1"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test:integration
        env:
          WS_URL: ws://localhost:3000/ws
```

### GitLab CI

```yaml
test:integration:
  stage: test
  services:
    - apsf-backend:latest
  script:
    - npm install
    - npm run test:integration
  environment:
    variables:
      WS_URL: "ws://apsf-backend:3000/ws"
```

## Performance Optimization

### Parallel Testing

Currently tests run sequentially. To parallelize (requires backend changes):

Edit `scripts/run-frontend-integration-tests.ts`:
```typescript
// Change from await this.testWebSocketConnection()
// To Promise.all() for concurrent execution
```

### Connection Pooling

Reuse WebSocket connections across tests (advanced):

```typescript
class PooledTestRunner extends FrontendIntegrationTestRunner {
  private wsPool: WSClient[] = [];
  
  private getPooledConnection() {
    return this.wsPool.pop() || this.createWsClient();
  }
}
```

## Troubleshooting Checklist

- [ ] Backend is running: `ps aux | grep backend`
- [ ] Backend listening on correct port: `netstat -an | grep 3000`
- [ ] Firewall allows WebSocket: `telnet localhost 3000`
- [ ] No other service on port 3000: `lsof -i :3000`
- [ ] Backend logs show connection attempts
- [ ] Network between frontend and backend working
- [ ] DNS resolves localhost correctly
- [ ] No environment variable conflicts

## Next Steps

1. Run integration tests successfully
2. Add to CI/CD pipeline
3. Create smoke tests for production deployment
4. Monitor test performance over time
5. Expand test coverage for edge cases

## Related Documentation

- [Integration Tests Guide](./INTEGRATION_TESTS.md)
- [Backend WebSocket API](../backend/docs/WEBSOCKET_API.md)
- [Frontend Architecture](../docs/ARCHITECTURE.md)
