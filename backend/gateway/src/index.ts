import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import {
  Subjects,
  SpanKind,
  bootstrapEmailJetStream,
  connectNats,
  decodeJson,
  encodeJson,
  initTracing,
  injectTraceHeaders,
  loadNatsEnv,
  runWithSpan,
  type EmailSendPayload,
  type GatewaySendEmailRequest,
  type GatewaySendEmailResponse,
  type RecaptchaVerifyRequest,
  type RecaptchaVerifyResponse,
} from "@demo/shared";
import { headers as natsHeaders } from "nats";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

const MAX_SEND_COUNT = Number(process.env.GATEWAY_MAX_SEND_COUNT || "5000");
const PUBLISH_CONCURRENCY = Number(process.env.GATEWAY_PUBLISH_CONCURRENCY || "50");

function clampCount(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    return 1;
  }
  return Math.min(Math.floor(n), MAX_SEND_COUNT);
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

async function main(): Promise<void> {
  await initTracing(process.env.OTEL_SERVICE_NAME || "demo-gateway");

  const natsEnv = loadNatsEnv();
  const nc = await connectNats(natsEnv.url);
  const { js } = await bootstrapEmailJetStream(nc, natsEnv.jetStreamReplicas);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      nats: nc.getServer(),
      siteKeyConfigured: Boolean(process.env.RECAPTCHA_SITE_KEY),
      jaegerUi: "http://127.0.0.1:16686",
      maxSendCount: MAX_SEND_COUNT,
    });
  });

  app.get("/api/config", (_req, res) => {
    res.json({
      recaptchaEnabled: (process.env.RECAPTCHA_ENABLED || "true").toLowerCase() === "true",
      siteKey: process.env.RECAPTCHA_SITE_KEY || "",
      jaegerUi: "http://127.0.0.1:16686",
      maxSendCount: MAX_SEND_COUNT,
    });
  });

  app.post("/api/demo/send-email", async (req, res) => {
    const body = req.body as GatewaySendEmailRequest;
    const remoteIp =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      undefined;
    const count = clampCount(body.count);

    if (!body?.to?.trim() || !body?.subject?.trim() || !body?.body?.trim()) {
      const fail: GatewaySendEmailResponse = {
        ok: false,
        error: "to, subject, body are required",
      };
      res.status(400).json(fail);
      return;
    }

    try {
      const result = await runWithSpan(
        "demo-gateway",
        "HTTP POST /api/demo/send-email",
        SpanKind.SERVER,
        {
          "http.method": "POST",
          "http.route": "/api/demo/send-email",
          "messaging.system": "nats",
          "enduser.ip": remoteIp || "",
          "demo.send.count": count,
        },
        async (rootSpan) => {
          const verifyReq: RecaptchaVerifyRequest = {
            token: body.recaptchaToken || "",
            remoteIp,
          };

          const verify = await runWithSpan(
            "demo-gateway",
            "nats.request demo.recaptcha.verify",
            SpanKind.CLIENT,
            {
              "messaging.system": "nats",
              "messaging.destination": Subjects.RecaptchaVerify,
              "messaging.operation": "request",
            },
            async () => {
              const hdr = injectTraceHeaders(natsHeaders());
              const verifyMsg = await nc.request(
                Subjects.RecaptchaVerify,
                encodeJson(verifyReq),
                { timeout: 8_000, headers: hdr }
              );
              return decodeJson<RecaptchaVerifyResponse>(verifyMsg.data);
            }
          );

          if (!verify.success) {
            rootSpan.setAttribute("recaptcha.success", false);
            const detail = verify.errorCodes?.length
              ? `reCAPTCHA rejected (${verify.errorCodes.join(",")})`
              : verify.message || "reCAPTCHA failed";
            return {
              status: 400,
              body: {
                ok: false,
                error: detail,
              } satisfies GatewaySendEmailResponse,
            };
          }

          rootSpan.setAttribute("recaptcha.success", true);
          const batchId = crypto.randomUUID();
          const started = Date.now();
          const indexes = Array.from({ length: count }, (_, i) => i);

          await runWithSpan(
            "demo-gateway",
            `jetstream.publish email.send x${count}`,
            SpanKind.PRODUCER,
            {
              "messaging.system": "nats",
              "messaging.destination": Subjects.EmailSend,
              "messaging.operation": "publish",
              "demo.batch_id": batchId,
              "demo.send.count": count,
            },
            async () => {
              await mapPool(indexes, PUBLISH_CONCURRENCY, async (i) => {
                const messageId = `${batchId}-${i + 1}`;
                const payload: EmailSendPayload = {
                  messageId,
                  to: body.to.trim(),
                  subject:
                    count === 1
                      ? body.subject.trim()
                      : `${body.subject.trim()} [${i + 1}/${count}]`,
                  html:
                    count === 1
                      ? body.body
                      : `${body.body}<p data-demo-seq="${i + 1}">#${i + 1} / batch ${batchId}</p>`,
                  type: "demo.send",
                  source: "gateway",
                };
                const hdr = injectTraceHeaders(natsHeaders());
                hdr.set("Nats-Msg-Id", messageId);
                hdr.set("X-Batch-Id", batchId);
                await js.publish(Subjects.EmailSend, encodeJson(payload), {
                  headers: hdr,
                });
              });
            }
          );

          const elapsedMs = Date.now() - started;
          rootSpan.setAttribute("email.batch_id", batchId);
          rootSpan.setAttribute("email.published", count);
          rootSpan.setAttribute("email.elapsed_ms", elapsedMs);

          return {
            status: 200,
            body: {
              ok: true,
              messageId: `${batchId}-1`,
              batchId,
              count,
              published: count,
              elapsedMs,
            } satisfies GatewaySendEmailResponse,
          };
        }
      );

      res.status(result.status).json(result.body);
      if (result.body.ok) {
        console.log(
          `[gateway] published ${result.body.published}/${result.body.count} ` +
            `batch=${result.body.batchId} elapsedMs=${result.body.elapsedMs} To=${body.to}`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[gateway] send-email error", err);
      const fail: GatewaySendEmailResponse = { ok: false, error: message };
      res.status(502).json(fail);
    }
  });

  const port = Number(process.env.GATEWAY_PORT || "7080");
  app.listen(port, () => {
    console.log(`[gateway] http://127.0.0.1:${port}`);
    console.log(
      `[gateway] maxSendCount=${MAX_SEND_COUNT} publishConcurrency=${PUBLISH_CONCURRENCY}`
    );
    console.log(`[gateway] Jaeger UI http://127.0.0.1:16686`);
  });
}

main().catch((err) => {
  console.error("[gateway] fatal", err);
  process.exit(1);
});
