# Plan — reCAPTCHA · SMTP · NATS 3-node · PostgreSQL 2-node

> **Repo:** `demo-smtp-google-window-image/docs` — plan demo/chứng minh + checklist gắn stack CMIT-CP.
> **Phạm vi:** reCAPTCHA FE/BE · SMTP · NATS 3-node · PostgreSQL 2-node.
> Chi tiết deploy/DB CMIT-CP vẫn nằm ở `../cmit-cp/Documents/` (`DEPLOYMENT.md`, `DATABASE_SETUP.md`).

| Ngày       | Trạng thái tổng |
| ---------- | --------------- |
| 2026-09-16 | Draft plan      |

---

## 0. Mục tiêu

| # | Thành phần | Mục tiêu | Trạng thái code / hạ tầng |
| - | ---------- | -------- | ------------------------- |
| 1 | **reCAPTCHA v2** | Chặn bot trên Login / Register / ForgotPassword / SendOtp | ✅ Code FE+BE đã có; bật bằng CI env |
| 2 | **SMTP + ServiceEmail** | OTP / mail quên MK / notify admin qua JetStream → SMTP | ✅ Code; DEV = MailDev; UAT/Prod = SMTP thật |
| 3 | **NATS 3 node** | HA JetStream (email + Wolverine) | ✅ Compose local (`docker-compose.nats-cluster.yml`); ❌ Prod cluster chưa dựng |
| 4 | **PostgreSQL 2 node** | Primary `.40` + streaming replica `.45` | ✅ Primary; ❌ Standby `.45` chưa dựng |

---

## 1. Sơ đồ luồng (tóm tắt)

```
Browser (3 web)
  │  SiteKey → widget grecaptcha → RecaptchaToken
  ▼
Web.Portal / Internal / ApiCenterAdmin
  │  HTTP /api/...
  ▼
WebApi  ──NATS request/reply──►  ServiceAuth
                                    │ verify SecretKey → Google siteverify
                                    │ publish email.send (JetStream MsgId)
                                    ▼
                              NATS cluster (3)  stream EMAIL (replicas=3)
                                    ▼
                              ServiceEmail  →  SMTP (Gmail / relay)
                                    │
                                    ▼
                              PostgreSQL primary (.40)
                                    │ WAL streaming
                                    ▼
                              PostgreSQL standby (.45)  [read-only]
```

**Quy tắc:** UI không verify captcha; UI không gửi SMTP trực tiếp; OTP/mail luôn qua JetStream.

---

## 2. reCAPTCHA — Frontend / Backend

### 2.1 Quyết định kỹ thuật (đã chốt trong code)

| Mục | Giá trị |
| --- | ------- |
| Loại | **reCAPTCHA v2 Checkbox** (không dùng v3 score) |
| Config | `ReCaptcha:Enabled`, `SiteKey`, `SecretKey` |
| FE | SiteKey trên 3 web (Portal, Internal, ApiCenterAdmin) — **cùng một cặp khoá** |
| BE | SecretKey **chỉ** `ServiceAuth` (`GoogleRecaptchaVerifier` → `siteverify`) |
| UC enforce | `UC_Login` (khi `RequireCaptcha`), `UC_Register`, `UC_SendUserOtp` (lần đầu), ForgotPassword (token từ FE) |

### 2.2 Frontend plan

