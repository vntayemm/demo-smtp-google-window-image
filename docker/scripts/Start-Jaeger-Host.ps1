# Start Jaeger UI on host (Windows). Official Jaeger Docker image is Linux-only.
# UI: http://127.0.0.1:16686  OTLP HTTP: :4318  OTLP gRPC: :4317
#
# Prerequisite (once):
#   mkdir tools\jaeger
#   curl -L -o tools\jaeger\jaeger.zip https://github.com/jaegertracing/jaeger/releases/download/v1.57.0/jaeger-1.57.0-windows-amd64.zip
#   tar -xf tools\jaeger\jaeger.zip -C tools\jaeger
#
# Usage:
#   .\docker\scripts\Start-Jaeger-Host.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$exe = Join-Path $RepoRoot "tools\jaeger\jaeger-1.57.0-windows-amd64\jaeger-all-in-one.exe"

if (-not (Test-Path $exe)) {
  throw "Missing $exe — download Jaeger 1.57 Windows amd64 zip into tools/jaeger first."
}

$env:COLLECTOR_OTLP_ENABLED = "true"
Write-Host "Starting Jaeger UI http://127.0.0.1:16686 (OTLP :4318)" -ForegroundColor Cyan
& $exe
