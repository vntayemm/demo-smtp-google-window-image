# reCAPTCHA — CMIT Customer Portal

> Label Google: **CMIT - Customer Portal** · loại **v2 Checkbox**  
> Dùng **cùng một cặp khoá** cho Dev và Production (demo + CMIT-CP).

## Keys

| Role | Env | Giá trị |
| ---- | --- | ------- |
| Frontend (Site key) | `RECAPTCHA_SITE_KEY` | `6Le_34otAAAAAKt2gmK8RIR-amPBcRHgJxcDgw9F` |
| Backend (Secret key) | `RECAPTCHA_SECRET_KEY` | `6Le_34otAAAAANVEAaHJRmYDbE5-Oy32cS36Dou` |

- Site key: Vue / Blazor widget (`grecaptcha`).
- Secret key: chỉ `recaptcha-service` / ServiceAuth → `https://www.google.com/recaptcha/api/siteverify`.
- **Không** commit secret vào repo public; file `.env*` demo nội bộ — production CI nên masked.

## File đã gắn

| File | Môi trường |
| ---- | ---------- |
| `.env.example` | Dev (MailDev) |
| `.env.production.example` | Prod/UAT (CMIT SMTP relay) |

```bash
npm run env:dev          # MailDev + reCAPTCHA CMIT
npm run env:production   # CMIT SMTP + cùng reCAPTCHA
```

## Domain

Trên [Google reCAPTCHA Admin](https://www.google.com/recaptcha/admin) phải có host browser thực sự mở:

- Dev: `localhost`, `127.0.0.1`
- UAT/Prod: host NGINX/ARR của Portal / Internal / ApiCenterAdmin

Thiếu domain → widget báo `Invalid domain for site key`.
