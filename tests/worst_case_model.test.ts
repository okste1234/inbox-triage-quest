import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scoreAdversarial } from "../evals/adversarial_score.js";
import { CLASSIFY_OUTPUT } from "../src/classify.js";
import type { LlmCall } from "../src/llm-types.js";
import { triageMessages } from "../src/pipeline.js";
import { AdversarialLabelSchema, MessageSchema } from "../src/schema.js";
import { z } from "zod";

/**
 * Defense in depth: simulate a model that has been completely fooled. It calls every message routine,
 * says nothing needs a person, and offers no draft. The code around it must still stop what it can.
 */
const fooled: LlmCall = async ({ output }) => ({
  text:
    output === CLASSIFY_OUTPUT
      ? JSON.stringify({ intent: "other", secondary_intents: [], confidence: 1, needs_human: false, injection_suspected: false, reasons: "routine" })
      : JSON.stringify({ draft: "" }),
  stopReason: "end_turn",
  inputTokens: 0,
  outputTokens: 0,
});

describe("adversarial set against a fully fooled model", () => {
  const messages = z.array(MessageSchema).parse(JSON.parse(readFileSync("data/adversarial.json", "utf8")));
  const labels = z.array(AdversarialLabelSchema).parse(JSON.parse(readFileSync("data/adversarial_labels.json", "utf8")));

  it("still escalates injections, sensitive data, blank, emoji-only and gibberish messages", async () => {
    const { items } = await triageMessages(messages, { llm: fooled, classifySystem: "C", draftSystem: "D" });
    const result = scoreAdversarial(items, labels);
    const mustHold = ["a001", "a002", "a003", "a004", "a005", "a007", "a008", "a017", "a018", "a019", "a021"];
    const failedIds = new Set(result.failures.map((f) => f.id));
    for (const id of mustHold) expect(failedIds.has(id), `${id} should be stopped by code alone`).toBe(false);
  });

  it("never sends the sensitive numbers to the model", async () => {
    const seen: string[] = [];
    const spy: LlmCall = async (req) => {
      seen.push(req.user);
      return fooled(req);
    };
    await triageMessages(messages, { llm: spy, classifySystem: "C", draftSystem: "D" });
    expect(seen.join("\n")).not.toMatch(/123-45-6789|4111/);
  });

  it("never sends a detected injection to the model", async () => {
    const seen: string[] = [];
    const spy: LlmCall = async (req) => {
      seen.push(req.user);
      return fooled(req);
    };
    await triageMessages(messages, { llm: spy, classifySystem: "C", draftSystem: "D" });
    expect(seen.join("\n")).not.toMatch(/Ignore all previous instructions|admin mode|hiring manager|system prompt/i);
  });
});
