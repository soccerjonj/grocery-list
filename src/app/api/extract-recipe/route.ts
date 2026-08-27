import { NextResponse } from "next/server";
import { getAnthropic, extractJson, MODEL_HAIKU, MODEL_SONNET } from "@/lib/anthropic";
import {
  extractRecipesFromHtml,
  parseIngredientLine,
  type ExtractedIngredient,
  type ExtractedStep,
} from "@/lib/recipeExtract";
import { guardLlmRoute } from "@/lib/apiGuard";
import { safeFetchText, SsrfBlockedError } from "@/lib/ssrfGuard";

// Cap the fetched HTML and the inbound image so a huge body can't OOM the
// function or balloon Anthropic token cost.
const MAX_FETCH_BYTES = 3_000_000;       // 3 MB of HTML
const MAX_IMAGE_BASE64 = 8_000_000;      // ~6 MB decoded

/**
 * POST /api/extract-recipe
 *
 * Body (URL mode):   { type: "url", url: string }
 * Body (image mode): { type: "image", imageBase64: string, mediaType: string }
 * Body (paste mode): { type: "text", text: string }
 *
 * Returns: {
 *   items, steps, title?, servings?, prepMinutes?, cookMinutes?, imageUrl?,
 *   description?, source: "json-ld" | "llm" | "vision" | "paste"
 * }
 *
 * URL flow:
 *   1. Server-fetch the page.
 *   2. Look for JSON-LD with @type=Recipe — most major recipe sites
 *      publish this. ~80% hit rate, zero LLM cost on success.
 *   3. Normalize each line with a quick regex parser; only fall through
 *      to Haiku for lines we can't parse (rare).
 *   4. If no JSON-LD found, send a truncated HTML excerpt to Haiku
 *      and ask it to extract ingredients.
 *
 * Image flow:
 *   1. Send the image directly to Sonnet (vision) with the same
 *      extraction prompt.
 */

export const runtime = "nodejs";
export const maxDuration = 30; // vision calls can take ~10s

interface UrlBody {
  type: "url";
  url: string;
}
interface ImageBody {
  type: "image";
  imageBase64: string;
  mediaType: string;
}
interface TextBody {
  type: "text";
  text: string;
}
type Body = UrlBody | ImageBody | TextBody;

/** Paste mode cap — generous for a recipe, small enough to bound token cost. */
const MAX_PASTE_LEN = 12000;

/**
 * Phase 4 rewrite. This prompt used to say "skip section headings and
 * instructions" — the whole point then was a shopping list. Now that recipes
 * are cooked from, steps and groupings are the valuable part, so both are
 * captured and headings become `group` rather than being discarded.
 */
const SYSTEM_PROMPT = `You extract structured recipes. Reply with ONLY a JSON object — no markdown, no commentary.

Schema:
{
  "title": "Chocolate chip cookies",
  "servings": 24,
  "prepMinutes": 15,
  "cookMinutes": 12,
  "items": [
    { "name": "all-purpose flour", "quantity": 2, "unit": "cups", "raw": "2 cups all-purpose flour", "group": "For the dough", "optional": false }
  ],
  "steps": [
    { "text": "Cream the butter and sugar until light.", "group": "For the dough" }
  ]
}

Ingredient rules:
- "name" is the clean shopping-list name. Strip prep words (sifted, diced, chopped, minced, beaten, melted, softened) — those happen at home, not at the store.
- Strip parenthetical clarifications like "(about 8 oz)" from the name.
- "quantity" is the numeric amount, e.g. 2, 1.5, 0.25. Convert fractions ("1/2" → 0.5). Omit if the recipe gives no quantity ("salt to taste").
- "unit" is the measurement unit if any (cups, tbsp, tsp, oz, lb, g, kg, mL, L, can, pack, etc). Omit if no unit.
- "raw" preserves the original line verbatim for verification.
- "group" is the section heading the ingredient sits under ("For the sauce"), WITHOUT the trailing colon. Omit when the recipe has no sections. Never emit a heading as its own ingredient.
- "optional": true only for garnishes or lines the recipe itself marks optional.
- If two ingredients are alternates ("flour or cornstarch") emit only the first.
- Output every real ingredient — never elide the list.

Step rules:
- "text" is one instruction, verbatim where possible but without a leading step number.
- "group" is the section heading the step belongs to, when the method is divided into parts.
- Preserve the recipe's order exactly. Do not merge or summarize steps.
- Omit "steps" entirely if the source has no instructions (e.g. an ingredients-only photo).

Metadata rules:
- "title", "servings", "prepMinutes", "cookMinutes" are all optional — omit any the source doesn't state. Never guess times or yields.
- "servings" is a plain number of servings.`;

const MAX_HTML_LEN = 18000;

