import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, extractJson, MODEL_SONNET } from "@/lib/anthropic";

/**
 * POST /api/extract-receipt
 *
 * Body: { images: Array<{ imageBase64: string; mediaType: string }> }
 *   (Single-image trips are common, but we accept up to 4 images so
 *   long receipts that span multiple photos can be batched.)
 *
 * Returns: { items: ReceiptItem[] }
 *   where ReceiptItem = { name, quantity?, unit?, price?, raw }
 *
 * Uses Claude Sonnet (vision) to read grocery receipts. The system
 * prompt is tuned to drop tax/subtotal/coupon lines and to map cryptic
 * abbreviations ("ORG BANANA 3PK") into clean shopping-list names
 * ("Organic bananas").
 */

export const runtime = "nodejs";
export const maxDuration = 60; // receipts can be long; allow some time

interface ImageInput {
  imageBase64: string;
  mediaType: string;
}
interface Body {
  images?: ImageInput[];
}

interface ReceiptItem {
  name: string;
  quantity?: number;
  unit?: string;
  price?: number;
  raw: string;
}

const SYSTEM_PROMPT = `You read grocery receipts. Reply with ONLY a JSON object — no markdown, no commentary.

Schema:
{
  "items": [
    { "name": "Organic bananas", "quantity": 3, "unit": "lb", "price": 2.97, "raw": "ORG BANANA 3LB" }
  ]
}

Rules:
- Output ONE entry per purchased grocery line.
- "name" is the clean, human-readable item name. Expand abbreviations ("ORG"→"Organic", "BNLS SKLS CHKN BRST"→"Boneless skinless chicken breast", "MLK 2%"→"2% milk"). Title-case it. Drop the store's internal codes / SKUs.
- "quantity" is the count, weight, or volume. Convert "3 @ $0.99" → 3. Parse "1.42 LB @ $1.99/LB" → quantity 1.42 with unit "lb".
- "unit" is the unit when present: "lb", "oz", "kg", "g", "L", "mL", "ea", "pack", etc.
- "price" is the line total in dollars, if visible. Optional.
- "raw" is the original text as printed on the receipt — keep it short.
- SKIP these: subtotal, total, tax, discounts, coupons, loyalty rewards, store/cashier headers, payment method lines, "thank you" footers, barcode-only items.
- If a line is ambiguous (just a code with no readable name), skip it rather than guess.
- Output every real grocery item you see — be thorough but precise.`;

const VALID_MEDIA = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ValidMedia = typeof VALID_MEDIA[number];

interface LlmItem {
  name?: unknown;
  quantity?: unknown;
  unit?: unknown;
  price?: unknown;
  raw?: unknown;
}

function coerce(raw: LlmItem): ReceiptItem | null {
  if (typeof raw.name !== "string" || !raw.name.trim()) return null;
  return {
    name: raw.name.trim(),
    quantity: typeof raw.quantity === "number" && Number.isFinite(raw.quantity) ? raw.quantity : undefined,
    unit: typeof raw.unit === "string" && raw.unit.trim() ? raw.unit.trim() : undefined,
    price: typeof raw.price === "number" && Number.isFinite(raw.price) ? raw.price : undefined,
    raw: typeof raw.raw === "string" ? raw.raw : raw.name as string,
  };
}

export async function POST(req: Request) {
  // Auth-gate
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || !Array.isArray(body.images) || body.images.length === 0) {
    return NextResponse.json({ error: "Provide at least one image" }, { status: 400 });
  }
  if (body.images.length > 4) {
    return NextResponse.json({ error: "Max 4 images per receipt batch" }, { status: 400 });
  }
  for (const img of body.images) {
    if (typeof img.imageBase64 !== "string" || typeof img.mediaType !== "string") {
      return NextResponse.json({ error: "Invalid image format" }, { status: 400 });
    }
  }

  let anthropic;
  try {
    anthropic = getAnthropic();
  } catch {
    return NextResponse.json({ error: "Receipt import is not configured" }, { status: 503 });
  }

  // Build the multi-image user message.
  const imageBlocks = body.images.map((img) => {
    const safeType: ValidMedia = (VALID_MEDIA as readonly string[]).includes(img.mediaType)
      ? (img.mediaType as ValidMedia)
      : "image/jpeg";
    return {
      type: "image" as const,
      source: { type: "base64" as const, media_type: safeType, data: img.imageBase64 },
    };
  });

  try {
    const resp = await anthropic.messages.create({
      model: MODEL_SONNET,
      max_tokens: 4000,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            { type: "text", text: body.images.length > 1
              ? "These photos show one continuous receipt (possibly multiple pages or scrolled views). Extract every grocery line, following the schema. Combine items across photos — don't duplicate lines that appear in both."
              : "Extract every grocery line from this receipt, following the schema." },
          ],
        },
      ],
    });
    const textBlock = resp.content.find((c) => c.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text : "";
    const parsed = extractJson<{ items?: LlmItem[] }>(text);
    if (!parsed?.items) {
      return NextResponse.json({ items: [] });
    }
    const items = parsed.items.map(coerce).filter((i): i is ReceiptItem => i !== null);
    return NextResponse.json({ items });
  } catch (e) {
    console.error("extract-receipt failed:", e);
    return NextResponse.json({ error: "Couldn't read this receipt" }, { status: 500 });
  }
}
