# Retag local Windows images -> Docker Hub and push (no rebuild).
# Prerequisite: docker login ; existing local images
#
#   .\docker\scripts\Push-DockerHub-Windows.ps1
#   $env:DOCKERHUB_NAMESPACE="phuminh88"; .\docker\scripts\Push-DockerHub-Windows.ps1

[CmdletBinding()]
param(
  [string]$Namespace = $(if ($env:DOCKERHUB_NAMESPACE) { $env:DOCKERHUB_NAMESPACE } else { "phuminh88" }),
  [string]$Prefix = $(if ($env:IMAGE_BASE) { $env:IMAGE_BASE } else { "$Namespace/demo-smtp-win" }),
  [string]$Tag = $(if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { "demo" }),
  [switch]$AlsoLatest
)

$ErrorActionPreference = "Stop"

$map = @(
  @{ Local = @(
      "registry.portlogics.com.vn/demo-smtp/win/gateway:$Tag",
      "backend-gateway:latest",
      "gateway:latest"
    ); Hub = "$Prefix-gateway:$Tag" },
  @{ Local = @(
      "registry.portlogics.com.vn/demo-smtp/win/recaptcha-service:$Tag",
      "backend-recaptcha-service:latest"
    ); Hub = "$Prefix-recaptcha-service:$Tag" },
  @{ Local = @(
      "registry.portlogics.com.vn/demo-smtp/win/smtp-service:$Tag",
      "backend-smtp-service:latest"
    ); Hub = "$Prefix-smtp-service:$Tag" },
  @{ Local = @(
      "registry.portlogics.com.vn/demo-smtp/win/frontend-web:$Tag",
      "frontend-web:latest"
    ); Hub = "$Prefix-frontend-web:$Tag" },
  @{ Local = @(
      "demo-nats-windows:local",
      "demo-nats-windows:latest"
    ); Hub = "$Prefix-nats:$Tag" }
)

Write-Host "Docker Hub prefix: $Prefix  tag: $Tag" -ForegroundColor Cyan

if ($env:REGISTRY_USER -and $env:REGISTRY_PASSWORD) {
  $env:REGISTRY_PASSWORD | docker login -u $env:REGISTRY_USER --password-stdin
  if ($LASTEXITCODE -ne 0) { throw "docker login failed" }
} else {
  Write-Host "Assume already logged in to Docker Hub (docker login)" -ForegroundColor Yellow
}

foreach ($item in $map) {
  $src = $null
  foreach ($candidate in $item.Local) {
    docker image inspect $candidate 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $src = $candidate
      break
    }
  }
  if (-not $src) {
    Write-Host "SKIP missing local image for $($item.Hub) - build first" -ForegroundColor Yellow
    continue
  }

  Write-Host "TAG  $src  ->  $($item.Hub)" -ForegroundColor Cyan
  docker tag $src $item.Hub
  if ($LASTEXITCODE -ne 0) { throw "docker tag failed" }

  Write-Host "PUSH $($item.Hub)" -ForegroundColor Green
  docker push $item.Hub
  if ($LASTEXITCODE -ne 0) { throw "docker push failed: $($item.Hub)" }

  if ($AlsoLatest) {
    $latest = ($item.Hub -replace ":$Tag$", ":latest")
    docker tag $src $latest
    docker push $latest
    if ($LASTEXITCODE -ne 0) { throw "docker push failed: $latest" }
  }
}

Write-Host ""
Write-Host "Published. Server Windows:" -ForegroundColor Cyan
Write-Host "  see docs/DOCKER-HUB-WINDOWS.md"
Write-Host "  IMAGE_BASE=$Prefix IMAGE_TAG=$Tag npm run docker:pull:up:windows"
