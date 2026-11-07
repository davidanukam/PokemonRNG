export type SpriteBook = {
  ditto: string;
  names: string[];
  byName: Record<string, string>;
};

export function readSpriteBook(raw: { ditto?: string; sprites?: Record<string, string> } | null): SpriteBook | null {
  if (!raw || !raw.sprites || !raw.ditto) return null;
  const byName: Record<string, string> = {};
  for (const [name, url] of Object.entries(raw.sprites)) {
    if (name && typeof url === "string" && url.startsWith("https://")) byName[name] = url;
  }
  const names = Object.keys(byName).sort((a, b) => b.length - a.length);
  return { ditto: raw.ditto, names, byName };
}

export function matchSprite(cardName: string, book: SpriteBook): { url: string; fallback: boolean } {
  const candidates = [cardName, cardName.replace(/ F$/, "♀"), cardName.replace(/ M$/, "♂")];
  for (const name of candidates) {
    const exact = book.byName[name];
    if (exact) return { url: exact, fallback: false };
  }
  for (const candidate of candidates) {
    const padded = ` ${candidate.toLowerCase()} `;
    for (const name of book.names) {
      if (padded.includes(` ${name.toLowerCase()} `)) return { url: book.byName[name], fallback: false };
    }
  }
  return { url: book.ditto, fallback: true };
}
