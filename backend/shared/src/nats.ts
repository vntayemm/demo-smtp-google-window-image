import {
  connect,
  type NatsConnection,
  type JetStreamClient,
  type JetStreamManager,
  RetentionPolicy,
  StorageType,
  AckPolicy,
  DeliverPolicy,
} from "nats";
import { Consumers, Streams, Subjects } from "./subjects";

export interface NatsEnv {
  url: string;
  jetStreamReplicas: number;
}

export function loadNatsEnv(): NatsEnv {
  const url =
    process.env.NATS_URL?.trim() ||
    "nats://127.0.0.1:14222,nats://127.0.0.1:14223,nats://127.0.0.1:14224";
  const jetStreamReplicas = Number(process.env.NATS_JETSTREAM_REPLICAS || "3");
  return {
    url,
    jetStreamReplicas: Number.isFinite(jetStreamReplicas) && jetStreamReplicas > 0
      ? jetStreamReplicas
      : 1,
  };
}

export async function connectNats(url: string): Promise<NatsConnection> {
  const nc = await connect({ servers: url.split(",").map((s) => s.trim()) });
  console.log(`[nats] connected → ${nc.getServer()}`);
  return nc;
}

async function ensureStream(
  jsm: JetStreamManager,
  name: string,
  subjects: string[],
  replicas: number
): Promise<void> {
  try {
    await jsm.streams.info(name);
    console.log(`[nats] stream ${name} already exists`);
    return;
  } catch {
    // create below
  }

  try {
    await jsm.streams.add({
      name,
      subjects,
      retention: RetentionPolicy.Limits,
      storage: StorageType.File,
      num_replicas: replicas,
      max_msgs: -1,
      max_bytes: -1,
    });
    console.log(`[nats] stream ${name} created (replicas=${replicas})`);
  } catch (err) {
    if (replicas > 1) {
      console.warn(
        `[nats] stream ${name} replicas=${replicas} failed; fallback replicas=1`,
        err
      );
      await jsm.streams.add({
        name,
        subjects,
        retention: RetentionPolicy.Limits,
        storage: StorageType.File,
        num_replicas: 1,
        max_msgs: -1,
        max_bytes: -1,
      });
      console.log(`[nats] stream ${name} created (replicas=1)`);
      return;
    }
    throw err;
  }
}

export async function bootstrapEmailJetStream(
  nc: NatsConnection,
  replicas: number
): Promise<{ js: JetStreamClient; jsm: JetStreamManager }> {
  const jsm = await nc.jetstreamManager();
  const js = nc.jetstream();

  await ensureStream(jsm, Streams.Email, [Subjects.EmailSend], replicas);
  await ensureStream(jsm, Streams.EmailDlq, [Subjects.EmailDlq], replicas);

  try {
    await jsm.consumers.add(Streams.Email, {
      durable_name: Consumers.EmailWorker,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
      filter_subject: Subjects.EmailSend,
      max_deliver: 5,
      ack_wait: 30_000_000_000, // 30s ns
    });
    console.log(`[nats] consumer ${Consumers.EmailWorker} ready`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/already in use|already exists/i.test(msg)) {
      console.warn(`[nats] consumer create note: ${msg}`);
    } else {
      console.log(`[nats] consumer ${Consumers.EmailWorker} already exists`);
    }
  }

  return { js, jsm };
}

export function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

export function decodeJson<T>(data: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(data)) as T;
}

export * from "./subjects";
