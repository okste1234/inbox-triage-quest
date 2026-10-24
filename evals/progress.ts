import type { LlmCall } from "../src/llm-types.js";

/** Logs each model call and warns every 15 s while one is still running, so a stall is visible instead of silent. */
export function withProgress(llm: LlmCall): LlmCall {
  let n = 0;
  return async (req) => {
    const id = ++n;
    const t0 = performance.now();
    const timer = setInterval(() => console.error(`  call #${id} still running after ${Math.round((performance.now() - t0) / 1000)}s`), 15_000);
    try {
      const res = await llm(req);
      console.error(`  call #${id} done in ${Math.round(performance.now() - t0)}ms`);
      return res;
    } catch (err) {
      console.error(`  call #${id} FAILED after ${Math.round(performance.now() - t0)}ms: ${err instanceof Error ? err.message.slice(0, 120) : err}`);
      throw err;
    } finally {
      clearInterval(timer);
    }
  };
}
