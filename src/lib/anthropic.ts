/**
 * Shared Anthropic SDK client + small helpers for our server routes.
 *
 * Keeping the client construction here rather than in each route lets us
 * tune defaults (model, max_tokens, prompt cache) in one place. Server-
 * side only — `ANTHROPIC_API_KEY` is never exposed to the client.
 */

import Anthropic from "@anthropic-ai/sdk";

// Model identifiers as of 2026-05. Haiku is cheap + fast for classification;
// Sonnet handles vision and longer-form recipe extraction.
export const MODEL_HAIKU = "claude-haiku-4-5";
export const MODEL_SONNET = "claude-sonnet-4-5";

// Re-export the SDK's content-block types so callers don't need their own
// imports. These match Anthropic's documented Messages API shape.
export type {
  TextBlock,
  ImageBlockParam,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages";

let client: Anthropic | null = null;

/**
 * Lazy-singleton Anthropic client. Reads the key from the standard
 * `ANTHROPIC_API_KEY` env var. Throws a recognisable error if the key
 * is missing so the API route can return a 503 with a useful message.
 */
export function getAnthropic(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  client = new Anthropic({ apiKey });
  return client;
}

/**
 * Pull the first JSON object out of a Claude text response. Models
 * occasionally pad responses with markdown fences or short prefaces, so
 * we look for the outermost {...} and parse that. Returns `null` if we
 * can't find a parseable JSON object — caller decides how to handle.
 */
export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null;
  const start = text.indexOf("{");
  if (start < 0) return null;

  // Match balanced braces. Naive but works for well-formed JSON; if the
  // model emits weird truncation we'll just return null and caller falls
  // back to a sensible default.
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        try {
          return JSON.parse(slice) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
