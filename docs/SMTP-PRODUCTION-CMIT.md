# SMTP Production — CMIT Relay

> Nguồn cấu hình: trao đổi CMIT IT (Toan Nguyen, 2026-09-08) — SMTP relay nội bộ.

## Thông số

| Mục | Giá trị | Ghi chú |
| --- | ------- | ------- |
| Host | `172.16.84.91` | SMTP server CMIT |
| Auth | **Không** user/pass | Relay đã set; app **không** gửi AUTH |
| From (chính) | `eport@cmit.com.vn` | Gửi OTP / mail nghiệp vụ |
| From / notify | `no-reply@cmit.com.vn` | Chỉ thông tin, không dùng mailbox tương tác |
| Port | `25` (mặc định file env) | Chưa chốt trong chat — xác nhận IT nếu fail |
| TLS | `EMAIL_ENABLE_SSL=false` | Relay nội bộ LAN |

## File env

```bash
cp .env.production.example .env
npm run dev:smtp
```

Biến quan trọng:

```env
EMAIL_HOST=172.16.84.91
EMAIL_PORT=25
EMAIL_ENABLE_SSL=false
EMAIL_USERNAME=
EMAIL_PASSWORD=
EMAIL_FROM_ADDRESS=eport@cmit.com.vn
EMAIL_FROM_NAME=CMIT Portal
EMAIL_ADMIN_NOTIFY=no-reply@cmit.com.vn
```

## Whitelist IP

Mạng ngoài / firewall có thể chặn → **IP máy chạy smtp-service (hoặc ServiceEmail CMIT-CP) phải whitelist** tới `172.16.84.91`.

DevOps lấy IP node app → gửi CMIT (Hiển / Minh).

## Rủi ro đã biết (CMIT-CP Windows container)

- Env rỗng (`EMAIL_USERNAME=`) trên Windows container **bị nuốt** → .NET/Node rơi về giá trị mặc định trong file config.
- ⇒ Giữ username/password **rỗng trong code/config**; không điền dummy auth.
- Set username vào relay không AUTH → lỗi kiểu `SMTP server does not support authentication`.

## Checklist trước khi gửi thật

- [ ] IP app đã whitelist
- [ ] `EMAIL_USERNAME` / `EMAIL_PASSWORD` trống
- [ ] `EMAIL_FROM_ADDRESS` = `eport@cmit.com.vn` (hoặc địa chỉ CMIT approve)
- [ ] Port đúng (25 hoặc giá trị IT chốt)
- [ ] Test 1 mail tới inbox nội bộ; kiểm tra log `[smtp] SENT`
