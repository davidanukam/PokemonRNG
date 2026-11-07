import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { keepAvatar } from "@/lib/storage";
import type { Profile } from "@/lib/types";

const COPY_LIMIT = 50_000;

type CopyRow = { card_id: number; condition: number; count: number };

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}

export function tokenHash(token: string): string | null {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

export function accountHash(userId: string): string | null {
  if (userId.length < 8 || userId.length > 200 || /[\u0000-\u001f]/.test(userId)) return null;
  return createHash("sha256").update(`pokerng-user:${userId}`).digest("hex");
}

export function cleanProfile(body: unknown): Profile | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 24) : "";
  const xp = whole(raw.xp);
  const opened = whole(raw.opened);
  if (!name || xp == null || opened == null) return null;
  if (typeof raw.avatar !== "string") return null;
  const avatar = keepAvatar(raw.avatar);
  if (raw.avatar && !avatar) return null;
  const recent = Array.isArray(raw.recent)
    ? raw.recent.map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 8)
    : null;
  if (!recent || !raw.owned || typeof raw.owned !== "object" || Array.isArray(raw.owned)) return null;

  const owned: Record<string, number[]> = {};
  let rows = 0;
  for (const [key, value] of Object.entries(raw.owned as Record<string, unknown>)) {
    const cardId = Number(key);
    if (!Number.isInteger(cardId) || cardId <= 0 || !Array.isArray(value)) continue;
    const counts = [0, 0, 0, 0, 0];
    for (let condition = 0; condition < 5; condition += 1) {
      const count = whole(value[condition]);
      if (count == null) return null;
      counts[condition] = count;
      if (count > 0) rows += 1;
    }
    if (counts.some((count) => count > 0)) owned[String(cardId)] = counts;
    if (rows > COPY_LIMIT) return null;
  }
  return { name, owned, opened, xp, avatar, recent };
}

export async function loadPlayer(hash: string): Promise<Profile | null> {
  const sql = database();
  if (!sql) return null;
  const rows = await sql`select public.load_player(${hash}) as profile`;
  return profileFromPayload(rows[0]?.profile);
}

export async function savePlayer(hash: string, profile: Profile): Promise<boolean> {
  const sql = database();
  if (!sql) return false;
  const copies = copyRows(profile);
  await sql`select public.save_player(
    ${hash},
    ${profile.name},
    ${profile.xp},
    ${profile.opened},
    ${profile.avatar},
    ${profile.recent}::int[],
    ${JSON.stringify(copies)}::jsonb
  )`;
  return true;
}

function whole(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(number) || number < 0 || number > 1_000_000_000) return null;
  return Math.floor(number);
}

function copyRows(profile: Profile): CopyRow[] {
  const rows: CopyRow[] = [];
  for (const [cardId, counts] of Object.entries(profile.owned)) {
    counts.forEach((count, condition) => {
      if (count > 0) rows.push({ card_id: Number(cardId), condition, count });
    });
  }
  return rows;
}

function profileFromPayload(payload: unknown): Profile | null {
  const data = typeof payload === "string" ? parseJson(payload) : payload;
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const name = typeof row.name === "string" && row.name.trim() ? row.name : "Trainer";
  const xp = whole(row.xp) ?? 0;
  const opened = whole(row.opened) ?? 0;
  const avatar = typeof row.avatar === "string" ? keepAvatar(row.avatar) : "";
  const recent = recentOf(row.recent);
  const owned: Record<string, number[]> = {};
  const copies = Array.isArray(row.copies) ? row.copies : [];
  for (const copy of copies) {
    if (!copy || typeof copy !== "object") continue;
    const item = copy as Record<string, unknown>;
    const cardId = Number(item.card_id);
    const condition = Number(item.condition);
    const count = whole(item.count);
    if (!Number.isInteger(cardId) || cardId <= 0 || condition < 0 || condition > 4 || count == null || count <= 0) continue;
    const key = String(cardId);
    const counts = owned[key] ?? [0, 0, 0, 0, 0];
    counts[condition] = count;
    owned[key] = counts;
  }
  return { name, owned, opened, xp, avatar, recent };
}

function recentOf(value: unknown): number[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.replace(/[{}]/g, "").split(",") : [];
  return source.map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 8);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
