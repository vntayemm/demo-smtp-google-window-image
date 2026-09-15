# Backend microservices (TypeScript)

| Package | Entry | NATS |
| ------- | ----- | ---- |
| `@demo/shared` | subjects + JetStream bootstrap | — |
| `@demo/recaptcha-service` | `ReCaptchaService` | subscribe `demo.recaptcha.verify` |
| `@demo/smtp-service` | `SmtpService` + `SmtpEmailSender` | consume JetStream `EMAIL` / `email-worker` |
| `@demo/gateway` | Express HTTP | request captcha + publish `email.send` |

```bash
# từ repo root (đã npm install + docker:up)
npm run dev:recaptcha
npm run dev:smtp
npm run dev:gateway
```
