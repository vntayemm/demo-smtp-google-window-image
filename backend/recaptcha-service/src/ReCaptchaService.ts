import type {
  RecaptchaVerifyRequest,
  RecaptchaVerifyResponse,
} from "@demo/shared";

export interface ReCaptchaSettings {
  enabled: boolean;
  secretKey: string;
}

export function loadReCaptchaSettings(): ReCaptchaSettings {
  return {
    enabled: (process.env.RECAPTCHA_ENABLED || "true").toLowerCase() === "true",
    secretKey: process.env.RECAPTCHA_SECRET_KEY?.trim() || "",
  };
}

/**
 * Verifies Google reCAPTCHA v2 checkbox token via siteverify.
 * When disabled / secret empty → success (dev skip), matching CMIT-CP behaviour.
 */
export class ReCaptchaService {
  private readonly settings: ReCaptchaSettings;
  private readonly siteVerifyUrl =
    "https://www.google.com/recaptcha/api/siteverify";

  constructor(settings: ReCaptchaSettings = loadReCaptchaSettings()) {
    this.settings = settings;
  }

  async verify(request: RecaptchaVerifyRequest): Promise<RecaptchaVerifyResponse> {
    if (!this.settings.enabled || !this.settings.secretKey) {
      console.warn(
        `[recaptcha] verify skipped (enabled=${this.settings.enabled}, hasSecret=${Boolean(this.settings.secretKey)})`
      );
      return { success: true, message: "skipped" };
    }

    if (!request.token?.trim()) {
      return { success: false, message: "Token is empty.", errorCodes: ["missing-input-response"] };
    }

    const body = new URLSearchParams();
    body.set("secret", this.settings.secretKey);
    body.set("response", request.token);
    if (request.remoteIp) {
      body.set("remoteip", request.remoteIp);
    }

    try {
      const response = await fetch(this.siteVerifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      if (!response.ok) {
        return {
          success: false,
          message: `siteverify HTTP ${response.status}`,
        };
      }

      const payload = (await response.json()) as {
        success: boolean;
        "error-codes"?: string[];
      };

      return {
        success: Boolean(payload.success),
        errorCodes: payload["error-codes"] ?? [],
        message: payload.success ? undefined : "reCAPTCHA rejected",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[recaptcha] siteverify failed", err);
      return { success: false, message };
    }
  }
}
