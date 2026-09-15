# Demo — reCAPTCHA + SMTP microservices (TypeScript) + NATS 3-node

Repo chứng minh luồng:

```
Vue 2 (frontend/) 
  → HTTP gateway 
  → NATS request/reply → recaptcha-service (ReCaptchaService)
  → JetStream email.send 
  → smtp-service (SmtpService + SmtpEmailSender) 
  → MailDev / Gmail
```

## Cấu trúc

| Path | Vai trò |
| ---- | ------- |
| `frontend/index.html` | Vue **2** + Google reCAPTCHA v2 checkbox |
| `backend/gateway` | HTTP API → NATS |
| `backend/recaptcha-service` | Microservice `ReCaptchaService` |
| `backend/smtp-service` | Microservice `SmtpService` + `SmtpEmailSender` |
| `backend/shared` | Subjects, JetStream bootstrap, types |
| `docker/` | NATS cluster 3 node + MailDev |

## Chạy nhanh

```bash
# 1) Infra
cp .env.example .env
npm run docker:up
# chờ cluster: curl -s http://127.0.0.1:18222/jsz | findstr cluster_size

# 2) Deps
npm install

# 3) 3 terminal
npm run dev:recaptcha
npm run dev:smtp
npm run dev:gateway

# 4) Frontend
npm run dev:frontend
# mở http://127.0.0.1:5173
# mail: http://127.0.0.1:1080
```

`.env` / `.env.example` dùng cặp **reCAPTCHA v2 CMIT - Customer Portal** (Dev + Prod chung):

| | |
| --- | --- |
| Site key | `6Le_34otAAAAAKt2gmK8RIR-amPBcRHgJxcDgw9F` (frontend) |
| Secret key | `6Le_34otAAAAANVEAaHJRmYDbE5-Oy32cS36Dou` (recaptcha-service) |

Khai đủ domain trên Google Admin (`localhost`, host UAT/Prod). SMTP local vẫn là MailDev.

### Production email (CMIT SMTP relay)

```bash
cp .env.production.example .env
```

| Biến | Giá trị |
| ---- | ------- |
| `EMAIL_HOST` | `172.16.84.91` |
| `EMAIL_PORT` | `25` (xác nhận IT nếu khác) |
| `EMAIL_ENABLE_SSL` | `false` |
| `EMAIL_USERNAME` / `EMAIL_PASSWORD` | **để trống** (relay không AUTH) |
| `EMAIL_FROM_ADDRESS` | `eport@cmit.com.vn` |
| `EMAIL_ADMIN_NOTIFY` | `no-reply@cmit.com.vn` |

Chi tiết + whitelist IP: [`docs/SMTP-PRODUCTION-CMIT.md`](docs/SMTP-PRODUCTION-CMIT.md).

Gmail (tuỳ chọn, không phải prod CMIT): `smtp.gmail.com:587` + App Password.

## Subjects

| Subject | Kiểu |
| ------- | ---- |
| `demo.recaptcha.verify` | request/reply |
| `email.send` | JetStream stream `EMAIL` |
| `email.dlq` | JetStream stream `EMAIL_DLQ` |

## Docs

Xem `docs/RECAPTCHA-SMTP-NATS-POSTGRES-PLAN.md`.
