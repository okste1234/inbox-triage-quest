/** What a task needs the model to return: a JSON Schema for providers that enforce one, and a plain-text hint for those that don't. */
export interface LlmOutputSpec {
  schema: Record<string, unknown>;
  /** Spelled-out JSON shape appended to the system prompt for JSON-mode-only providers. */
  hint: string;
}

export interface LlmRequest {
  system: string;
  user: string;
  output: LlmOutputSpec;
}

export interface LlmResponse {
  text: string;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

/** The only thing a pipeline stage needs from an LLM. Tests pass a fake; src/llm.ts passes a real one. */
export type LlmCall = (req: LlmRequest) => Promise<LlmResponse>;

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}
