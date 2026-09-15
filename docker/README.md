# Docker stack — demo

| Service | Port (host) | URL / dùng để |
| ------- | ----------- | ------------- |
| nats-1/2/3 | 14222–14224 | NATS client |
| nats monitor | 18222–18224 | `/jsz` cluster |
| maildev UI | 1080 | xem mail SMTP |
| maildev SMTP | 1025 | `EMAIL_HOST` |
| **Jaeger UI** | **16686** | **xem message / request trace** |
| OTLP HTTP | 4318 | SDK export (`OTEL_EXPORTER_OTLP_ENDPOINT`) |
| OTLP gRPC | 4317 | tuỳ chọn |

```bash
docker compose -f docker/docker-compose.yml up -d
# Jaeger: http://127.0.0.1:16686
```

## Trace flow (OpenTelemetry → Jaeger)

```
HTTP POST /api/demo/send-email          (gateway)
  └─ nats.request demo.recaptcha.verify (gateway → recaptcha-service)
  └─ jetstream.publish email.send       (gateway)
       └─ jetstream.consume email-worker (smtp-service)
            └─ smtp.send
```

Context lan truyền qua NATS header `traceparent` (W3C).

Trong Jaeger UI: Search → Service `demo-gateway` → Find Traces → mở 1 trace xem full pipeline.
