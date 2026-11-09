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
  const group = exactBase.length ? exactBase : speciesSpan(name, bases);
  if (!group.length) return [];
  const lowered = name.toLowerCase();
  const specific = group.filter((key) => {
    const words = formWords(key);
    return words.length > 0 && words.every((word) => lowered.includes(word));
  });
  return specific.length ? specific : group;
}

function speciesSpan(name: string, bases: Map<string, string[]>): string[] {
  const parts = name.split(/\s+/).filter(Boolean);
  let match: string[] = [];
  let length = 0;
  for (let start = 0; start < parts.length; start += 1) {
    for (let end = start + 1; end <= parts.length; end += 1) {
      const base = parts.slice(start, end).join(" ");
      const keys = bases.get(base);
      if (keys && base.length > length) {
        match = keys;
        length = base.length;
      }
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
    text = text.replace(/\s+\[[^\]]*\]$/, "").replace(/\s+\([^)]*\)$/, "").trim();
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
  hasPrev: boolean;
  hasNext: boolean;
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

const NO_EVOLUTION: EvolutionMove = {
  previous: null,
  next: null,
  shown: null,
  shownStep: null,
  hasPrev: false,
  hasNext: false,
};

export type EvolutionRelative = {
  name: string;
  step: EvolutionStep;
  card: Card | null;
};

function walkFirst(start: string[], book: EvolutionBook, side: "prev" | "next"): string[] {
  const found: string[] = [];
  const seen = new Set(start);
  let name = linked(start, book, side)[0];
  while (name && !seen.has(name)) {
    seen.add(name);
    found.push(name);
    name = book[name]?.[side]?.[0];
  }
  return found;
}

function preferred(names: string[], byKey: Map<string, Card[]>, card: Card, profile: Profile, book: EvolutionBook): string {
  if (names.length === 1) return names[0];
  const picked = choose(
    names.flatMap((name) => byKey.get(name) ?? []),
    card,
    profile,
    false,
  );
  if (!picked) return names[0];
  const pickedKeys = new Set(speciesKeys(picked.name, book));
  return names.find((name) => pickedKeys.has(name)) ?? names[0];
}

function laterNames(keys: string[], book: EvolutionBook, byKey: Map<string, Card[]>, card: Card, profile: Profile): string[] {
  const immediate = linked(keys, book, "next");
  if (!immediate.length) return [];
  const first = preferred(immediate, byKey, card, profile, book);
  return [first, ...walkFirst([first], book, "next")];
}

export function collectedNext(card: Card, byKey: Map<string, Card[]>, profile: Profile, book: EvolutionBook): EvolutionRelative[] {
  const keys = speciesKeys(card.name, book);
  if (!keys.length) return [];
  const nextNames = linked(keys, book, "next");
  if (nextNames.length < 2) return [];
  const found: EvolutionRelative[] = [];
  for (const name of nextNames) {
    const owned = choose(byKey.get(name) ?? [], card, profile, true);
    if (!owned) continue;
    found.push({ name, step: "next", card: owned });
  }
  return found;
}

export function evolutionCards(card: Card, byKey: Map<string, Card[]>, profile: Profile, book: EvolutionBook): EvolutionRelative[] {
  const line = evolutionLine(card, byKey, profile, book);
  const owned = collectedNext(card, byKey, profile, book);
  if (line.length >= 2) {
    const seen = new Set(line.map((relative) => relative.name));
    return [...line, ...owned.filter((relative) => !seen.has(relative.name))];
  }
  return owned;
}

export function evolutionLine(card: Card, byKey: Map<string, Card[]>, profile: Profile, book: EvolutionBook): EvolutionRelative[] {
  const keys = speciesKeys(card.name, book);
  if (!keys.length) return [];
  const earlier = walkFirst(keys, book, "prev");
  const names = [...earlier].reverse().concat(laterNames(keys, book, byKey, card, profile));
  if (names.length < 2) return [];
  const earlierNames = new Set(earlier);
  return names.map((name) => ({
    name,
    step: earlierNames.has(name) ? "prev" : "next",
    card: choose(byKey.get(name) ?? [], card, profile, false),
  }));
}

export function evolutionMove(card: Card, byKey: Map<string, Card[]>, profile: Profile, book: EvolutionBook): EvolutionMove {
  const keys = speciesKeys(card.name, book);
  if (!keys.length) return NO_EVOLUTION;
  const previousNames = linked(keys, book, "prev");
  const nextNames = linked(keys, book, "next");
  if (!previousNames.length && !nextNames.length) return NO_EVOLUTION;
  const previousCards = previousNames.flatMap((name) => byKey.get(name) ?? []);
  const nextCards = nextNames.flatMap((name) => byKey.get(name) ?? []);
  const ownedNext = choose(nextCards, card, profile, true);
  const ownedPrev = choose(previousCards, card, profile, true);
  return {
    previous: choose(previousCards, card, profile, false),
    next: choose(nextCards, card, profile, false),
    shown: ownedNext ?? ownedPrev,
    shownStep: ownedNext ? "next" : ownedPrev ? "prev" : null,
    hasPrev: previousNames.length > 0,
    hasNext: nextNames.length > 0,
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
