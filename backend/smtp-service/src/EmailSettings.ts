export interface EmailSettings {
  host: string;
  port: number;
  enableSsl: boolean;
  userName: string;
  password: string;
  fromAddress: string;
  fromName: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export function loadEmailSettings(): EmailSettings {
  return {
    host: process.env.EMAIL_HOST?.trim() || "",
    port: Number(process.env.EMAIL_PORT || "587"),
    enableSsl: (process.env.EMAIL_ENABLE_SSL || "true").toLowerCase() === "true",
    userName: process.env.EMAIL_USERNAME?.trim() || "",
    password: process.env.EMAIL_PASSWORD?.trim() || "",
    fromAddress: process.env.EMAIL_FROM_ADDRESS?.trim() || "demo@localhost",
    fromName: process.env.EMAIL_FROM_NAME?.trim() || "Demo Portal",
  };
}

export interface IEmailSender {
  sendAsync(message: EmailMessage): Promise<void>;
}
