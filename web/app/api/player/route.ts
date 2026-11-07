import { NextResponse } from "next/server";
import { cleanProfile, loadPlayer, savePlayer, tokenHash } from "@/lib/player-db";

export const dynamic = "force-dynamic";

function hashFrom(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([a-f0-9]{64})$/.exec(header);
  return match ? tokenHash(match[1]) : null;
}

export async function GET(request: Request) {
  const hash = hashFrom(request);
  if (!hash) return NextResponse.json({ error: "Sign-in token missing." }, { status: 401 });
  try {
    const profile = await loadPlayer(hash);
    if (!profile) return NextResponse.json({ error: "Player storage is unavailable." }, { status: 503 });
    return NextResponse.json(profile);
  } catch (error) {
    console.error("load player failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Player storage is unavailable." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const hash = hashFrom(request);
  if (!hash) return NextResponse.json({ error: "Sign-in token missing." }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Profile could not be read." }, { status: 400 });
  }
  const profile = cleanProfile(body);
  if (!profile) return NextResponse.json({ error: "Profile is not valid." }, { status: 400 });
  try {
    const saved = await savePlayer(hash, profile);
    if (!saved) return NextResponse.json({ error: "Player storage is unavailable." }, { status: 503 });
    return NextResponse.json(profile);
  } catch (error) {
    console.error("save player failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Player storage is unavailable." }, { status: 503 });
  }
}
