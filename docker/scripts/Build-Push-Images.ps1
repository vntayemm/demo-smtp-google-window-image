# Build + push frontend/backend images to registry (from Docker Desktop)
#
# Prerequisite:
#   docker login registry.portlogics.com.vn -u <REGISTRY_USER>
#   # Windows containers: Switch to Windows containers + Dockerfile.windows
#   # Linux engine: use -Platform linux
#
# Examples:
#   .\docker\scripts\Build-Push-Images.ps1
#   .\docker\scripts\Build-Push-Images.ps1 -Platform linux -Push
#   .\docker\scripts\Build-Push-Images.ps1 -Platform windows -Push
#   # always tag :demo (override: -Tag / IMAGE_TAG)
[CmdletBinding()]
param(
  [ValidateSet("windows", "linux")]
  [string]$Platform = "windows",

  [string]$Registry = $(if ($env:IMAGE_REGISTRY) { $env:IMAGE_REGISTRY } else { "registry.portlogics.com.vn" }),

  [string]$ImageBase = $(if ($env:IMAGE_BASE) { $env:IMAGE_BASE } else {
    if ($Platform -eq "windows") { "$Registry/demo-smtp/win" } else { "$Registry/demo-smtp/linux" }
  }),

  [string]$Tag = $(if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { "demo" }),

  [string]$WindowsBase = $(if ($env:WINDOWS_BASE) { $env:WINDOWS_BASE } else { "mcr.microsoft.com/windows/servercore:ltsc2019" }),

  [switch]$Push,
  [switch]$BuildOnly,
  [switch]$AlsoLatest
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

if ($BuildOnly) { $Push = $false }
if (-not $BuildOnly -and -not $PSBoundParameters.ContainsKey("Push")) {
  # default: build + push when not specified
  $Push = $true
}

Write-Host "RepoRoot   : $RepoRoot"
Write-Host "Platform   : $Platform"
Write-Host "ImageBase  : $ImageBase"
Write-Host "Tag        : $Tag"
Write-Host "Push       : $Push"

$osType = (docker info --format "{{.OSType}}" 2>$null)
if ($Platform -eq "windows" -and $osType -ne "windows") {
  throw "Docker OSType=$osType. Switch to Windows containers before -Platform windows."
}
if ($Platform -eq "linux" -and $osType -ne "linux") {
  throw "Docker OSType=$osType. Switch to Linux containers before -Platform linux."
}

$services = @(
  @{ Name = "gateway";            Context = "."; Dockerfile = "docker/backend/Dockerfile.$Platform"; BuildArgs = @{ SERVICE = "gateway" } },
  @{ Name = "recaptcha-service";  Context = "."; Dockerfile = "docker/backend/Dockerfile.$Platform"; BuildArgs = @{ SERVICE = "recaptcha-service" } },
  @{ Name = "smtp-service";       Context = "."; Dockerfile = "docker/backend/Dockerfile.$Platform"; BuildArgs = @{ SERVICE = "smtp-service" } },
  @{ Name = "frontend-web";       Context = "."; Dockerfile = "docker/frontend/Dockerfile.$Platform"; BuildArgs = @{} }
)

function Invoke-DockerBuild {
  param($Svc)
  $imageTag = "$ImageBase/$($Svc.Name):$Tag"
  $df = Join-Path $RepoRoot $Svc.Dockerfile
  if (-not (Test-Path $df)) {
    throw "Dockerfile not found: $($Svc.Dockerfile)"
  }

  $dockerArgs = @(
    "build",
    "-f", $Svc.Dockerfile,
    "-t", $imageTag
  )
  if ($AlsoLatest) {
    $dockerArgs += @("-t", "$ImageBase/$($Svc.Name):latest")
  }
  foreach ($k in $Svc.BuildArgs.Keys) {
    $dockerArgs += @("--build-arg", "$k=$($Svc.BuildArgs[$k])")
  }
  if ($Platform -eq "windows") {
    $dockerArgs += @("--build-arg", "WINDOWS_BASE=$WindowsBase")
  }
  $dockerArgs += $Svc.Context

  Write-Host "`n=== BUILD $($Svc.Name) -> $imageTag ===" -ForegroundColor Cyan
  # Do not capture docker stdout (would pollute return value / $built)
  & docker @dockerArgs
  if ($LASTEXITCODE -ne 0) { throw "docker build failed: $($Svc.Name)" }
}

function Invoke-DockerPush {
  param([string]$Image)
  Write-Host "=== PUSH $Image ===" -ForegroundColor Green
  & docker push $Image
  if ($LASTEXITCODE -ne 0) { throw "docker push failed: $Image" }
}

$built = [System.Collections.Generic.List[string]]::new()
foreach ($svc in $services) {
  Invoke-DockerBuild -Svc $svc
  [void]$built.Add("$ImageBase/$($svc.Name):$Tag")
  if ($AlsoLatest) {
    [void]$built.Add("$ImageBase/$($svc.Name):latest")
  }
}

if ($Push) {
  if ($env:REGISTRY_USER -and $env:REGISTRY_PASSWORD) {
    Write-Host "`n=== docker login $Registry ===" -ForegroundColor Yellow
    $env:REGISTRY_PASSWORD | docker login $Registry -u $env:REGISTRY_USER --password-stdin
    if ($LASTEXITCODE -ne 0) { throw "docker login failed" }
  } else {
    Write-Host "REGISTRY_USER/PASSWORD not set - assume already docker login $Registry" -ForegroundColor Yellow
  }

  foreach ($img in ($built | Select-Object -Unique)) {
    Invoke-DockerPush -Image $img
  }
}

Write-Host "`nDone. Server pull example:" -ForegroundColor Cyan
Write-Host "  docker pull $ImageBase/gateway:$Tag"
Write-Host "  docker pull $ImageBase/recaptcha-service:$Tag"
Write-Host "  docker pull $ImageBase/smtp-service:$Tag"
Write-Host "  docker pull $ImageBase/frontend-web:$Tag"
Write-Host "Or: IMAGE_TAG=$Tag npm run docker:pull:up   (see docker/README.md)"
