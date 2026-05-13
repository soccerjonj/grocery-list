import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, extractJson, MODEL_HAIKU } from "@/lib/anthropic";

/**
 * POST /api/classify-item
 *
 * Body: { name: string }
 *
 * Classifies an item name into our pantry taxonomy. Cached forever in
 * the `item_classifications` table — same item, same classification,
 * regardless of household.
 *
 * Returns: { kind, food_category, storage_location, fridge_zone? }
 *
 * Auth: must be authenticated (any household member). The cache write
 * uses a SECURITY DEFINER RPC so we don't need a service-role key here.
 */

export const runtime = "nodejs"; // Anthropic SDK uses node fetch internals

interface Classification {
  kind: "food" | "supplies";
  food_category: string | null;
  storage_location: string | null;
  fridge_zone: string | null;
}

const SYSTEM_PROMPT = `You classify household items into a pantry taxonomy. Reply with ONLY a JSON object — no explanations, no markdown.

Schema:
{
  "kind": "food" | "supplies",
  "food_category": one of (for food: "produce", "meat", "dairy", "drinks", "condiments", "grains", "snacks", "prepared", "other"; for supplies: "cleaning", "personal_care", "paper_goods", "pet", "other"),
  "storage_location": one of (for food: "fridge", "freezer", "pantry", "room_temp"; for supplies: "bathroom", "laundry", "kitchen", "garage", "other"),
  "fridge_zone": "quick_use" or "long_term" if storage_location is "fridge", otherwise null
}

Rules:
- "kind" is "supplies" for non-food household goods (cleaning, toiletries, paper goods, pet supplies). Otherwise "food".
- "food_category" must match the kind. Don't return a food category for a supplies item or vice versa.
- "storage_location" for food: fridge for perishable, freezer for frozen, pantry for shelf-stable, room_temp for counter fruit/bread.
- "fridge_zone": quick_use for items consumed within ~1 week (milk, meat, leftovers, fresh greens); long_term for items that keep weeks/months (hard cheese, butter, condiments, sealed drinks).
- Always return the JSON object — never refuse.`;

interface ClassifyBody {
  name?: unknown;
}

export async function POST(req: Request) {
  // Auth gate — only household members should hit the LLM.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as ClassifyBody;
  const rawName = typeof body.name === "string" ? body.name : "";
  const name = rawName.trim();
  if (!name || name.length > 80) {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }
  const normalized = name.toLowerCase();

  // 1. Cache hit?
  const { data: cached } = await supabase
    .from("item_classifications")
    .select("kind, food_category, storage_location, fridge_zone")
    .eq("name", normalized)
    .maybeSingle<Classification>();

  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  // 2. Ask the model.
  let anthropic;
  try {
    anthropic = getAnthropic();
  } catch {
    return NextResponse.json({ error: "LLM not configured" }, { status: 503 });
  }

  let parsed: Classification | null = null;
  try {
    const resp = await anthropic.messages.create({
      model: MODEL_HAIKU,
      max_tokens: 200,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // Cache the system prompt — every call reuses the same instructions.
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: `Classify: "${name}"` }],
    });
    const textBlock = resp.content.find((c) => c.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text : "";
    parsed = extractJson<Classification>(text);
  } catch (e) {
    console.error("classify-item LLM error:", e);
    return NextResponse.json({ error: "Classifier unavailable" }, { status: 502 });
  }

  if (!parsed || (parsed.kind !== "food" && parsed.kind !== "supplies")) {
    return NextResponse.json({ error: "Classifier produced invalid output" }, { status: 502 });
  }

  // 3. Persist to cache. Fire-and-await (we want the cache populated before
  // returning so the next caller is fast). Failure here is non-fatal — the
  // caller still gets a valid classification.
  await supabase.rpc("cache_item_classification", {
    p_name: normalized,
    p_kind: parsed.kind,
    p_food_category: parsed.food_category,
    p_storage_location: parsed.storage_location,
    p_fridge_zone: parsed.fridge_zone,
  });

  return NextResponse.json({ ...parsed, cached: false });
}
