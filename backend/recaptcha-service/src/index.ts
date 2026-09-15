import path from "node:path";
import dotenv from "dotenv";
import {
  Subjects,
  SpanKind,
  connectNats,
  decodeJson,
  encodeJson,
  extractTraceContext,
  initTracing,
  injectTraceHeaders,
  loadNatsEnv,
  runWithSpan,
  type RecaptchaVerifyRequest,
  type RecaptchaVerifyResponse,
} from "@demo/shared";
import { headers as natsHeaders } from "nats";
import { ReCaptchaService } from "./ReCaptchaService";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

async function main(): Promise<void> {
  await initTracing(process.env.OTEL_SERVICE_NAME || "demo-recaptcha-service");

  const natsEnv = loadNatsEnv();
  const nc = await connectNats(natsEnv.url);
  const service = new ReCaptchaService();

  const sub = nc.subscribe(Subjects.RecaptchaVerify);
  console.log(`[recaptcha-service] listening on ${Subjects.RecaptchaVerify}`);
  console.log(`[recaptcha-service] Jaeger UI http://127.0.0.1:16686`);

  for await (const msg of sub) {
    const parentCtx = extractTraceContext(msg.headers);
    try {
      const result = await runWithSpan(
        "demo-recaptcha-service",
        "nats.handle demo.recaptcha.verify",
        SpanKind.SERVER,
        {
          "messaging.system": "nats",
          "messaging.destination": Subjects.RecaptchaVerify,
          "messaging.operation": "process",
        },
        async (span) => {
          const request = decodeJson<RecaptchaVerifyRequest>(msg.data);
          const verifyResult: RecaptchaVerifyResponse = await service.verify(request);
          span.setAttribute("recaptcha.success", verifyResult.success);
          if (verifyResult.errorCodes?.length) {
            span.setAttribute(
              "recaptcha.error_codes",
              verifyResult.errorCodes.join(",")
            );
          }
          return verifyResult;
        },
        parentCtx
      );

      const replyHdr = injectTraceHeaders(natsHeaders());
      if (msg.respond(encodeJson(result), { headers: replyHdr })) {
        console.log(
          `[recaptcha-service] verified success=${result.success} errors=${(result.errorCodes || []).join(",")}`
        );
      }
    } catch (err) {
      const fail: RecaptchaVerifyResponse = {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      };
      msg.respond(encodeJson(fail));
      console.error("[recaptcha-service] handler error", err);
    }
  }
}

main().catch((err) => {
  console.error("[recaptcha-service] fatal", err);
  process.exit(1);
});
