import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
  type Context,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import type { MsgHdrs } from "nats";
import { headers as createHeaders } from "nats";

export { SpanKind, SpanStatusCode };

let sdk: NodeSDK | null = null;

export function isTracingEnabled(): boolean {
  const flag = (process.env.OTEL_ENABLED || "true").toLowerCase();
  return flag !== "false" && flag !== "0";
}

export function otlpEndpoint(): string {
  return (
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() ||
    "http://127.0.0.1:4318"
  );
}

/**
 * Start OTLP → Jaeger (docker jaeger all-in-one :4318).
 * Call once at process boot before handling traffic.
 */
export async function initTracing(serviceName: string): Promise<void> {
  if (!isTracingEnabled()) {
    console.log(`[otel] disabled for ${serviceName}`);
    return;
  }

  if (sdk) {
    return;
  }

  const endpoint = otlpEndpoint().replace(/\/$/, "");
  const exporter = new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
  });

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
    }),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  sdk.start();
  console.log(`[otel] ${serviceName} → ${endpoint}/v1/traces (Jaeger UI :16686)`);

  const shutdown = async (): Promise<void> => {
    try {
      await sdk?.shutdown();
    } catch (err) {
      console.warn("[otel] shutdown error", err);
    }
  };
  process.once("SIGTERM", () => {
    void shutdown();
  });
  process.once("SIGINT", () => {
    void shutdown();
  });
}

export function getTracer(name: string): ReturnType<typeof trace.getTracer> {
  return trace.getTracer(name, "1.0.0");
}

/** Inject W3C trace context into NATS headers (creates headers if missing). */
export function injectTraceHeaders(existing?: MsgHdrs): MsgHdrs {
  const hdr = existing ?? createHeaders();
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  for (const [key, value] of Object.entries(carrier)) {
    if (value) {
      hdr.set(key, value);
    }
  }
  return hdr;
}

/** Extract parent context from NATS message headers. */
export function extractTraceContext(msgHeaders?: MsgHdrs | null): Context {
  if (!msgHeaders) {
    return context.active();
  }
  const carrier: Record<string, string> = {};
  const keys = msgHeaders.keys();
  for (const key of keys) {
    const values = msgHeaders.values(key);
    if (values.length > 0) {
      carrier[key.toLowerCase()] = values[0];
    }
  }
  return propagation.extract(context.active(), carrier);
}

export async function runWithSpan<T>(
  tracerName: string,
  spanName: string,
  kind: SpanKind,
  attrs: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
  parentCtx?: Context
): Promise<T> {
  const tracer = getTracer(tracerName);
  const ctx = parentCtx ?? context.active();
  return context.with(ctx, async () => {
    return tracer.startActiveSpan(
      spanName,
      { kind, attributes: attrs },
      async (span) => {
        try {
          const result = await fn(span);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err instanceof Error ? err.message : String(err),
          });
          throw err;
        } finally {
          span.end();
        }
      }
    );
  });
}
