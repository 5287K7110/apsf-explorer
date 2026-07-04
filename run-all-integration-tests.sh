#!/bin/bash

# APSF Explorer - Complete Integration Test Runner
# Backend + Frontend (Parallel Execution)
#
# Usage:
#   ./run-all-integration-tests.sh
#
# This script orchestrates the complete integration test suite:
# 1. Starts Backend WebSocket server
# 2. Runs Backend integration tests
# 3. Runs Frontend integration tests (with Backend running in background)
# 4. Cleans up and reports results

set -e

# Color definitions
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# Options
SKIP_BACKEND=false
SKIP_FRONTEND=false
BACKEND_PORT=${BACKEND_PORT:-3001}
FRONTEND_PORT=${FRONTEND_PORT:-5173}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-backend)
      SKIP_BACKEND=true
      shift
      ;;
    --skip-frontend)
      SKIP_FRONTEND=true
      shift
      ;;
    --backend-port)
      BACKEND_PORT="$2"
      shift 2
      ;;
    --frontend-port)
      FRONTEND_PORT="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   APSF Explorer - Integration Test Suite       ║${NC}"
echo -e "${CYAN}║   Backend + Frontend (Parallel Execution)       ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

START_TIME=$(date +%s)

# Variables to track results
BACKEND_RESULT=0
FRONTEND_RESULT=0
BACKEND_PID=""

# ═════════════════════════════════════════════════════════
# PHASE 1: Backend Server Startup
# ═════════════════════════════════════════════════════════

if [ "$SKIP_BACKEND" != true ]; then
  echo -e "${YELLOW}📦 Phase 1: Backend WebSocket Server${NC}"
  echo -e "${GRAY}   Starting on port $BACKEND_PORT...${NC}"

  cd backend
  npm run dev > backend-server.log 2>&1 &
  BACKEND_PID=$!

  echo -e "${GRAY}   ⏳ Waiting for server startup (5 seconds)...${NC}"
  sleep 5

  if kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${GREEN}   ✅ Backend started (PID: $BACKEND_PID)${NC}"
  else
    echo -e "${RED}   ❌ Backend failed to start${NC}"
    echo ""
    echo -e "${RED}   Backend output:${NC}"
    cat backend-server.log
    exit 1
  fi
  echo ""

  # ═════════════════════════════════════════════════════════
  # PHASE 2: Backend Integration Tests
  # ═════════════════════════════════════════════════════════

  echo -e "${YELLOW}🧪 Phase 2: Backend Integration Tests${NC}"
  echo -e "${GRAY}   Running backend integration tests...${NC}"
  echo ""

  if npm run test:integration; then
    BACKEND_RESULT=0
  else
    BACKEND_RESULT=$?
  fi

  echo ""
  if [ $BACKEND_RESULT -eq 0 ]; then
    echo -e "${GREEN}   ✅ Backend tests PASSED${NC}"
  else
    echo -e "${RED}   ❌ Backend tests FAILED (exit code: $BACKEND_RESULT)${NC}"
  fi

  cd ..
  echo ""
fi

# ═════════════════════════════════════════════════════════
# PHASE 3: Frontend Integration Tests
# ═════════════════════════════════════════════════════════

if [ "$SKIP_FRONTEND" != true ]; then
  echo -e "${YELLOW}🎨 Phase 3: Frontend Integration Tests${NC}"
  if [ -n "$BACKEND_PID" ]; then
    echo -e "${GRAY}   (Backend running in background on port $BACKEND_PORT)${NC}"
  fi
  echo ""

  if npm run test:integration; then
    FRONTEND_RESULT=0
  else
    FRONTEND_RESULT=$?
  fi

  echo ""
  if [ $FRONTEND_RESULT -eq 0 ]; then
    echo -e "${GREEN}   ✅ Frontend tests PASSED${NC}"
  else
    echo -e "${RED}   ❌ Frontend tests FAILED (exit code: $FRONTEND_RESULT)${NC}"
  fi

  echo ""
fi

# ═════════════════════════════════════════════════════════
# CLEANUP
# ═════════════════════════════════════════════════════════

if [ -n "$BACKEND_PID" ]; then
  echo -e "${YELLOW}🧹 Cleaning up...${NC}"
  kill $BACKEND_PID 2>/dev/null || true
  wait $BACKEND_PID 2>/dev/null || true
  echo -e "${GRAY}   Backend process terminated${NC}"
  echo ""
fi

# ═════════════════════════════════════════════════════════
# FINAL RESULTS
# ═════════════════════════════════════════════════════════

END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))

echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║          📊 TEST RESULTS SUMMARY                ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$SKIP_BACKEND" != true ]; then
  echo -e "${CYAN}Backend Integration Tests:${NC}"
  if [ $BACKEND_RESULT -eq 0 ]; then
    echo -e "${GREEN}   ✅ PASSED${NC}"
  else
    echo -e "${RED}   ❌ FAILED (exit code: $BACKEND_RESULT)${NC}"
  fi
  echo ""
fi

if [ "$SKIP_FRONTEND" != true ]; then
  echo -e "${CYAN}Frontend Integration Tests:${NC}"
  if [ $FRONTEND_RESULT -eq 0 ]; then
    echo -e "${GREEN}   ✅ PASSED${NC}"
  else
    echo -e "${RED}   ❌ FAILED (exit code: $FRONTEND_RESULT)${NC}"
  fi
  echo ""
fi

echo -e "${CYAN}Total Duration: ${TOTAL_DURATION}s${NC}"
echo ""

# Determine overall result
OVERALL_SUCCESS=true
if [ "$SKIP_BACKEND" != true ] && [ $BACKEND_RESULT -ne 0 ]; then
  OVERALL_SUCCESS=false
fi
if [ "$SKIP_FRONTEND" != true ] && [ $FRONTEND_RESULT -ne 0 ]; then
  OVERALL_SUCCESS=false
fi

if [ "$OVERALL_SUCCESS" = true ]; then
  echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  🎉 ALL INTEGRATION TESTS PASSED! 🎉           ║${NC}"
  echo -e "${GREEN}║     Ready for v1.0 Release                      ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
  exit 0
else
  echo -e "${RED}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  ⚠️  SOME TESTS FAILED - SEE ABOVE              ║${NC}"
  echo -e "${RED}╚══════════════════════════════════════════════════╝${NC}"
  exit 1
fi
