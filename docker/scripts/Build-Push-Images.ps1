# Build + push images (Docker Hub OR private registry)
#
# Docker Hub (user/repo only — no nested path):
#   $env:IMAGE_REGISTRY = "docker.io"
#   $env:IMAGE_BASE     = "vntayemm/demo-smtp-win"   # → vntayemm/demo-smtp-win-gateway:demo
#   docker login
#   .\docker\scripts\Build-Push-Images.ps1 -Platform windows -Push
#
# Private nested registry:
#   $env:IMAGE_REGISTRY = "registry.portlogics.com.vn"
#   $env:IMAGE_BASE     = "registry.portlogics.com.vn/demo-smtp/win"  # → .../win/gateway:demo
#
[CmdletBinding()]
param(
  [ValidateSet("windows", "linux")]
  [string]$Platform = "windows",

  [string]$Registry = $(if ($env:IMAGE_REGISTRY) { $env:IMAGE_REGISTRY } else { "docker.io" }),

  [string]$ImageBase = $(if ($env:IMAGE_BASE) { $env:IMAGE_BASE } else {
    if ($Registry -eq "docker.io") {
      if ($Platform -eq "windows") { "phuminh88/demo-smtp-win" } else { "phuminh88/demo-smtp-linux" }
    } else {
      if ($Platform -eq "windows") { "$Registry/demo-smtp/win" } else { "$Registry/demo-smtp/linux" }
    }
  }),

  [string]$Tag = $(if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { "demo" }),

  [string]$WindowsBase = $(if ($env:WINDOWS_BASE) { $env:WINDOWS_BASE } else { "mcr.microsoft.com/windows/servercore:ltsc2019" }),

  [switch]$Push,
  [switch]$BuildOnly,
  [switch]$AlsoLatest,
  [switch]$IncludeNats
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

if ($BuildOnly) { $Push = $false }
if (-not $BuildOnly -and -not $PSBoundParameters.ContainsKey("Push")) {
  $Push = $true
}

# Docker Hub = hyphen suffix; nested registry = path suffix
$useHubNaming = ($Registry -eq "docker.io") -or ($ImageBase -notmatch "/") -or ($ImageBase -match "^[^/]+/[^/]+$")
# Refine: hub when ImageBase has exactly one slash (user/name) and no deeper path after second slash for services
$useHubNaming = ($ImageBase -match "^[a-z0-9]+([._-][a-z0-9]+)*/[a-z0-9._-]+$") -and ($ImageBase -notmatch "/.*/")

function Get-ServiceImageName {
  param([string]$ServiceName)
  if ($useHubNaming) {
    return "$ImageBase-$ServiceName`:$Tag"
  }
  return "$ImageBase/$ServiceName`:$Tag"
}

Write-Host "RepoRoot   : $RepoRoot"
Write-Host "Platform   : $Platform"
Write-Host "Registry   : $Registry"
Write-Host "ImageBase  : $ImageBase"
Write-Host "Naming     : $(if ($useHubNaming) { 'DockerHub user/repo-service' } else { 'nested registry/base/service' })"
Write-Host "Tag        : $Tag"
Write-Host "Push       : $Push"

$osType = (docker info --format "{{.OSType}}" 2>$null)
if ($Platform -eq "windows" -and $osType -ne "windows") {
  throw "Docker OSType=$osType. Switch to Windows containers before -Platform windows."
}
if ($Platform -eq "linux" -and $osType -ne "linux") {
  throw "Docker OSType=$osType. Switch to Linux containers before -Platform linux."
}

$services = [System.Collections.Generic.List[hashtable]]::new()
[void]$services.Add(@{ Name = "gateway";            Context = "."; Dockerfile = "docker/backend/Dockerfile.$Platform"; BuildArgs = @{ SERVICE = "gateway" } })
[void]$services.Add(@{ Name = "recaptcha-service";  Context = "."; Dockerfile = "docker/backend/Dockerfile.$Platform"; BuildArgs = @{ SERVICE = "recaptcha-service" } })
[void]$services.Add(@{ Name = "smtp-service";       Context = "."; Dockerfile = "docker/backend/Dockerfile.$Platform"; BuildArgs = @{ SERVICE = "smtp-service" } })
[void]$services.Add(@{ Name = "frontend-web";       Context = "."; Dockerfile = "docker/frontend/Dockerfile.$Platform"; BuildArgs = @{} })

if ($IncludeNats -or ($Platform -eq "windows" -and $env:IMAGE_INCLUDE_NATS -eq "1")) {
  [void]$services.Add(@{ Name = "nats"; Context = "."; Dockerfile = "docker/nats/Dockerfile.windows"; BuildArgs = @{} })
}

function Invoke-DockerBuild {
  param($Svc)
  $imageTag = Get-ServiceImageName -ServiceName $Svc.Name
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
    $latestName = $imageTag -replace ":$Tag$", ":latest"
    $dockerArgs += @("-t", $latestName)
  }
  foreach ($k in $Svc.BuildArgs.Keys) {
    $dockerArgs += @("--build-arg", "$k=$($Svc.BuildArgs[$k])")
  }
  if ($Platform -eq "windows" -and $Svc.Name -ne "nats") {
    $dockerArgs += @("--build-arg", "WINDOWS_BASE=$WindowsBase")
  }
  if ($Platform -eq "windows" -and $Svc.Name -eq "nats") {
    $dockerArgs += @("--build-arg", "WINDOWS_BASE=$WindowsBase")
  }
  $dockerArgs += $Svc.Context

  Write-Host "`n=== BUILD $($Svc.Name) -> $imageTag ===" -ForegroundColor Cyan
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
  [void]$built.Add((Get-ServiceImageName -ServiceName $svc.Name))
  if ($AlsoLatest) {
    [void]$built.Add(((Get-ServiceImageName -ServiceName $svc.Name) -replace ":$Tag$", ":latest"))
  }
}

if ($Push) {
  $loginHost = if ($Registry -eq "docker.io") { "https://index.docker.io/v1/" } else { $Registry }
  if ($env:REGISTRY_USER -and $env:REGISTRY_PASSWORD) {
    Write-Host "`n=== docker login $Registry ===" -ForegroundColor Yellow
    $env:REGISTRY_PASSWORD | docker login $Registry -u $env:REGISTRY_USER --password-stdin
    if ($LASTEXITCODE -ne 0) { throw "docker login failed" }
  } else {
    Write-Host "REGISTRY_USER/PASSWORD not set - assume already docker login ($Registry)" -ForegroundColor Yellow
  }

  foreach ($img in ($built | Select-Object -Unique)) {
    Invoke-DockerPush -Image $img
  }
}

Write-Host "`nDone. Pull examples:" -ForegroundColor Cyan
foreach ($svc in $services) {
  Write-Host ("  docker pull " + (Get-ServiceImageName -ServiceName $svc.Name))
}
Write-Host "Server Windows: see docs/DOCKER-HUB-WINDOWS.md"
