import { copiesOf, valueOf } from "@/lib/game";
import type { Card, Profile } from "@/lib/types";

export type EvolutionBook = Record<string, { prev: string[]; next: string[] }>;
export type EvolutionStep = "next" | "prev";

const SUFFIXES = [" VMAX", " VSTAR", " V-UNION", " GX", " ex", " EX", " V", " BREAK", " δ"];
const PREFIXES = ["Dark ", "Light ", "Shining ", "Radiant "];
const ALIAS: Record<string, string> = {
  Flabebe: "Flabébé",
  "Galarian Sirfetch'd": "Sirfetch'd",
  "Nidoran F": "Nidoran♀",
  "Nidoran M": "Nidoran♂",
  "Nidoran (F)": "Nidoran♀",
  "Nidoran (M)": "Nidoran♂",
};

export function readEvolutionBook(raw: unknown): EvolutionBook | null {
  if (!raw || typeof raw !== "object") return null;
  const book: EvolutionBook = {};
  for (const [name, row] of Object.entries(raw)) {
    if (!row || typeof row !== "object") continue;
    const prev = Array.isArray((row as { prev?: unknown }).prev) ? (row as { prev: unknown[] }).prev.filter((item) => typeof item === "string") : [];
    const next = Array.isArray((row as { next?: unknown }).next) ? (row as { next: unknown[] }).next.filter((item) => typeof item === "string") : [];
    book[name] = { prev: prev as string[], next: next as string[] };
  }
  return Object.keys(book).length ? book : null;
}

function baseOf(name: string): string {
  return name.replace(/\s+\([^)]*\)$/, "").trim();
}

function formWords(name: string): string[] {
  const inside = /\(([^)]+)\)$/.exec(name)?.[1] ?? "";
  return inside
    .toLowerCase()
    .replace(/\s+form$/, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word && word !== "form");
}

function keysFor(name: string, book: EvolutionBook, bases: Map<string, string[]>): string[] {
  if (book[name]) return [name];
  const alias = ALIAS[name];
  if (alias && book[alias]) return [alias];
  const exactBase = bases.get(name) ?? [];
  const group = exactBase.length ? exactBase : suffixGroup(name, bases);
  if (!group.length) return [];
  const lowered = name.toLowerCase();
  const specific = group.filter((key) => {
    const words = formWords(key);
    return words.length > 0 && words.every((word) => lowered.includes(word));
  });
  return specific.length ? specific : group;
}

function suffixGroup(name: string, bases: Map<string, string[]>): string[] {
  const parts = name.split(" ");
  let match: string[] = [];
  let length = 0;
  for (let start = 0; start < parts.length; start += 1) {
    const base = parts.slice(start).join(" ");
    const keys = bases.get(base);
    if (keys && base.length > length) {
      match = keys;
      length = base.length;
    }
  }
  return match;
}

export function speciesKeys(cardName: string, book: EvolutionBook): string[] {
  if (cardName.includes(" & ") || cardName.startsWith("Mega ") || cardName.startsWith("M ")) return [];
  const bases = basesOf(book);
  let text = cardName.trim().replace(/\s+\(F\)$/, " F").replace(/\s+\(M\)$/, " M");
  let previous = "";
  while (text !== previous) {
    previous = text;
    text = text.replace(/\s+\([^)]*\)$/, "").trim();
  }
  const head = text.split(" - ")[0]?.trim();
  if (head) text = head;
  const direct = keysFor(text, book, bases);
  if (direct.length) return direct;
  const possessive = text.replace(/^.+'\s?s\s+/, "");
  if (possessive !== text) {
    const owned = keysFor(possessive, book, bases);
    if (owned.length) return owned;
    text = possessive;
  }
  for (const prefix of PREFIXES) {
    if (!text.startsWith(prefix)) continue;
    const rest = keysFor(text.slice(prefix.length), book, bases);
    if (rest.length) return rest;
  }
  for (let guard = 0; guard < 4; guard += 1) {
    const suffix = SUFFIXES.find((item) => text.endsWith(item));
    if (!suffix) break;
    text = text.slice(0, -suffix.length).trim();
    const hit = keysFor(text, book, bases);
    if (hit.length) return hit;
  }
  return keysFor(text, book, bases);
}

