import nodemailer, { type Transporter } from "nodemailer";
import type {
  EmailMessage,
  EmailSettings,
  IEmailSender,
} from "./EmailSettings";
import { loadEmailSettings } from "./EmailSettings";

/**
 * SMTP sender (nodemailer). Mirrors CMIT-CP SmtpEmailSender role.
 */
export class SmtpEmailSender implements IEmailSender {
  private readonly settings: EmailSettings;
  private transporter: Transporter | null = null;

  constructor(settings: EmailSettings = loadEmailSettings()) {
    this.settings = settings;
  }

  private getTransporter(): Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    if (!this.settings.host) {
      throw new Error("Email:Host is empty — refusing to send (NullEmailSender equivalent).");
    }

    const auth =
      this.settings.userName || this.settings.password
        ? {
            user: this.settings.userName,
            pass: this.settings.password,
          }
        : undefined;

    this.transporter = nodemailer.createTransport({
      host: this.settings.host,
      port: this.settings.port,
      secure: this.settings.enableSsl && this.settings.port === 465,
      requireTLS: this.settings.enableSsl && this.settings.port !== 465,
      auth,
      tls: {
        rejectUnauthorized: false,
      },
    });

    return this.transporter;
  }

  async sendAsync(message: EmailMessage): Promise<void> {
    const transporter = this.getTransporter();
    const info = await transporter.sendMail({
      from: `"${this.settings.fromName}" <${this.settings.fromAddress}>`,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text || message.html.replace(/<[^>]+>/g, " "),
    });

    console.log(
      `[smtp] SENT messageId=${info.messageId} to=${message.to} subject=${message.subject}`
    );
  }
}
