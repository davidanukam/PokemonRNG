import type { Card, Catalog, Pull } from "./types";

export const WEIGHTS = [500000, 250000, 150000, 80000, 18000, 1900, 100];
const WEIGHT_TOTAL = WEIGHTS.reduce((sum, weight) => sum + weight, 0);
const COND_WEIGHTS = [62, 22, 10, 4, 2];
const COND_FACTOR = [1, 0.75, 0.5, 0.28, 0.12];
const FALLBACK_CENTS = [25, 50, 150, 400, 2000, 8000, 25000];
export const COND_DROP = [0, 0, 0, 1, 2];

type RawCatalog = {
  tiers: string[];
  conditions: string[];
  rarities: string[];
  sets: [string, string][];
  featured: string[];
  cards: Array<[number, string, number, string, number, number, Array<number | null>]>;
};

export function hydrateCatalog(raw: RawCatalog): Catalog {
  return {
    tiers: raw.tiers,
    conditions: raw.conditions,
    rarities: raw.rarities,
    sets: raw.sets,
    featured: raw.featured,
    cards: raw.cards.map((row) => ({
      id: row[0],
      name: row[1],
      set: row[2],
      number: row[3],
      tier: row[4],
      rarity: row[5],
      prices: row[6],
    })),
  };
}

export function indexCards(cards: Card[]) {
  const byId = new Map<number, Card>();
  const bySet = new Map<number, Card[]>();
  for (const card of cards) {
    byId.set(card.id, card);
    const bucket = bySet.get(card.set);
    if (bucket) bucket.push(card);
    else bySet.set(card.set, [card]);
  }
  return { byId, bySet };
}

export function weighted(weights: number[]): number {
  let total = 0;
  for (const weight of weights) total += weight;
  let roll = Math.random() * total;
  for (let index = 0; index < weights.length; index += 1) {
    roll -= weights[index];
    if (roll < 0) return index;
  }
  return weights.length - 1;
}

export function valueOf(card: Card, cond: number): number {
  const listed = card.prices[cond];
  if (listed != null) return listed;
  const basis = card.prices[0] != null ? card.prices[0] : (FALLBACK_CENTS[card.tier] ?? 25);
  return Math.max(1, Math.round(basis * (COND_FACTOR[cond] ?? 1)));
}

export function copiesOf(owned: Record<string, number[]>, id: number): number {
  const row = owned[String(id)];
  if (!row) return 0;
  let total = 0;
  for (const count of row) total += count;
  return total;
}

export function rollOne(pool: Card[], owned: Record<string, number[]>): Pull {
  const buckets: Card[][] = [[], [], [], [], [], [], []];
  for (const card of pool) buckets[Math.min(card.tier, 6)].push(card);
  let tier = weighted(WEIGHTS);
  while (tier > 0 && buckets[tier].length === 0) tier -= 1;
  if (buckets[tier].length === 0) {
    tier = buckets.findIndex((bucket) => bucket.length > 0);
  }
  const choices = buckets[tier];
  const card = choices[Math.floor(Math.random() * choices.length)];
  return {
    card,
    cond: weighted(COND_WEIGHTS),
    fresh: copiesOf(owned, card.id) === 0,
  };
}

export function artUrl(id: number, large: boolean): string {
  const size = large ? "1000x1000" : "200x200";
  return `https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_${size}.jpg`;
}

export function money(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function oneIn(tier: number): number {
  return Math.max(2, Math.round(WEIGHT_TOTAL / (WEIGHTS[tier] || 1)));
}

export function effectiveTier(tier: number, cond: number): number {
  return Math.max(0, tier - (COND_DROP[cond] ?? 0));
}

const PACK_COLORS = ["#d4534e", "#1aa3b5", "#5b6fe0", "#e09a12", "#7a5bb5", "#2f9d6a"];

export function packColor(setIndex: number | null): string {
  if (setIndex == null) return "#1d3a46";
  return PACK_COLORS[setIndex % PACK_COLORS.length];
}

export type SpeciesIndex = {
  exact: Set<string>;
  ordered: string[];
};

const TAIL_RE = /(?:\s+(?:vmax|vstar|v-union|gx|ex|break|lv\.?\s*x|prime|legend|fb|gl|star|delta|δ))+$/i;
const LETTER_RE = /\s+[a-z0-9]$/i;
const ENERGY_RE = /\b[Ee]nergy(?:\s+[Pp]rism\s+[Ss]tar|\s+[A-Z]{2,4})?$/;
const ENERGY_TRAINER_RE = /\b(retrieval|search|removal|switch|recycler|pickup|transfer|return|capsule|restore)\b/;

export function speciesIndex(names: Iterable<string>): SpeciesIndex {
  const exact = new Set<string>();
  for (const name of names) {
    const folded = foldName(name);
    if (folded) exact.add(folded);
  }
  exact.add("nidoran f");
  exact.add("nidoran m");
  return { exact, ordered: [...exact].sort((a, b) => b.length - a.length) };
}

export function isRollable(name: string, species: SpeciesIndex): boolean {
  const raw = headOf(name);
  const text = coreName(raw);
  if (text.includes("fossil") || text.endsWith(" doll") || text.endsWith(" spirit link")) return false;
  const parts = text.split(" & ").map((part) => part.trim());
  if (parts.some((part) => isSpecies(part, species)) || isSpecies(text, species)) return true;
  const head = foldName(raw);
  return ENERGY_RE.test(raw) && !ENERGY_TRAINER_RE.test(head);
}

function stripParens(text: string): string {
  return text.replace(/\s*[(\[][^)\]]*[)\]]/g, "");
}

function foldName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/♀/g, " f")
    .replace(/♂/g, " m")
    .trim();
}

function headOf(name: string): string {
  const stripped = stripParens(name).trim();
  const titled = stripped.split(/\s+-/)[0]?.trim() ?? stripped;
  return titled.replace(/\s+\d+\s*\/\s*\d+.*$/, "").trim();
}

function coreName(name: string): string {
  let text = stripParens(foldName(name)).trim();
  let previous = "";
  while (text !== previous) {
    previous = text;
    text = text.replace(TAIL_RE, "").trim();
  }
  return text;
}

function isSpecies(text: string, species: SpeciesIndex): boolean {
  if (matchesSpecies(text, species)) return true;
  const shorter = text.replace(LETTER_RE, "").trim();
  return shorter !== text && matchesSpecies(shorter, species);
}

function matchesSpecies(text: string, species: SpeciesIndex): boolean {
  if (species.exact.has(text)) return true;
  for (const name of species.ordered) {
    if (text.endsWith(` ${name}`) || text.startsWith(`${name} `)) return true;
  }
  return false;
}
