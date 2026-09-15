import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import {
  Subjects,
  bootstrapEmailJetStream,
  connectNats,
  decodeJson,
  encodeJson,
  loadNatsEnv,
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
    });
  });

  app.get("/api/config", (_req, res) => {
    res.json({
      recaptchaEnabled: (process.env.RECAPTCHA_ENABLED || "true").toLowerCase() === "true",
      siteKey: process.env.RECAPTCHA_SITE_KEY || "",
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
      const verifyReq: RecaptchaVerifyRequest = {
        token: body.recaptchaToken || "",
        remoteIp,
      };

      const verifyMsg = await nc.request(
        Subjects.RecaptchaVerify,
        encodeJson(verifyReq),
        { timeout: 8_000 }
      );
      const verify = decodeJson<RecaptchaVerifyResponse>(verifyMsg.data);
      if (!verify.success) {
        const fail: GatewaySendEmailResponse = {
          ok: false,
          error: verify.message || "reCAPTCHA failed",
        };
        res.status(400).json(fail);
        return;
      }

      const messageId = crypto.randomUUID();
      const payload: EmailSendPayload = {
        messageId,
        to: body.to.trim(),
        subject: body.subject.trim(),
        html: body.body,
        type: "demo.send",
        source: "gateway",
      };

      const hdr = natsHeaders();
      hdr.set("Nats-Msg-Id", messageId);

      await js.publish(Subjects.EmailSend, encodeJson(payload), { headers: hdr });

      const ok: GatewaySendEmailResponse = { ok: true, messageId };
      res.json(ok);
      console.log(`[gateway] published email.send MessageId=${messageId} To=${payload.to}`);
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
  });
}

main().catch((err) => {
  console.error("[gateway] fatal", err);
  process.exit(1);
});
