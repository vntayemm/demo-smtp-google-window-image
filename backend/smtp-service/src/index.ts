import path from "node:path";
import dotenv from "dotenv";
import {
  Consumers,
  Streams,
  Subjects,
  bootstrapEmailJetStream,
  connectNats,
  decodeJson,
  encodeJson,
  loadNatsEnv,
  type EmailSendPayload,
} from "@demo/shared";
import { SmtpService } from "./SmtpService";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

async function main(): Promise<void> {
  const natsEnv = loadNatsEnv();
  const nc = await connectNats(natsEnv.url);
  await bootstrapEmailJetStream(nc, natsEnv.jetStreamReplicas);

  const js = nc.jetstream();
  const consumer = await js.consumers.get(Streams.Email, Consumers.EmailWorker);
  const smtpService = new SmtpService();

  console.log(
    `[smtp-service] consuming ${Streams.Email}/${Consumers.EmailWorker}; SMTP ${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}`
  );

  const messages = await consumer.consume();
  for await (const msg of messages) {
    let payload: EmailSendPayload | null = null;
    try {
      payload = decodeJson<EmailSendPayload>(msg.data);
      const status = await smtpService.deliver(payload);
      msg.ack();
      console.log(
        `[smtp-service] ${status.toUpperCase()} MessageId=${payload.messageId} To=${payload.to}`
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(
        `[smtp-service] FAILED MessageId=${payload?.messageId ?? "?"} error=${error}`
      );

      const delivered = msg.info.deliveryCount;
      if (delivered >= 5) {
        await js.publish(
          Subjects.EmailDlq,
          encodeJson({
            payload,
            error,
            at: new Date().toISOString(),
          })
        );
        msg.ack();
        console.warn(`[smtp-service] moved to DLQ MessageId=${payload?.messageId}`);
      } else {
        msg.nak(2_000 * delivered);
      }
    }
  }
}

main().catch((err) => {
  console.error("[smtp-service] fatal", err);
  process.exit(1);
});
