import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { z } from "zod";
import type { LlmCall } from "./llm-types.js";
import { triageMessages, type TriageItem } from "./pipeline.js";
import { MessageSchema, type Message } from "./schema.js";

export interface AppDeps {
  llm: LlmCall;
  classifySystem: string;
  draftSystem: string;
  /** Messages one client may triage per hour. Protects the model key behind a public URL. */
  maxMessagesPerHour?: number;
  /** Messages the whole server will triage per rolling 24 h, whoever asks. Keeps the model key's free quota safe. */
  maxMessagesPerDay?: number;
  /** Longest a triage request may take before the visitor gets a clear 504 instead of a frozen page. */
  requestDeadlineMs?: number;
}

const MAX_BODY_BYTES = 100_000;
const MAX_MESSAGES = 20;
const HOUR_MS = 3_600_000;

const InputMessage = z.object({
  from_name: z.string().max(80).optional(),
  subject: z.string().max(200).optional(),
  body: z.string().max(2000),
});
const RequestSchema = z.object({ messages: z.array(InputMessage).min(1).max(MAX_MESSAGES) });

const page = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

function sampleMessages(): Omit<Message, "from_email">[] {
  const all = z.array(MessageSchema).parse(JSON.parse(readFileSync(new URL("../data/demo_messages.json", import.meta.url), "utf8")));
  return all.map(({ from_email: _drop, ...rest }) => rest);
}

function send(res: ServerResponse, status: number, body: unknown, type = "application/json"): void {
  res.writeHead(status, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(type === "application/json" ? JSON.stringify(body) : String(body));
}

/** Reads up to MAX_BODY_BYTES; drains the rest so the client can still receive our 413. */
function readBody(req: IncomingMessage): Promise<{ text: string; tooLarge: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) tooLarge = true;
      else chunks.push(chunk);
    });
    req.on("end", () => resolve({ text: Buffer.concat(chunks).toString("utf8"), tooLarge }));
    req.on("error", reject);
  });
}

/** Internal error text can contain provider details, so clients only see a generic reason. */
function scrub(item: TriageItem): TriageItem {
  const out = { ...item, classification: { ...item.classification } };
  if (out.classification.error) out.classification.error = "classification failed";
  if (out.draft_error) out.draft_error = "drafting failed";
  return out;
}

export function createApp(deps: AppDeps): Server {
  const limit = deps.maxMessagesPerHour ?? 60;
  const dayLimit = deps.maxMessagesPerDay ?? 150;
  const day = { start: Date.now(), count: 0 };
  const usage = new Map<string, { start: number; count: number }>();

  function allow(ip: string, n: number): boolean {
    const now = Date.now();
    const entry = usage.get(ip);
    if (!entry || now - entry.start > HOUR_MS) {
      usage.set(ip, { start: now, count: n });
      return n <= limit;
    }
    if (entry.count + n > limit) return false;
    entry.count += n;
    return true;
  }

  return createServer(async (req, res) => {
    try {
      const path = (req.url ?? "/").split("?")[0];
      if (req.method === "GET" && path === "/") return send(res, 200, page, "text/html");
      if (req.method === "GET" && path === "/healthz") return send(res, 200, { ok: true });
      if (req.method === "GET" && path === "/api/sample") return send(res, 200, sampleMessages());

      if (path === "/api/triage") {
        if (req.method !== "POST") return send(res, 405, { error: "use POST" });
        const { text, tooLarge } = await readBody(req);
        if (tooLarge) return send(res, 413, { error: "request too large" });

        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          return send(res, 400, { error: "body must be JSON" });
        }
        const parsed = RequestSchema.safeParse(json);
        if (!parsed.success) {
          return send(res, 400, { error: `send 1-${MAX_MESSAGES} messages, body up to 2000 characters each` });
        }

        if (Date.now() - day.start > 24 * HOUR_MS) Object.assign(day, { start: Date.now(), count: 0 });
        if (day.count + parsed.data.messages.length > dayLimit) {
          return send(res, 429, { error: "The demo has used its daily budget. Please try again tomorrow." });
        }

        const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "unknown").split(",")[0].trim();
        if (!allow(ip, parsed.data.messages.length)) {
          return send(res, 429, { error: `Demo limit reached (${limit} messages per hour). Try again later.` });
        }

        day.count += parsed.data.messages.length;
        const messages: Message[] = parsed.data.messages.map((m, i) => ({
          id: `u${String(i + 1).padStart(3, "0")}`,
          from_name: m.from_name ?? "Candidate",
          from_email: "",
          subject: m.subject ?? "",
          body: m.body,
        }));
        const deadlineMs = deps.requestDeadlineMs ?? 60_000;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timedOut = new Promise<"timeout">((resolve) => {
          timer = setTimeout(() => resolve("timeout"), deadlineMs);
        });
        const outcome = await Promise.race([triageMessages(messages, deps), timedOut]);
        clearTimeout(timer);
        if (outcome === "timeout") {
          return send(res, 504, { error: "The model is taking too long right now. Please try again in a minute." });
        }
        return send(res, 200, { items: outcome.items.map(scrub), usage: outcome.usage });
      }
      return send(res, 404, { error: "not found" });
    } catch {
      return send(res, 500, { error: "internal error" });
    }
  });
}
