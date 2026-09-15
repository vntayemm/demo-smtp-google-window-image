# Network zones (DMZ) — Windows container target

Mô phỏng 4 lớp mạng gần giống server thật (DMZ / app / shared / data).

```
                    Internet / LAN user
                            │
                    ┌───────▼────────┐
                    │ zone-frontend  │  DMZ public
                    │  frontend-web  │
                    │  gateway(*)    │  (*) multi-homed edge
                    └───────┬────────┘
                            │
                    ┌───────▼────────┐
                    │ zone-backend   │  App tier
                    │  gateway       │
                    │  recaptcha     │
                    │  smtp-service  │
                    └───────┬────────┘
              ┌─────────────┼─────────────┐
              ▼                           ▼
     ┌────────────────┐          ┌────────────────┐
     │ zone-platform  │          │   zone-data    │
     │  jaeger        │          │  nats-1/2/3    │
     │  maildev       │          │  postgres ×2   │
     └────────────────┘          └────────────────┘
```

## Zone rules

| Zone | Ai được gắn | Không được |
| ---- | ----------- | ---------- |
| **zone-frontend** | `frontend-web`, `gateway` | NATS, Postgres, MailDev, workers thuần |
| **zone-backend** | `gateway`, `recaptcha`, `smtp` | frontend-web, postgres |
| **zone-platform** | `jaeger`, `maildev` + backend (OTLP/SMTP) | frontend-web |
| **zone-data** | `nats*`, `postgres*` + backend (NATS/DB) | frontend-web |

**Frontend không resolve được `nats-1` / `postgres-primary`** — đúng kiểu DMZ.

Browser → `frontend:5173` → `/api/*` proxy trên **zone-frontend** → `gateway:7080`.

## Windows containers

```powershell
# Docker Desktop / Server: Switch to Windows containers
$env:DOCKER_NETWORK_DRIVER = "nat"
$env:WINDOWS_BASE = "mcr.microsoft.com/windows/servercore:ltsc2019"  # Server 2022: ltsc2022
$env:WINDOWS_ISOLATION = "process"

npm run docker:zones:up
# data + platform: trên Windows-only host thường là native service / máy VLAN data
# Local dual-engine: chạy data/platform bằng Linux engine HOẶC IP thật
npm run docker:backend:up      # Dockerfile.windows
npm run docker:frontend:up
```

Build number host phải khớp base image (26100 ↔ ltsc2025) — giống CMIT-CP.

## Linux laptop fallback

```bash
export DOCKER_NETWORK_DRIVER=bridge
npm run docker:zones:up
npm run docker:data:up
npm run docker:platform:up
npm run docker:backend:linux:up
npm run docker:frontend:linux:up
```

## Map sang server thật (CMIT)

| Zone demo | VLAN / role thật |
| --------- | ---------------- |
| zone-frontend | DMZ / reverse-proxy / web publish |
| zone-backend | App nodes `.43` / `.44` |
| zone-platform | Mail relay / observability (hoặc shared) |
| zone-data | `.40` NATS + Postgres primary, `.45` standby |
