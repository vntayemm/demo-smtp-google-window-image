import path from "node:path";
import dotenv from "dotenv";
import {
  Consumers,
  Streams,
  Subjects,
  SpanKind,
  bootstrapEmailJetStream,
  connectNats,
  decodeJson,
  encodeJson,
  extractTraceContext,
  initTracing,
  injectTraceHeaders,
  loadNatsEnv,
  runWithSpan,
  type EmailSendPayload,
} from "@demo/shared";
import { headers as natsHeaders } from "nats";
import { SmtpService } from "./SmtpService";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

async function main(): Promise<void> {
  await initTracing(process.env.OTEL_SERVICE_NAME || "demo-smtp-service");

  const natsEnv = loadNatsEnv();
  const nc = await connectNats(natsEnv.url);
  await bootstrapEmailJetStream(nc, natsEnv.jetStreamReplicas);

  const js = nc.jetstream();
  const consumer = await js.consumers.get(Streams.Email, Consumers.EmailWorker);
  const smtpService = new SmtpService();

  console.log(
    `[smtp-service] consuming ${Streams.Email}/${Consumers.EmailWorker}; SMTP ${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}`
  );
  console.log(`[smtp-service] Jaeger UI http://127.0.0.1:16686`);

  const messages = await consumer.consume();
  for await (const msg of messages) {
    const parentCtx = extractTraceContext(msg.headers);
    let lastMessageId = "?";

    try {
      await runWithSpan(
        "demo-smtp-service",
        "jetstream.consume email.send",
        SpanKind.CONSUMER,
        {
          "messaging.system": "nats",
          "messaging.destination": Subjects.EmailSend,
          "messaging.operation": "process",
          "messaging.consumer": Consumers.EmailWorker,
          "messaging.delivery_count": msg.info.deliveryCount,
        },
        async (span) => {
          const payload = decodeJson<EmailSendPayload>(msg.data);
          lastMessageId = payload.messageId;
          span.setAttribute("messaging.message.id", payload.messageId);
          span.setAttribute("email.to", payload.to);
          span.setAttribute("email.type", payload.type);

          const status = await runWithSpan(
            "demo-smtp-service",
            "smtp.send",
            SpanKind.CLIENT,
            {
              "email.to": payload.to,
              "email.subject": payload.subject,
              "net.peer.name": process.env.EMAIL_HOST || "",
            },
            async () => smtpService.deliver(payload)
          );

          span.setAttribute("email.delivery_status", status);
          msg.ack();
          console.log(
            `[smtp-service] ${status.toUpperCase()} MessageId=${payload.messageId} To=${payload.to}`
          );
        },
        parentCtx
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(
        `[smtp-service] FAILED MessageId=${lastMessageId} error=${error}`
      );

      const delivered = msg.info.deliveryCount;
      if (delivered >= 5) {
        const hdr = injectTraceHeaders(natsHeaders());
        await js.publish(
          Subjects.EmailDlq,
          encodeJson({
            messageId: lastMessageId,
            error,
            at: new Date().toISOString(),
          }),
          { headers: hdr }
        );
        msg.ack();
        console.warn(`[smtp-service] moved to DLQ MessageId=${lastMessageId}`);
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
