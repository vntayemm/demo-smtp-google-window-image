# Demo — Windows containers + 4 DMZ network zones

```
Browser → zone-frontend (web) → gateway (edge)
        → zone-backend (recaptcha / smtp)
        → zone-platform (Jaeger / MailDev) + zone-data (NATS / Postgres)
```

## Groups & zones

| Group | Zone network | Chứa |
| ----- | ------------ | ---- |
| **zones** | tạo 4 net | `zone-frontend`, `zone-backend`, `zone-platform`, `zone-data` |
| **data** | `zone-data` | NATS×3, PostgreSQL×2 |
| **platform** | `zone-platform` | Jaeger, MailDev |
| **backend** | multi-homed | Windows: gateway, recaptcha, smtp |
| **frontend** | `zone-frontend` | Windows: Vue static + `/api` proxy |

Xem [`docs/NETWORK-ZONES-DMZ.md`](docs/NETWORK-ZONES-DMZ.md).

## Chạy (Windows containers — target)

```powershell
# Docker: Switch to Windows containers
$env:DOCKER_NETWORK_DRIVER = "nat"
cp .env.example .env
npm run docker:up
```

Base image mặc định: `mcr.microsoft.com/windows/servercore:ltsc2019` (+ Node cài trong Dockerfile)  
Server 2022: `$env:WINDOWS_BASE="mcr.microsoft.com/windows/servercore:ltsc2022"`

## Laptop Linux engine (fallback)

```bash
export DOCKER_NETWORK_DRIVER=bridge
npm run docker:up:linux
```

## URLs

| | |
| --- | --- |
| Frontend | http://127.0.0.1:5173 |
| Gateway | http://127.0.0.1:7080 |
| Jaeger | http://127.0.0.1:16686 |
| MailDev | http://127.0.0.1:1080 |

## reCAPTCHA / SMTP prod

`.env.production.example`, `docs/RECAPTCHA-CMIT-KEYS.md`, `docs/SMTP-PRODUCTION-CMIT.md`.

## Build & push images (Desktop → registry → Server pull)

Xem [`docs/IMAGE-REGISTRY.md`](docs/IMAGE-REGISTRY.md).

```powershell
# Desktop (Windows containers) → push :demo
$env:REGISTRY_USER="..."
$env:REGISTRY_PASSWORD="..."
.\docker\scripts\Build-Push-Images.ps1 -Platform windows -Push

# Desktop (Linux engine) → push :demo
npm run image:build-push:linux

# Server pull :demo
$env:IMAGE_BASE="registry.portlogics.com.vn/demo-smtp/win"
$env:IMAGE_TAG="demo"
npm run docker:pull:up
```
