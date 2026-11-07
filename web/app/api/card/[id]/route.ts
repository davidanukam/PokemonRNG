import { NextResponse } from "next/server";
import { loadCardFacts, PRICE_RANGES, type PriceRange } from "@/lib/tcgplayer";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^\d{1,12}$/.test(id)) return NextResponse.json({ error: "Unknown card." }, { status: 400 });
  const range = new URL(request.url).searchParams.get("range") ?? "quarter";
  if (!PRICE_RANGES.includes(range as PriceRange)) {
    return NextResponse.json({ error: "Unknown price range." }, { status: 400 });
  }
  try {
    const facts = await loadCardFacts(Number(id), range as PriceRange);
    return NextResponse.json(facts);
  } catch (error) {
    console.error("card facts failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Card details are unavailable." }, { status: 502 });
  }
}
