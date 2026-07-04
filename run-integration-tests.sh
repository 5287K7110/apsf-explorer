#!/bin/bash

echo "╔════════════════════════════════════════════════════╗"
echo "║  APSF Explorer - Integration Test Suite           ║"
echo "║  Frontend ↔ Backend ↔ CLI                         ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

# Backend starting
echo "📦 Starting Backend Server..."
cd backend
npm run dev > backend.log 2>&1 &
BACKEND_PID=$!
sleep 5

# Backend check
if ! kill -0 $BACKEND_PID 2>/dev/null; then
  echo "❌ Backend failed to start"
  cat backend.log
  exit 1
fi
echo "✅ Backend running (PID: $BACKEND_PID)"

# Run tests
echo ""
echo "🧪 Running Integration Tests..."
npx tsx run-integration-tests.ts

TEST_RESULT=$?

# Cleanup
echo ""
echo "🧹 Cleaning up..."
kill $BACKEND_PID 2>/dev/null || true
wait $BACKEND_PID 2>/dev/null || true

# Report
echo ""
if [ $TEST_RESULT -eq 0 ]; then
  echo "✅ Integration Tests PASSED"
  exit 0
else
  echo "❌ Integration Tests FAILED"
  exit 1
fi
