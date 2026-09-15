import path from "node:path";
import dotenv from "dotenv";
import {
  Subjects,
  connectNats,
  decodeJson,
  encodeJson,
  loadNatsEnv,
  type RecaptchaVerifyRequest,
  type RecaptchaVerifyResponse,
} from "@demo/shared";
import { ReCaptchaService } from "./ReCaptchaService";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

async function main(): Promise<void> {
  const natsEnv = loadNatsEnv();
  const nc = await connectNats(natsEnv.url);
  const service = new ReCaptchaService();

  const sub = nc.subscribe(Subjects.RecaptchaVerify);
  console.log(`[recaptcha-service] listening on ${Subjects.RecaptchaVerify}`);

  for await (const msg of sub) {
    try {
      const request = decodeJson<RecaptchaVerifyRequest>(msg.data);
      const result: RecaptchaVerifyResponse = await service.verify(request);
      if (msg.respond(encodeJson(result))) {
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
