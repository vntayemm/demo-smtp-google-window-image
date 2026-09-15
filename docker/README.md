# Docker — 4 groups × 4 network zones (DMZ)

Chi tiết zone: [`docs/NETWORK-ZONES-DMZ.md`](../docs/NETWORK-ZONES-DMZ.md).

| Group | Compose | Network zone(s) | Runtime |
| ----- | ------- | --------------- | ------- |
| **zones** | `compose.zones.yml` | tạo 4 zone | — |
| **data** | `compose.data.yml` | `zone-data` only | NATS, Postgres (Linux image / native prod) |
| **platform** | `compose.platform.yml` | `zone-platform` only | Jaeger, MailDev |
| **backend** | `compose.backend.yml` | multi-homed | **Windows** Node containers |
| **frontend** | `compose.frontend.yml` | `zone-frontend` only | **Windows** Node static |

## Attach matrix

| Service | frontend | backend | platform | data |
| ------- | :------: | :-----: | :------: | :--: |
| frontend-web | ✓ | | | |
| gateway | ✓ | ✓ | ✓ | ✓ |
| recaptcha-service | | ✓ | ✓ | ✓ |
| smtp-service | | ✓ | ✓ | ✓ |
| maildev / jaeger | | | ✓ | |
| nats / postgres | | | | ✓ |

## Commands (Windows containers — target)

```powershell
# Switch to Windows containers trước
$env:DOCKER_NETWORK_DRIVER = "nat"
npm run docker:zones:up
npm run docker:data:up          # cần Linux images hoặc external IP data VLAN
npm run docker:platform:up
npm run docker:backend:up       # Dockerfile.windows
npm run docker:frontend:up
```

## Commands (Linux engine laptop)

```bash
export DOCKER_NETWORK_DRIVER=bridge
npm run docker:zones:up
npm run docker:data:up
npm run docker:platform:up
npm run docker:backend:linux:up
npm run docker:frontend:linux:up
```

## URLs

- Frontend DMZ: http://127.0.0.1:5173 (`/api` → gateway cùng zone-frontend)
- Gateway publish: http://127.0.0.1:7080
- Jaeger: http://127.0.0.1:16686
- MailDev: http://127.0.0.1:1080
