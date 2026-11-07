import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { accountHash, cleanProfile, loadPlayer, savePlayer, tokenHash } from "@/lib/player-db";
import { profileHasProgress } from "@/lib/progress";

export const dynamic = "force-dynamic";

async function accountKey(): Promise<string | null> {
  const { data: session } = await auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return null;
  return accountHash(userId);
}

function legacyHash(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([a-f0-9]{64})$/.exec(header);
  return match ? tokenHash(match[1]) : null;
}

export async function GET(request: Request) {
  const key = await accountKey();
  if (!key) return NextResponse.json({ error: "Sign in to load this trainer." }, { status: 401 });
  try {
    let profile = await loadPlayer(key);
    if (!profile) return NextResponse.json({ error: "Player storage is unavailable." }, { status: 503 });
    const adopt = new URL(request.url).searchParams.get("adopt") === "1";
    const legacy = legacyHash(request);
    if (adopt && !profileHasProgress(profile) && legacy && legacy !== key) {
      const older = await loadPlayer(legacy);
      if (older && profileHasProgress(older)) {
        const saved = await savePlayer(key, older);
        if (saved) profile = older;
      }
    }
    return NextResponse.json(profile);
  } catch (error) {
    console.error("load player failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Player storage is unavailable." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const key = await accountKey();
  if (!key) return NextResponse.json({ error: "Sign in to save this trainer." }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Profile could not be read." }, { status: 400 });
  }
  const profile = cleanProfile(body);
  if (!profile) return NextResponse.json({ error: "Profile is not valid." }, { status: 400 });
  try {
    const saved = await savePlayer(key, profile);
    if (!saved) return NextResponse.json({ error: "Player storage is unavailable." }, { status: 503 });
    return NextResponse.json(profile);
  } catch (error) {
    console.error("save player failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Player storage is unavailable." }, { status: 503 });
  }
}
