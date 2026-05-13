import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, extractJson, MODEL_HAIKU, MODEL_SONNET } from "@/lib/anthropic";
import { extractRecipesFromHtml, parseIngredientLine, type ExtractedIngredient } from "@/lib/recipeExtract";

/**
 * POST /api/extract-recipe
 *
 * Body (URL mode):   { type: "url", url: string }
 * Body (image mode): { type: "image", imageBase64: string, mediaType: string }
 *
 * Returns: { items: ExtractedIngredient[], source: "json-ld" | "llm" | "vision", title?: string }
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
type Body = UrlBody | ImageBody;

const SYSTEM_PROMPT = `You extract ingredient lists from recipes. Reply with ONLY a JSON object — no markdown, no commentary.

Schema:
{
  "items": [
    { "name": "all-purpose flour", "quantity": 2, "unit": "cups", "raw": "2 cups all-purpose flour" }
  ]
}

Rules:
- "name" is the clean shopping-list name. Strip prep words (sifted, diced, chopped, minced, beaten, melted, softened) — those happen at home, not at the store.
- Strip parenthetical clarifications like "(about 8 oz)" from the name.
- "quantity" is the numeric amount, e.g. 2, 1.5, 0.25. Convert fractions ("1/2" → 0.5). Omit if the recipe gives no quantity ("salt to taste").
- "unit" is the measurement unit if any (cups, tbsp, tsp, oz, lb, g, kg, mL, L, can, pack, etc). Omit if no unit.
- "raw" preserves the original line verbatim for verification.
- Skip section headings ("For the sauce:"), instructions, equipment, and garnish-only items ("optional: parsley").
- If two ingredients are alternates ("flour or cornstarch") emit only the first.
- Output every real ingredient — never elide the list.`;

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
}

function coerceItem(raw: LlmItem): ExtractedIngredient | null {
  if (typeof raw.name !== "string" || !raw.name.trim()) return null;
  return {
    name: raw.name.trim(),
    quantity: typeof raw.quantity === "number" && Number.isFinite(raw.quantity) ? raw.quantity : undefined,
    unit: typeof raw.unit === "string" && raw.unit.trim() ? raw.unit.trim() : undefined,
    raw: typeof raw.raw === "string" ? raw.raw : raw.name as string,
  };
}

async function llmExtractFromText(text: string, isJsonLdList: boolean): Promise<ExtractedIngredient[]> {
  const anthropic = getAnthropic();
  const userContent = isJsonLdList
    ? `Here is a list of ingredient strings from a recipe. Normalize each into the schema described:\n\n${text}`
    : `Here is HTML content that contains a recipe. Find the ingredient list and normalize it into the schema described:\n\n${text}`;

  const resp = await anthropic.messages.create({
    model: MODEL_HAIKU,
    max_tokens: 1500,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userContent }],
  });
  const textBlock = resp.content.find((c) => c.type === "text");
  const responseText = textBlock && "text" in textBlock ? textBlock.text : "";
  const parsed = extractJson<{ items?: LlmItem[] }>(responseText);
  if (!parsed?.items) return [];
  return parsed.items.map(coerceItem).filter((i): i is ExtractedIngredient => i !== null);
}

async function llmExtractFromImage(imageBase64: string, mediaType: string): Promise<ExtractedIngredient[]> {
  const anthropic = getAnthropic();
  // Sanity check the media type — Claude vision accepts image/jpeg, png, gif, webp.
  const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
  type ValidType = typeof validTypes[number];
  const safeMediaType: ValidType = (validTypes as readonly string[]).includes(mediaType)
    ? (mediaType as ValidType)
    : "image/jpeg";

  const resp = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 1500,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: safeMediaType, data: imageBase64 } },
          { type: "text", text: "Extract the ingredient list from this recipe image, following the JSON schema in the system prompt." },
        ],
      },
    ],
  });
  const textBlock = resp.content.find((c) => c.type === "text");
  const responseText = textBlock && "text" in textBlock ? textBlock.text : "";
  const parsed = extractJson<{ items?: LlmItem[] }>(responseText);
  if (!parsed?.items) return [];
  return parsed.items.map(coerceItem).filter((i): i is ExtractedIngredient => i !== null);
}

export async function POST(req: Request) {
  // Auth-gate — only signed-in users.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || (body.type !== "url" && body.type !== "image")) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    if (body.type === "url") {
      if (typeof body.url !== "string" || !/^https?:\/\//i.test(body.url)) {
        return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
      }

      let html: string;
      try {
        const res = await fetch(body.url, {
          headers: {
            // Pretend to be a normal browser; some sites gate on user-agent.
            "User-Agent": "Mozilla/5.0 (compatible; OurPantryBot/1.0; +https://example.com)",
            "Accept": "text/html",
          },
          // Don't follow redirects forever.
          redirect: "follow",
          // 10s timeout via AbortSignal
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          return NextResponse.json({ error: `Couldn't fetch page (HTTP ${res.status})` }, { status: 502 });
        }
        html = await res.text();
      } catch {
        return NextResponse.json({ error: "Couldn't fetch page" }, { status: 502 });
      }

      // 1. Try JSON-LD first.
      const jsonLd = extractRecipesFromHtml(html);
      if (jsonLd && jsonLd.ingredients.length > 0) {
        // Quick regex parse — works for ~70% of lines without an LLM call.
        const cheap = jsonLd.ingredients.map(parseIngredientLine);
        // If most lines have qty parsed cleanly, return as-is. Otherwise
        // let the LLM normalize the whole list — better consistency.
        const cleanRatio = cheap.filter((i) => i.quantity !== undefined).length / cheap.length;
        if (cleanRatio >= 0.6) {
          return NextResponse.json({ items: cheap, source: "json-ld", title: jsonLd.name ?? undefined });
        }
        // Fall through to LLM normalization of the JSON-LD list.
        const items = await llmExtractFromText(jsonLd.ingredients.join("\n"), true);
        return NextResponse.json({ items, source: "json-ld", title: jsonLd.name ?? undefined });
      }

      // 2. No JSON-LD — send HTML region to Haiku.
      const region = extractRecipeRegion(html);
      if (!region) {
        return NextResponse.json({ error: "Couldn't find a recipe on the page" }, { status: 422 });
      }
      const items = await llmExtractFromText(region, false);
      if (items.length === 0) {
        return NextResponse.json({ error: "We couldn't find a recipe on that page" }, { status: 422 });
      }
      return NextResponse.json({ items, source: "llm" });
    }

    // image flow
    if (typeof body.imageBase64 !== "string" || typeof body.mediaType !== "string") {
      return NextResponse.json({ error: "Invalid image body" }, { status: 400 });
    }
    const items = await llmExtractFromImage(body.imageBase64, body.mediaType);
    if (items.length === 0) {
      return NextResponse.json({ error: "We couldn't read a recipe in that photo" }, { status: 422 });
    }
    return NextResponse.json({ items, source: "vision" });
  } catch (e) {
    console.error("extract-recipe failed:", e);
    const msg = e instanceof Error && e.message.includes("ANTHROPIC_API_KEY")
      ? "Recipe import is not configured"
      : "Recipe extraction failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
