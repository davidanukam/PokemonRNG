export type Card = {
  id: number;
  name: string;
  set: number;
  number: string;
  tier: number;
  rarity: number;
  prices: Array<number | null>;
};

export type Catalog = {
  tiers: string[];
  conditions: string[];
  rarities: string[];
  sets: [string, string][];
  featured: string[];
  cards: Card[];
};

export type Pull = {
  card: Card;
  cond: number;
  fresh: boolean;
};

export type Profile = {
  name: string;
  owned: Record<string, number[]>;
  opened: number;
  xp: number;
};

export type Screen = "packs" | "open" | "reveal" | "collection" | "dex" | "trade" | "profile";
