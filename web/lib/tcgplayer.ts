const DETAILS = "https://mp-search-api.tcgplayer.com/v2/product";
const HISTORY = "https://infinite-api.tcgplayer.com/price/history";

export const PRICE_RANGES = ["month", "quarter", "semi-annual", "annual"] as const;
export type PriceRange = (typeof PRICE_RANGES)[number];

export type CardLine = { label: string; text: string };
export type PricePoint = { date: string; price: number };
export type CardFacts = {
  lines: CardLine[];
  history: { label: string; points: PricePoint[] } | null;
};

type HistoryBucket = { marketPrice?: string; bucketStartDate?: string };
type HistorySeries = { variant?: string; condition?: string; buckets?: HistoryBucket[] };

function plain(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function readJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Origin: "https://www.tcgplayer.com",
      Referer: "https://www.tcgplayer.com/",
    },
    next: { revalidate: 60 * 60 },
  });
  if (!response.ok) throw new Error(`TCGPlayer responded ${response.status}`);
  return response.json();
}

function linesFrom(payload: unknown): CardLine[] {
  if (!payload || typeof payload !== "object") return [];
  const formatted = (payload as { formattedAttributes?: unknown }).formattedAttributes;
  if (!formatted || typeof formatted !== "object") return [];
  return Object.entries(formatted)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim() !== "")
    .map(([label, text]) => ({ label, text: plain(text) }));
}

function seriesFrom(payload: unknown): HistorySeries[] {
  if (!payload || typeof payload !== "object") return [];
  const result = (payload as { result?: unknown }).result;
  return Array.isArray(result) ? (result as HistorySeries[]) : [];
}

function pointsOf(series: HistorySeries): PricePoint[] {
  const points = (series.buckets ?? [])
    .map((bucket) => ({
      date: String(bucket.bucketStartDate ?? "").slice(0, 10),
      price: Number(bucket.marketPrice),
    }))
    .filter((point) => point.date && Number.isFinite(point.price) && point.price > 0);
  points.sort((a, b) => a.date.localeCompare(b.date));
  return points;
}

function pickHistory(series: HistorySeries[]): CardFacts["history"] {
  const near = series.filter((item) => item.condition === "Near Mint");
  const pool = near.length ? near : series;
  const chosen = pool.find((item) => /foil/i.test(item.variant ?? "")) ?? pool[0];
  if (!chosen) return null;
  const points = pointsOf(chosen);
  if (!points.length) return null;
  const label = [chosen.condition, chosen.variant].filter(Boolean).join(" ");
  return { label, points };
}

export async function loadCardFacts(id: number, range: PriceRange): Promise<CardFacts> {
  const [details, history] = await Promise.all([
    readJson(`${DETAILS}/${id}/details?mpfev=5429`),
    readJson(`${HISTORY}/${id}/detailed?range=${range}`),
  ]);
  return { lines: linesFrom(details), history: pickHistory(seriesFrom(history)) };
}
