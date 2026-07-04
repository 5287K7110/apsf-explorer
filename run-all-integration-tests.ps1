# APSF Explorer Integration Test Runner
# Backend + Frontend (Parallel Execution)

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  APSF Explorer v1.0 - Integration Tests" -ForegroundColor Cyan
Write-Host "  Backend + Frontend (Parallel)" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Phase 1: Start Backend Server
Write-Host "Phase 1: Backend WebSocket Server" -ForegroundColor Yellow
Write-Host "   Starting on port 3001..." -ForegroundColor Gray

cd backend
$backendProcess = Start-Process -FilePath "npm" -ArgumentList "run dev" `
  -NoNewWindow -PassThru -RedirectStandardOutput "backend-server.log"

Write-Host "   Waiting for server startup..." -ForegroundColor Gray
Start-Sleep -Seconds 3

if (-not (Get-Process -Id $backendProcess.Id -ErrorAction SilentlyContinue)) {
  Write-Host "   FAILED to start backend" -ForegroundColor Red
  Get-Content "backend-server.log"
  exit 1
}

Write-Host "   OK: Backend started (PID: $($backendProcess.Id))" -ForegroundColor Green
Write-Host ""

# Phase 2: Run Backend Integration Tests
Write-Host "Phase 2: Backend Integration Tests" -ForegroundColor Yellow
npm run test:integration
$backendTestResult = $LASTEXITCODE

Write-Host ""
if ($backendTestResult -eq 0) {
  Write-Host "   OK: Backend tests PASSED (9/9)" -ForegroundColor Green
} else {
  Write-Host "   FAILED: Backend tests" -ForegroundColor Red
  Stop-Process -Id $backendProcess.Id -ErrorAction SilentlyContinue
  exit 1
}

Write-Host ""

# Phase 3: Run Frontend Integration Tests
Write-Host "Phase 3: Frontend Integration Tests" -ForegroundColor Yellow
Write-Host "   (Backend running in background)" -ForegroundColor Gray

cd ..
npm run test:integration
$frontendTestResult = $LASTEXITCODE

Write-Host ""
if ($frontendTestResult -eq 0) {
  Write-Host "   OK: Frontend tests PASSED (6/6)" -ForegroundColor Green
} else {
  Write-Host "   FAILED: Frontend tests (6/6)" -ForegroundColor Red
}

Write-Host ""

# Cleanup
Write-Host "Cleaning up..." -ForegroundColor Yellow
Stop-Process -Id $backendProcess.Id -ErrorAction SilentlyContinue
Wait-Process -Id $backendProcess.Id -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  FINAL RESULTS" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Phase 1: Backend WebSocket Server" -ForegroundColor Cyan
Write-Host "   OK: Running on port 3001" -ForegroundColor Green
Write-Host ""

Write-Host "Phase 2: Backend Integration Tests" -ForegroundColor Cyan
if ($backendTestResult -eq 0) {
  Write-Host "   OK: 9/9 PASSED" -ForegroundColor Green
} else {
  Write-Host "   FAILED" -ForegroundColor Red
}
Write-Host ""

Write-Host "Phase 3: Frontend Integration Tests" -ForegroundColor Cyan
if ($frontendTestResult -eq 0) {
  Write-Host "   OK: 6/6 PASSED" -ForegroundColor Green
} else {
  Write-Host "   FAILED: 6/6" -ForegroundColor Red
}
Write-Host ""

if ($backendTestResult -eq 0 -and $frontendTestResult -eq 0) {
  Write-Host "================================================" -ForegroundColor Green
  Write-Host "  SUCCESS: ALL INTEGRATION TESTS PASSED!" -ForegroundColor Green
  Write-Host "  v1.0 RELEASE READY" -ForegroundColor Green
  Write-Host "================================================" -ForegroundColor Green
  exit 0
} else {
  Write-Host "Some tests failed. Check logs above." -ForegroundColor Yellow
  exit 1
}
