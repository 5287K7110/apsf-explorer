# Frontend Integration Testing - Quick Start

## Installation (One Time)

```bash
npm install
```

## Running Tests

### Option 1: With Mock Server (Recommended for Development)
```bash
npm run test:integration:with-mock
```
Starts mock server, waits, runs tests, then stops server. One command does it all!

### Option 2: Against Real Backend
```bash
npm run test:integration
```
Requires your backend to be running on `ws://localhost:3000/ws`

### Option 3: Watch Mode (Development)
```bash
npm run test:integration:watch
```
Runs tests with Vitest, great for debugging

## Expected Results

### Success
```
✅ Test 1/6: WebSocket Connection - PASS
✅ Test 2/6: Message Parsing - PASS
✅ Test 3/6: Execution Request - PASS
✅ Test 4/6: Progress Events - PASS
✅ Test 5/6: Complete Events - PASS
✅ Test 6/6: Error Handling - PASS

PASSED: 6/6
Exit Code: 0
```

### Failure
```
❌ Test 1/6: WebSocket Connection - FAIL (timeout)
...
PASSED: 0/6
Exit Code: 1
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Connection timeout | Ensure backend runs on port 3000 |
| Missing dependencies | Run `npm install` |
| Cannot find tsx | Run `npm install --save-dev tsx` |
| Tests hang | Check if backend is responsive |

## Manual Backend Testing

```bash
# Terminal 1: Start mock server
npm run test:mock-server

# Terminal 2: Run tests
npm run test:integration
```

## Environment Variables

```bash
# Custom backend URL
WS_URL=ws://your-server:3000/ws npm run test:integration

# Custom port for mock server
WS_PORT=3001 npm run test:mock-server
```

## Full Documentation

- [Integration Tests Guide](./docs/INTEGRATION_TESTS.md)
- [Setup Instructions](./docs/INTEGRATION_SETUP.md)
- [Test Examples](./docs/TEST_EXAMPLES.md)
- [Complete Summary](./docs/INTEGRATION_TEST_SUMMARY.md)

## Quick Test

```bash
# All-in-one command for quick verification
npm run test:integration:with-mock
```

This single command:
1. Starts the mock WebSocket server
2. Waits for it to be ready
3. Runs all 6 integration tests
4. Shows results
5. Stops the server

Done! Exit code 0 = all tests passed.
