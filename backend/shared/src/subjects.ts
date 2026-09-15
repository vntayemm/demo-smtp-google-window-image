/** NATS subjects used by demo microservices. */
export const Subjects = {
  RecaptchaVerify: "demo.recaptcha.verify",
  EmailSend: "email.send",
  EmailDlq: "email.dlq",
} as const;

export const Streams = {
  Email: "EMAIL",
  EmailDlq: "EMAIL_DLQ",
} as const;

export const Consumers = {
  EmailWorker: "email-worker",
} as const;

export interface RecaptchaVerifyRequest {
  token: string;
  remoteIp?: string;
}

export interface RecaptchaVerifyResponse {
  success: boolean;
  message?: string;
  errorCodes?: string[];
}

export interface EmailSendPayload {
  messageId: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  type: string;
  source: string;
}

export interface GatewaySendEmailRequest {
  to: string;
  subject: string;
  body: string;
  recaptchaToken: string;
  /** Số message publish JetStream (perf test). Default 1, max GATEWAY_MAX_SEND_COUNT. */
  count?: number;
}

export interface GatewaySendEmailResponse {
  ok: boolean;
  messageId?: string;
  /** Batch id / first message id */
  batchId?: string;
  count?: number;
  published?: number;
  elapsedMs?: number;
  error?: string;
}