const baseCache = new WeakMap<EvolutionBook, Map<string, string[]>>();

function basesOf(book: EvolutionBook): Map<string, string[]> {
  const cached = baseCache.get(book);
  if (cached) return cached;
  const bases = new Map<string, string[]>();
  for (const name of Object.keys(book)) {
    const base = baseOf(name);
    const list = bases.get(base);
    if (list) list.push(name);
    else bases.set(base, [name]);
  }
  baseCache.set(book, bases);
  return bases;
}

function linked(keys: string[], book: EvolutionBook, side: "prev" | "next"): string[] {
  const names: string[] = [];
  for (const key of keys) {
    for (const name of book[key]?.[side] ?? []) {
      if (!names.includes(name)) names.push(name);
    }
  }
  return names;
}

function collector(card: Card): number {
  const match = /^(\d+)/.exec(card.number.trim());
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function choose(cards: Card[], current: Card, profile: Profile, ownedOnly: boolean): Card | null {
  const seen = new Set<number>();
  let pool = cards.filter((card) => {
    if (card.id === current.id || seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });
  if (ownedOnly) pool = pool.filter((card) => copiesOf(profile.owned, card.id) > 0);
  if (!pool.length) return null;
  const target = collector(current);
  pool.sort((a, b) => {
    const setA = a.set === current.set ? 0 : 1;
    const setB = b.set === current.set ? 0 : 1;
    if (setA !== setB) return setA - setB;
    const ownA = copiesOf(profile.owned, a.id) > 0 ? 0 : 1;
    const ownB = copiesOf(profile.owned, b.id) > 0 ? 0 : 1;
    if (ownA !== ownB) return ownA - ownB;
    return Math.abs(collector(a) - target) - Math.abs(collector(b) - target);
  });
  return pool[0] ?? null;
}

export type EvolutionMove = {
  previous: Card | null;
  next: Card | null;
  shown: Card | null;
  shownStep: EvolutionStep | null;
};

export function indexEvolutions(cards: Card[], book: EvolutionBook): Map<string, Card[]> {
  const byKey = new Map<string, Card[]>();
  for (const candidate of cards) {
    for (const key of speciesKeys(candidate.name, book)) {
      const list = byKey.get(key);
      if (list) list.push(candidate);
      else byKey.set(key, [candidate]);
    }
  }
  return byKey;
}

export function evolutionMove(card: Card, byKey: Map<string, Card[]>, profile: Profile, book: EvolutionBook): EvolutionMove | null {
  const keys = speciesKeys(card.name, book);
  if (!keys.length) return null;
  const previousNames = linked(keys, book, "prev");
  const nextNames = linked(keys, book, "next");
  if (!previousNames.length && !nextNames.length) return null;
  const previousCards = previousNames.flatMap((name) => byKey.get(name) ?? []);
  const nextCards = nextNames.flatMap((name) => byKey.get(name) ?? []);
  const ownedNext = choose(nextCards, card, profile, true);
  const ownedPrev = choose(previousCards, card, profile, true);
  return {
    previous: choose(previousCards, card, profile, false),
    next: choose(nextCards, card, profile, false),
    shown: ownedNext ?? ownedPrev,
    shownStep: ownedNext ? "next" : ownedPrev ? "prev" : null,
  };
}

export function displayCond(profile: Profile, card: Card): number {
  const row = profile.owned[String(card.id)] || [];
  let best = 0;
  let worth = -1;
  row.forEach((count, cond) => {
    if (!count) return;
    const value = valueOf(card, cond);
    if (value > worth) {
      worth = value;
      best = cond;
    }
  });
  return best;
}
