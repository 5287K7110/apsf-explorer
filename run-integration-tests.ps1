Write-Host "╔════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  APSF Explorer - Integration Test Suite           ║" -ForegroundColor Cyan
Write-Host "║  Frontend ↔ Backend ↔ CLI                         ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Backend starting
Write-Host "📦 Starting Backend Server..." -ForegroundColor Yellow
$backendProcess = Start-Process -FilePath "npm" -ArgumentList "run dev" -NoNewWindow -PassThru -WorkingDirectory "backend" -RedirectStandardOutput "backend.log"
Start-Sleep -Seconds 5

# Check if running
if ($null -eq (Get-Process -Id $backendProcess.Id -ErrorAction SilentlyContinue)) {
  Write-Host "❌ Backend failed to start" -ForegroundColor Red
  Get-Content "backend.log"
  exit 1
}
Write-Host "✅ Backend running (PID: $($backendProcess.Id))" -ForegroundColor Green

# Run tests
Write-Host ""
Write-Host "🧪 Running Integration Tests..." -ForegroundColor Yellow
& npx tsx run-integration-tests.ts

$testResult = $LASTEXITCODE

# Cleanup
Write-Host ""
Write-Host "🧹 Cleaning up..." -ForegroundColor Yellow
Stop-Process -Id $backendProcess.Id -ErrorAction SilentlyContinue
Wait-Process -Id $backendProcess.Id -ErrorAction SilentlyContinue

# Report
Write-Host ""
if ($testResult -eq 0) {
  Write-Host "✅ Integration Tests PASSED" -ForegroundColor Green
  exit 0
} else {
  Write-Host "❌ Integration Tests FAILED" -ForegroundColor Red
  exit 1
}
