# Start platform tools on Windows host (Docker Windows engine cannot run Linux MailDev/Jaeger images).
#
#   Jaeger UI : http://127.0.0.1:16686   OTLP :4318
#   MailDev   : http://127.0.0.1:1080    SMTP :1025
#   SMSDev    : http://127.0.0.1:4000    API  :4001
#
# Usage:
#   .\docker\scripts\Start-Platform-Host.ps1
#   .\docker\scripts\Start-Platform-Host.ps1 -SkipJaeger
#   .\docker\scripts\Start-Platform-Host.ps1 -SkipSmsDev

[CmdletBinding()]
param(
  [switch]$SkipJaeger,
  [switch]$SkipMailDev,
  [switch]$SkipSmsDev
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

function Start-Bg {
  param([string]$Name, [string]$FilePath, [string[]]$ArgumentList, [hashtable]$EnvVars)
  Write-Host "Starting $Name ..." -ForegroundColor Cyan
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $FilePath
  $psi.Arguments = ($ArgumentList -join " ")
  $psi.WorkingDirectory = "$RepoRoot"
  $psi.UseShellExecute = $false
  foreach ($k in $EnvVars.Keys) {
    $psi.EnvironmentVariables[$k] = [string]$EnvVars[$k]
  }
  [void][System.Diagnostics.Process]::Start($psi)
}

if (-not $SkipJaeger) {
  $jaegerExe = Join-Path $RepoRoot "tools\jaeger\jaeger-1.57.0-windows-amd64\jaeger-all-in-one.exe"
  if (-not (Test-Path $jaegerExe)) {
    Write-Host "WARN: missing $jaegerExe — run Start-Jaeger-Host.ps1 after downloading Jaeger zip." -ForegroundColor Yellow
  } else {
    Start-Bg -Name "Jaeger" -FilePath $jaegerExe -ArgumentList @() -EnvVars @{ COLLECTOR_OTLP_ENABLED = "true" }
  }
}

if (-not $SkipMailDev) {
  Start-Bg -Name "MailDev" -FilePath "npm.cmd" -ArgumentList @(
    "exec", "--yes", "--", "maildev", "--web", "1080", "--smtp", "1025", "--ip", "127.0.0.1"
  ) -EnvVars @{}
}

if (-not $SkipSmsDev) {
  Start-Bg -Name "SMSDev" -FilePath "npm.cmd" -ArgumentList @(
    "exec", "--yes", "--", "@relay-works/sms-dev", "start", "--ui-port", "4000", "--api-port", "4001"
  ) -EnvVars @{}
}

Write-Host ""
Write-Host "Platform host URLs:" -ForegroundColor Green
Write-Host "  Jaeger  http://127.0.0.1:16686"
Write-Host "  MailDev http://127.0.0.1:1080   (SMTP 127.0.0.1:1025)"
Write-Host "  SMSDev  http://127.0.0.1:4000   (API  :4001)"
Write-Host "Point SMTP: EMAIL_HOST=127.0.0.1 EMAIL_PORT=1025"