| Bước | Việc | Owner | Done? |
| ---- | ---- | ----- | ----- |
| F1 | Widget shared: `RecaptchaWidget.razor` + `wwwroot/js/recaptcha.js` | Dev | ✅ |
| F2 | Portal Login / Register / ForgotPassword gắn token vào REQ | Dev | ✅ |
| F3 | Internal + ApiCenterAdmin Login / ForgotPassword dùng widget shared | Dev | ✅ |
| F4 | Domain whitelist trên [Google Admin](https://www.google.com/recaptcha/admin): đủ host NGINX/ARR của **cả 3 web** | Ops | ⬜ theo env |
| F5 | `RECAPTCHA_ENABLED=true` + `RECAPTCHA_SITE_KEY` trên 3 web container | CI | ⬜ UAT/Prod |

**Hành vi FE:**

- `Enabled=false` hoặc thiếu SiteKey → **không** render widget (dev skip).
- Login: chỉ hiện khi backend trả `RequireCaptcha` (sau N lần sai MK — `SecuritySetting`).
- Register / ForgotPassword / SendOtp lần đầu: hiện khi đã cấu hình SiteKey.
- Sau submit fail / Blazor replay: `grecaptcha.reset()`; token one-shot.

### 2.3 Backend plan

| Bước | Việc | Owner | Done? |
| ---- | ---- | ----- | ----- |
| B1 | `IRecaptchaVerifier` + `GoogleRecaptchaVerifier` HttpClient | Dev | ✅ |
| B2 | `IsRecaptchaEnabled()` = `Enabled && SecretKey` không rỗng | Dev | ✅ |
| B3 | Idempotency store tránh double-side-effect khi token đã consume (Register/OTP) | Dev | ✅ |
| B4 | Deploy guard: `RECAPTCHA_ENABLED=true` mà thiếu Site/Secret → **throw** (không deploy nửa vời) | Ops/CI | ✅ script |
| B5 | UAT/Prod: Secret **masked** CI; không commit vào repo | Ops | ⬜ |

**Cảnh báo vận hành (đã ghi trong DEPLOYMENT):**

- Bật `Enabled` mà **thiếu Secret** → verifier **pass im lặng** trong khi web vẫn hiện widget → captcha vô tác dụng.
- Thiếu SiteKey → widget không render → token rỗng → Register/Login bị từ chối.
- ⇒ Luôn set **cặp khoá đủ** hoặc tắt hẳn (`Enabled=false`).

### 2.4 Biến môi trường

| Biến | Service | Ghi chú |
| ---- | ------- | ------- |
| `RECAPTCHA_ENABLED` | 3 web + ServiceAuth | Default `false` |
| `RECAPTCHA_SITE_KEY` | 3 web | Public |
| `RECAPTCHA_SECRET_KEY` | ServiceAuth | Masked |

### 2.5 Test plan reCAPTCHA

1. Dev: `Enabled=false` → Login/Register không đòi token.
2. Dev/UAT: `Enabled=true` + keys → widget hiện; submit không tick → `AUTH_RECAPTCHA_REQUIRED`.
3. Token giả / hết hạn → `AUTH_RECAPTCHA_FAILED`.
4. Domain sai trên Google Admin → widget báo `Invalid domain for site key`.
5. Login sai MK đủ lần → `RequireCaptcha=true` → lần sau bắt buộc token.

---

## 3. SMTP & ServiceEmail

### 3.1 Kiến trúc đã chọn

| Layer | Vai trò |
| ----- | ------- |
| ServiceAuth | Nghiệp vụ OTP/Forgot/Notify; publish `email.send` qua `NatsEmailJetStreamClient` (`MsgId` = MessageId) |
| NATS JetStream | Stream `EMAIL` + DLQ `EMAIL_DLQ`; consumer durable `email-worker` |
| ServiceEmail | Consume → ghi/đọc `cp_email_deliveries` → `SmtpEmailSender` |
| SMTP | Gmail App Password / relay nội bộ / MailDev (local) |

**Idempotency:** message đã `SENT` trong DB → ACK, không gửi SMTP lại.

### 3.2 Cấu hình Email

| Biến | Bắt buộc? | Ghi chú |
| ---- | --------- | ------- |
| `EMAIL_HOST` | ✅ | Hostname/IP thuần (`smtp.gmail.com` hoặc relay) |
| `EMAIL_PORT` | optional | Default `587` |
| `EMAIL_ENABLE_SSL` | optional | Default `true` |
| `EMAIL_USERNAME` / `EMAIL_PASSWORD` | theo SMTP | Relay nội bộ **không AUTH** → để **rỗng cả hai** + `appsettings` rỗng (Windows nuốt env rỗng) |
| `EMAIL_FROM_ADDRESS` | ✅ | |
| `EMAIL_FROM_NAME` | optional | Default `CMIT Portal` |
| `EMAIL_ADMIN_NOTIFY` | optional | Mail “có hồ sơ đăng ký mới” |
| `OTP_SMTP_ATTEMPT_TIMEOUT_SECONDS` | optional | Default `8` (ServiceAuth) |

Local Aspire/AppHost: MailDev `127.0.0.1:1025`, `EnableSsl=false`.

### 3.3 Plan triển khai SMTP

| Phase | Việc | Môi trường | Done? |
| ----- | ---- | ---------- | ----- |
| S1 | MailDev / null-safe local | Dev máy | ✅ |
| S2 | Gmail App Password (16 ký tự) trên Windows container — chứng minh gửi thật | Demo / UAT | ⬜ / demo repo |
| S3 | CI: `EMAIL_*` masked; `Deploy-CmitStack.ps1` throw nếu thiếu Host/From | UAT | ⬜ verify |
| S4 | Prod: relay nội bộ khách **hoặc** SMTP được approve; DNS SPF/DKIM | Prod | ⬜ |
| S5 | Monitor: metric `EmailTelemetry` (Sent/Failed/Dlq) + bảng `EmailDeliveries` | Ops | ⬜ dashboard |

### 3.4 Luồng nghiệp vụ dùng SMTP

1. Đăng ký → OTP email.
2. Quên mật khẩu → OTP / link reset.
3. Admin notify sau OTP đăng ký (nếu `EMAIL_ADMIN_NOTIFY`).
4. Retry JetStream theo `EmailRetryPolicy`; hết deliver → DLQ subject `email.dlq`.

### 3.5 Rủi ro SMTP

| Rủi ro | Mitigation |
| ------ | ---------- |
| Host trống → `NullEmailSender`, container vẫn healthy | Deploy script **throw** nếu thiếu `EMAIL_*` |
| Windows nuốt env rỗng → rơi về `appsettings` | Giữ section Email trong appsettings **rỗng** username/password |
| Gmail block / rate limit | App Password; timeout OTP; DLQ + alert |
| Gửi trùng | JetStream `MsgId` + status `SENT` trong DB |

---

## 4. NATS — cluster 3 node

### 4.1 Mục tiêu HA

- Raft cần **số lẻ** → **3 node** (không thêm node thứ 4).
- JetStream stream email: `Nats__JetStreamReplicas=3` khi cluster đủ peer.
- Client URL dạng list: `nats://a:4222,nats://b:4222,nats://c:4222` (credential percent-encode trong URL).

### 4.2 Local (đã có)

File: `docker-compose.nats-cluster.yml` + `infra/nats/cluster/nats-{1,2,3}.conf`

| Node | Client port (host) | Monitor |
| ---- | ------------------ | ------- |
| nats-1 | `14222` | `18222` |
| nats-2 | `14223` | `18223` |
| nats-3 | `14224` | `18224` |

```bash
docker compose -f docker-compose.nats-cluster.yml up -d
# Kiểm tra: curl -s http://127.0.0.1:18222/jsz → meta_cluster.cluster_size == 3
```

App:

```
Nats__Url=nats://127.0.0.1:14222,nats://127.0.0.1:14223,nats://127.0.0.1:14224
Nats__JetStreamReplicas=3
```

**Fallback code:** nếu `NumReplicas=3` mà không đủ peer → bootstrap tạo stream **1 replica** (tránh worker chết / MailDev trống trên cluster local lỗi).

### 4.3 Production plan (chưa làm)

Theo `DEPLOYMENT.md`: hiện **single-node** trên `.40:4222`.

| Bước | Việc | Host gợi ý | Done? |
| ---- | ---- | ---------- | ----- |
| N1 | Chốt topology: `.40` + `.45` + node DR thứ 3 | Ops + TL | ⬜ |
| N2 | Cài NATS Windows service (NSSM) × 3; `cluster` routes + `advertise` hostname/IP thật | Ops | ⬜ |
| N3 | JetStream `store_dir` trên disk riêng; backup policy | Ops | ⬜ |
| N4 | Firewall TCP **4222** (client) + **6222** (cluster) chỉ giữa peer + app nodes | Ops | ⬜ |
| N5 | Account tách **DEV / UAT** (subject trùng tên method — tránh message “ăn chéo”) | Ops | ⬜ một phần DEV |
| N6 | Password prod hash bcrypt (`nats server passwd`) | Ops | ⬜ |
| N7 | CI `NATS_URL` = multi-host; `NATS_JETSTREAM_REPLICAS=3` | CI | ⬜ |
| N8 | Chaos test: tắt 1 node → publish/consume email vẫn OK; tắt 2 → mất quorum (document) | QA | ⬜ |

### 4.4 Healthcheck lưu ý

- Không dùng `/healthz` đòi JS meta leader cho compose `depends_on` (deadlock khi 2/3 chờ nhau).
- Local compose dùng `/varz`. Prod: monitor `/jsz` + alert `cluster_size != 3`.

---

## 5. PostgreSQL — 2 node (Primary + Standby)

Chi tiết thao tác: **`DATABASE_SETUP.md`**. Plan dưới đây chỉ checklist.

### 5.1 Topology

| Vai trò | Host | Port | Quyền app |
| ------- | ---- | ---- | --------- |
| **Primary** R/W | `10.8.31.40` | `5432` | `DB_CONNECTION` → DB `cmit_cp` |
| **Standby** R/O | `10.8.31.45` | `5432` | Chưa trỏ app (giai đoạn sau: read replica) |

**Roles:** `superdev` (DDL/migrate), `dev` (CRUD runtime — sau khi tách migrate job), `replicator` (WAL only).

### 5.2 Plan

| Phase | Việc | Done? |
| ----- | ---- | ----- |
| P-A | Tạo DB + role trên `.40` | ✅ |
| P-B | `postgresql.conf` / `pg_hba` replication trên primary | ✅ (cần xác nhận slot) |
| P-C | Role `replicator` + slot `standby_45` | ⬜ |
| P-D | `pg_basebackup` / standby trên `.45` | ❌ |
| P-E | Verify `pg_is_in_recovery()=t` + lag | ❌ |
| P-F | Backup định kỳ (`pg_dump` / PITR) — **không** thay bằng replica | ❌ |
| P-G | (Sau) App read-only connection string → `.45` cho báo cáo (optional) | ⬜ không bắt buộc cutover |

### 5.3 Ràng buộc vận hành

- **Không** bật `synchronous_standby_names` với 1 replica (`.45` chết → primary treo commit).
- Async replication: `.45` chết lâu → cân nhắc `pg_drop_replication_slot` để primary không đầy disk WAL.
- Failover: promote thủ công trên `.45` + đổi `DB_CONNECTION` app — chưa có Patroni.
- Secret: password không commit; CI masked.

### 5.4 Liên hệ với email / auth

- `EmailDeliveries`, OTP, user, audit → ghi **primary**.
- ServiceAuth + ServiceEmail cùng connection primary hiện tại.
- Replica chỉ phục vụ HA đọc / DR; mất primary vẫn cần runbook promote (xem `CMIT_Cutover_Runbook.md` khi có).

---

## 6. Ma trận môi trường (target)

| Thành phần | Local Dev | UAT (`.43`/`.44`) | Prod |
| ---------- | --------- | ----------------- | ---- |
| reCAPTCHA | tắt hoặc keys test | bật + domain UAT | bật + domain prod |
| SMTP | MailDev `:1025` | Gmail / relay test | Relay khách hoặc SMTP approved |
| NATS | single `:4223` **hoặc** cluster compose 3 | single `.40` → **upgrade 3** | **3 node** + replicas=3 |
| PostgreSQL | Docker `:5433` | Primary `.40` | Primary `.40` + Standby `.45` |

---

## 7. Thứ tự triển khai đề xuất

```
1) PostgreSQL standby .45 ổn định (P-C → P-E)
2) SMTP UAT gửi thật + monitor EmailDeliveries (S2–S3)
3) reCAPTCHA bật UAT đủ domain 3 web (F4–F5 + B5)
4) NATS cluster 3 node song song single → cắt traffic (N1–N8)
5) Prod: SMTP + captcha + NATS HA + Postgres replica + backup
```

Lý do thứ tự: DB/DR trước; mail chứng minh độc lập NATS HA; captcha phụ thuộc domain public; NATS cluster đổi URL app → làm sau khi UAT xanh.

---

## 8. Definition of Done (DoD)

- [ ] reCAPTCHA: Register + Login (RequireCaptcha) + ForgotPassword verify được trên UAT qua NGINX host thật.
- [ ] SMTP: OTP tới inbox trong ≤ timeout cấu hình; DLQ có alert khi fail hết retry.
- [ ] NATS: `cluster_size=3`; tắt 1 node vẫn gửi/nhận email; `JetStreamReplicas=3` không fallback 1.
- [ ] Postgres: `.45` in recovery; lag đo được; slot không phình WAL ngoài ngưỡng; backup job có lịch.

---

## 9. Tài liệu / code liên quan

| Đường dẫn | Nội dung |
| --------- | -------- |
| `docs/` (repo này) | Plan demo SMTP / captcha / HA |
| `frontend/`, `backend/`, `docker/` (repo này) | Skeleton demo Windows image |
| `../cmit-cp/Documents/DEPLOYMENT.md` | Deploy Windows image, env `EMAIL_*` / `RECAPTCHA_*` / `NATS_URL` |
| `../cmit-cp/Documents/DATABASE_SETUP.md` | Primary/replica Postgres chi tiết |
| `../cmit-cp/docker-compose.nats-cluster.yml` | NATS 3 node local |
| `../cmit-cp/docker-compose.windows.yml` | Env mapping production-like |
| `../cmit-cp/src/CMIT.CP.Abstract/Classes/ReCaptchaSettings.cs` | Contract config captcha |
| `../cmit-cp/src/CMIT.CP.ServiceEmail/` | Worker SMTP consumer |
| `../cmit-cp/src/CMIT.CP.Defaults/Email/` | JetStream bootstrap + SMTP sender |

---

## 10. Session log

| Date       | Lines | Brief |
| ---------- | ----- | ----- |
| 2026-09-16 | (new) | Draft plan: reCAPTCHA FE/BE, SMTP/JetStream, NATS 3, Postgres 2 |
| 2026-09-16 | move | Chuyển từ `cmit-cp/Documents` → `demo-smtp-google-window-image/docs` |
| 2026-09-16 | impl | Vue2 FE + TS microservices (gateway/recaptcha/smtp) + docker NATS-3 |
| 2026-09-16 | smtp | Thêm `.env.production.example` + docs CMIT relay 172.16.84.91 |
| 2026-09-16 | otel | Docker Jaeger UI + OTEL NATS message trace (gateway/recaptcha/smtp) |
