import type { EmailSendPayload } from "@demo/shared";
import type { IEmailSender } from "./EmailSettings";
import { SmtpEmailSender } from "./SmtpEmailSender";

/**
 * Application service wrapping SmtpEmailSender — consume JetStream payloads.
 */
export class SmtpService {
  private readonly sender: IEmailSender;
  private readonly sentIds = new Set<string>();

  constructor(sender: IEmailSender = new SmtpEmailSender()) {
    this.sender = sender;
  }

  async deliver(payload: EmailSendPayload): Promise<"sent" | "duplicate"> {
    if (!payload.messageId) {
      throw new Error("Email payload missing messageId");
    }

    if (this.sentIds.has(payload.messageId)) {
      console.log(`[smtp-service] duplicate skip MessageId=${payload.messageId}`);
      return "duplicate";
    }

    await this.sender.sendAsync({
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });

    this.sentIds.add(payload.messageId);
    return "sent";
  }
}
