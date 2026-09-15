# Build (Desktop) → Push registry → Pull (Server)

Tag mặc định luôn là **`demo`** (override bằng `IMAGE_TAG` / `--tag` / `-Tag` nếu cần).

## Images

| Image | Dockerfile |
| ----- | ---------- |
| `{IMAGE_BASE}/gateway:demo` | `docker/backend/Dockerfile.{windows\|linux}` |
| `{IMAGE_BASE}/recaptcha-service:demo` | same |
| `{IMAGE_BASE}/smtp-service:demo` | same |
| `{IMAGE_BASE}/frontend-web:demo` | `docker/frontend/Dockerfile.{windows\|linux}` |

| Platform | IMAGE_BASE |
| -------- | ---------- |
| Windows | `registry.portlogics.com.vn/demo-smtp/win` |
| Linux | `registry.portlogics.com.vn/demo-smtp/linux` |

## 1) Desktop — build + push (`:demo`)

```powershell
$env:REGISTRY_USER = "<user>"
$env:REGISTRY_PASSWORD = "<pass>"
docker login registry.portlogics.com.vn -u $env:REGISTRY_USER -p $env:REGISTRY_PASSWORD

.\docker\scripts\Build-Push-Images.ps1 -Platform windows -Push
# → .../demo-smtp/win/*:demo

# Linux engine
npm run image:build-push:linux
# → .../demo-smtp/linux/*:demo
```

## 2) Server — pull `:demo`

```powershell
# .env
# IMAGE_BASE=registry.portlogics.com.vn/demo-smtp/win
# IMAGE_TAG=demo

npm run docker:zones:up
npm run docker:data:up
npm run docker:platform:up
npm run docker:pull:up
```

## Biến

| Biến | Default |
| ---- | ------- |
| `IMAGE_TAG` | **`demo`** |
| `IMAGE_BASE` | `.../demo-smtp/win` hoặc `.../linux` |
| `REGISTRY_USER` / `REGISTRY_PASSWORD` | login |
