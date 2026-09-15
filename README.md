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

`.env` mặc định dùng **Google reCAPTCHA test keys** (luôn pass) + MailDev `127.0.0.1:1025`.

Gmail thật: set `EMAIL_HOST=smtp.gmail.com`, `EMAIL_PORT=587`, `EMAIL_ENABLE_SSL=true`, App Password 16 ký tự.

## Subjects

| Subject | Kiểu |
| ------- | ---- |
| `demo.recaptcha.verify` | request/reply |
| `email.send` | JetStream stream `EMAIL` |
| `email.dlq` | JetStream stream `EMAIL_DLQ` |

## Docs

Xem `docs/RECAPTCHA-SMTP-NATS-POSTGRES-PLAN.md`.
