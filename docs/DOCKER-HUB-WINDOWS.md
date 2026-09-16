# Docker Hub — Windows containers (pull trên mọi Windows Server / Desktop)

Docker Hub **không** hỗ trợ path lồng (`user/demo/win/gateway`). Naming:

| Service | Image |
| ------- | ----- |
| gateway | `phuminh88/demo-smtp-win-gateway:demo` |
| recaptcha-service | `phuminh88/demo-smtp-win-recaptcha-service:demo` |
| smtp-service | `phuminh88/demo-smtp-win-smtp-service:demo` |
| frontend-web | `phuminh88/demo-smtp-win-frontend-web:demo` |
| nats | `phuminh88/demo-smtp-win-nats:demo` |

`IMAGE_BASE=phuminh88/demo-smtp-win` → compose nối `-gateway`, `-nats`, …

## 1) Desktop — publish

```powershell
# Switch to Windows containers
docker login
# hoặc: $env:REGISTRY_USER="phuminh88"; $env:REGISTRY_PASSWORD="***"

$env:IMAGE_REGISTRY = "docker.io"
$env:IMAGE_BASE     = "phuminh88/demo-smtp-win"
$env:IMAGE_TAG      = "demo"
$env:IMAGE_INCLUDE_NATS = "1"

# Nhanh: retag image local đã build rồi push
.\docker\scripts\Push-DockerHub-Windows.ps1

# Hoặc build lại + push
.\docker\scripts\Build-Push-Images.ps1 -Platform windows -Push -IncludeNats
```

## 2) Server Windows — pull & start

```powershell
# Switch to Windows containers
copy .env.dockerhub.example .env
# sửa EMAIL_* / RECAPTCHA_* nếu cần

docker login   # nếu repo private; public thì có thể bỏ

npm run docker:zones:up
npm run docker:data:windows:pull:up
# Platform Linux images (Jaeger/MailDev) → host:
#   .\docker\scripts\Start-Platform-Host.ps1
npm run docker:platform:windows:up
npm run docker:pull:up:windows
```

URLs:

- Frontend http://HOST:5173  
- Gateway  http://HOST:7080  
- Jaeger   http://HOST:16686 (host binary)  
- MailDev  http://HOST:1080 (host npm)

## Biến

| Biến | Ví dụ |
| ---- | ----- |
| `IMAGE_BASE` | `phuminh88/demo-smtp-win` |
| `IMAGE_TAG` | `demo` |
| `WINDOWS_ISOLATION` | `hyperv` (Win10/11) hoặc `process` (Server cùng build) |
| `WINDOWS_BASE` | `mcr.microsoft.com/windows/servercore:ltsc2019` (khớp image build) |

**Lưu ý:** Image build trên `servercore:ltsc2019` → server pull cần Hyper-V isolation nếu host build khác (Win10/Server 2022).