/** Sloppy-but-effective excerpt: try to isolate the recipe portion of the page. */
function extractRecipeRegion(html: string): string {
  // If there's a <main> or article tag, prefer that.
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0];
  if (main && main.length < MAX_HTML_LEN * 1.5) return strip(main).slice(0, MAX_HTML_LEN);
  const article = html.match(/<article[\s\S]*?<\/article>/i)?.[0];
  if (article && article.length < MAX_HTML_LEN * 1.5) return strip(article).slice(0, MAX_HTML_LEN);
  return strip(html).slice(0, MAX_HTML_LEN);
}

function strip(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface LlmItem {
  name?: unknown;
  quantity?: unknown;
  unit?: unknown;
  raw?: unknown;
  group?: unknown;
  optional?: unknown;
}
interface LlmStep {
  text?: unknown;
  group?: unknown;
}
interface LlmPayload {
  items?: LlmItem[];
  steps?: LlmStep[];
  title?: unknown;
  servings?: unknown;
  prepMinutes?: unknown;
  cookMinutes?: unknown;
}

/** What every extraction path resolves to, whatever the source. */
export interface ExtractResult {
  items: ExtractedIngredient[];
  steps: ExtractedStep[];
  title: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  imageUrl: string | null;
  description: string | null;
}

const EMPTY: ExtractResult = {
  items: [], steps: [], title: null, servings: null,
  prepMinutes: null, cookMinutes: null, imageUrl: null, description: null,
};

function coerceItem(raw: LlmItem): ExtractedIngredient | null {
  if (typeof raw.name !== "string" || !raw.name.trim()) return null;
  const group = typeof raw.group === "string" && raw.group.trim()
    // Models re-add the colon despite the instruction; strip it here rather
    // than trusting the prompt.
    ? raw.group.trim().replace(/:\s*$/, "")
    : undefined;
  return {
    name: raw.name.trim(),
    quantity: typeof raw.quantity === "number" && Number.isFinite(raw.quantity) ? raw.quantity : undefined,
    unit: typeof raw.unit === "string" && raw.unit.trim() ? raw.unit.trim() : undefined,
    raw: typeof raw.raw === "string" ? raw.raw : raw.name as string,
    ...(group ? { group } : {}),
    ...(raw.optional === true ? { optional: true } : {}),
  };
}

function coerceStep(raw: LlmStep): ExtractedStep | null {
  if (typeof raw.text !== "string" || raw.text.trim().length < 2) return null;
  const group = typeof raw.group === "string" && raw.group.trim()
    ? raw.group.trim().replace(/:\s*$/, "")
    : undefined;
  return { text: raw.text.trim(), ...(group ? { group } : {}) };
}

function posInt(v: unknown, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 && n <= max ? n : null;
}

function coercePayload(parsed: LlmPayload | null): ExtractResult {
  if (!parsed) return EMPTY;
  return {
    items: (parsed.items ?? []).map(coerceItem).filter((i): i is ExtractedIngredient => i !== null),
    steps: (parsed.steps ?? []).map(coerceStep).filter((s): s is ExtractedStep => s !== null),
    title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : null,
    servings: posInt(parsed.servings, 500),
    prepMinutes: posInt(parsed.prepMinutes, 60 * 24),
    cookMinutes: posInt(parsed.cookMinutes, 60 * 24 * 7), // slow-cooker/curing recipes
    imageUrl: null,
    description: null,
  };
}

type TextSource = "json-ld-list" | "html" | "paste";

async function llmExtractFromText(text: string, source: TextSource): Promise<ExtractResult> {
  const anthropic = getAnthropic();
  const userContent =
    source === "json-ld-list"
      ? `Here is a list of ingredient strings from a recipe. Normalize each into the schema described:\n\n${text}`
      : source === "paste"
      ? `Here is recipe text a user pasted. Extract it into the schema described:\n\n${text}`
      : `Here is HTML content that contains a recipe. Extract it into the schema described:\n\n${text}`;

  const resp = await anthropic.messages.create({
    model: MODEL_HAIKU,
    // Raised from 1500: steps are far more tokens than an ingredient list, and
    // a truncated response loses the tail of the method.
    max_tokens: 4000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userContent }],
  });
  const textBlock = resp.content.find((c) => c.type === "text");
  const responseText = textBlock && "text" in textBlock ? textBlock.text : "";
  return coercePayload(extractJson<LlmPayload>(responseText));
}

async function llmExtractFromImage(imageBase64: string, mediaType: string): Promise<ExtractResult> {
  const anthropic = getAnthropic();
  // Sanity check the media type — Claude vision accepts image/jpeg, png, gif, webp.
  const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
  type ValidType = typeof validTypes[number];
  const safeMediaType: ValidType = (validTypes as readonly string[]).includes(mediaType)
    ? (mediaType as ValidType)
    : "image/jpeg";

  const resp = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 4000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: safeMediaType, data: imageBase64 } },
          {
            type: "text",
            text:
              "Extract this recipe — title, ingredients AND the full method — following the JSON schema in the system prompt. " +
              "If the image shows only an ingredient list with no instructions, omit \"steps\".",
          },
        ],
      },
    ],
  });
  const textBlock = resp.content.find((c) => c.type === "text");
  const responseText = textBlock && "text" in textBlock ? textBlock.text : "";
  return coercePayload(extractJson<LlmPayload>(responseText));
}

