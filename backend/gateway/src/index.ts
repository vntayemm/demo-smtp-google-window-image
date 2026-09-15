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

async function main(): Promise<void> {
  await initTracing(process.env.OTEL_SERVICE_NAME || "demo-gateway");

  const natsEnv = loadNatsEnv();
  const nc = await connectNats(natsEnv.url);
  const { js } = await bootstrapEmailJetStream(nc, natsEnv.jetStreamReplicas);

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      nats: nc.getServer(),
      siteKeyConfigured: Boolean(process.env.RECAPTCHA_SITE_KEY),
      jaegerUi: "http://127.0.0.1:16686",
    });
  });

  app.get("/api/config", (_req, res) => {
    res.json({
      recaptchaEnabled: (process.env.RECAPTCHA_ENABLED || "true").toLowerCase() === "true",
      siteKey: process.env.RECAPTCHA_SITE_KEY || "",
      jaegerUi: "http://127.0.0.1:16686",
    });
  });

  app.post("/api/demo/send-email", async (req, res) => {
    const body = req.body as GatewaySendEmailRequest;
    const remoteIp =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      undefined;

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
            return {
              status: 400,
              body: {
                ok: false,
                error: verify.message || "reCAPTCHA failed",
              } satisfies GatewaySendEmailResponse,
            };
          }

          rootSpan.setAttribute("recaptcha.success", true);
          const messageId = crypto.randomUUID();
          const payload: EmailSendPayload = {
            messageId,
            to: body.to.trim(),
            subject: body.subject.trim(),
            html: body.body,
            type: "demo.send",
            source: "gateway",
          };

          await runWithSpan(
            "demo-gateway",
            "jetstream.publish email.send",
            SpanKind.PRODUCER,
            {
              "messaging.system": "nats",
              "messaging.destination": Subjects.EmailSend,
              "messaging.operation": "publish",
              "messaging.message.id": messageId,
            },
            async () => {
              const hdr = injectTraceHeaders(natsHeaders());
              hdr.set("Nats-Msg-Id", messageId);
              await js.publish(Subjects.EmailSend, encodeJson(payload), {
                headers: hdr,
              });
            }
          );

          rootSpan.setAttribute("email.message_id", messageId);
          return {
            status: 200,
            body: { ok: true, messageId } satisfies GatewaySendEmailResponse,
          };
        }
      );

      res.status(result.status).json(result.body);
      if (result.body.ok) {
        console.log(
          `[gateway] published email.send MessageId=${result.body.messageId} To=${body.to}`
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
    console.log(`[gateway] Jaeger UI http://127.0.0.1:16686`);
  });
}

main().catch((err) => {
  console.error("[gateway] fatal", err);
  process.exit(1);
});