export async function POST(req: Request) {
  // Auth + household-membership + rate limit.
  const guard = await guardLlmRoute({ bucket: "extract-recipe", limit: 15, windowSeconds: 60 });
  if (guard.error) return guard.error;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || (body.type !== "url" && body.type !== "image" && body.type !== "text")) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    if (body.type === "url") {
      if (typeof body.url !== "string" || !/^https?:\/\//i.test(body.url)) {
        return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
      }

      let html: string;
      try {
        // SSRF-guarded fetch: blocks internal/metadata addresses, validates
        // every redirect hop, and caps the response size.
        const res = await safeFetchText(body.url, {
          maxBytes: MAX_FETCH_BYTES,
          timeoutMs: 10_000,
          headers: {
            // Pretend to be a normal browser; some sites gate on user-agent.
            "User-Agent": "Mozilla/5.0 (compatible; OurPantryBot/1.0; +https://example.com)",
            "Accept": "text/html",
          },
        });
        if (!res.ok) {
          // Generic 502 — don't echo the upstream status, which would turn
          // this into an internal-reachability oracle.
          return NextResponse.json({ error: "Couldn't fetch that page" }, { status: 502 });
        }
        html = res.text;
      } catch (err) {
        if (err instanceof SsrfBlockedError) {
          return NextResponse.json({ error: "That URL isn't allowed" }, { status: 400 });
        }
        return NextResponse.json({ error: "Couldn't fetch page" }, { status: 502 });
      }

      // 1. Try JSON-LD first — it carries steps/times/servings/image for free.
      const jsonLd = extractRecipesFromHtml(html);
      if (jsonLd && jsonLd.ingredients.length > 0) {
        const meta = {
          title: jsonLd.name ?? undefined,
          steps: jsonLd.instructions,
          servings: jsonLd.servings ?? undefined,
          prepMinutes: jsonLd.prepMinutes ?? undefined,
          cookMinutes: jsonLd.cookMinutes ?? undefined,
          imageUrl: jsonLd.imageUrl ?? undefined,
          description: jsonLd.description ?? undefined,
        };
        // Quick regex parse — works for ~70% of lines without an LLM call.
        const cheap = jsonLd.ingredients.map(parseIngredientLine);
        const cleanRatio = cheap.filter((i) => i.quantity !== undefined).length / cheap.length;
        if (cleanRatio >= 0.6) {
          return NextResponse.json({ items: cheap, source: "json-ld", ...meta });
        }
        // Ingredient lines were messy — let the LLM normalize just those. The
        // structured metadata above is already trustworthy, so we keep it
        // rather than paying to re-derive it.
        const llm = await llmExtractFromText(jsonLd.ingredients.join("\n"), "json-ld-list");
        return NextResponse.json({ items: llm.items, source: "json-ld", ...meta });
      }

      // 2. No JSON-LD — send the HTML region to Haiku for the whole recipe.
      const region = extractRecipeRegion(html);
      if (!region) {
        return NextResponse.json({ error: "Couldn't find a recipe on the page" }, { status: 422 });
      }
      const result = await llmExtractFromText(region, "html");
      if (result.items.length === 0) {
        return NextResponse.json({ error: "We couldn't find a recipe on that page" }, { status: 422 });
      }
      return NextResponse.json({ ...result, source: "llm" });
    }

    if (body.type === "text") {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (text.length < 20) {
        return NextResponse.json({ error: "Paste a bit more recipe text" }, { status: 400 });
      }
      const result = await llmExtractFromText(text.slice(0, MAX_PASTE_LEN), "paste");
      if (result.items.length === 0) {
        return NextResponse.json({ error: "We couldn't find a recipe in that text" }, { status: 422 });
      }
      return NextResponse.json({ ...result, source: "paste" });
    }

    // image flow
    if (typeof body.imageBase64 !== "string" || typeof body.mediaType !== "string") {
      return NextResponse.json({ error: "Invalid image body" }, { status: 400 });
    }
    if (body.imageBase64.length > MAX_IMAGE_BASE64) {
      return NextResponse.json({ error: "Image is too large" }, { status: 413 });
    }
    const vision = await llmExtractFromImage(body.imageBase64, body.mediaType);
    if (vision.items.length === 0) {
      return NextResponse.json({ error: "We couldn't read a recipe in that photo" }, { status: 422 });
    }
    return NextResponse.json({ ...vision, source: "vision" });
  } catch (e) {
    console.error("extract-recipe failed:", e);
    const msg = e instanceof Error && e.message.includes("ANTHROPIC_API_KEY")
      ? "Recipe import is not configured"
      : "Recipe extraction failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
