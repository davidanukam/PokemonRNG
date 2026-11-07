"use client";

import { useEffect, useRef, useState } from "react";
import type { CardFacts, CardLine, PricePoint, PriceRange } from "@/lib/tcgplayer";

const RANGES: { id: PriceRange; label: string }[] = [
  { id: "month", label: "1M" },
  { id: "quarter", label: "3M" },
  { id: "semi-annual", label: "6M" },
  { id: "annual", label: "1Y" },
];

function dollars(price: number): string {
  return price.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function dayLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return `${month}/${day}`;
}

function changeLabel(points: PricePoint[]): string {
  const first = points[0]?.price ?? 0;
  const last = points[points.length - 1]?.price ?? 0;
  if (!first) return "";
  const pct = ((last - first) / first) * 100;
  const sign = pct > 0 ? "+" : "";
  return ` (${sign}${pct.toFixed(1)}%)`;
}

function PriceChart({ points }: { points: PricePoint[] }) {
  const width = 320;
  const height = 168;
  const pad = { left: 52, right: 8, top: 12, bottom: 28 };
  const prices = points.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || Math.max(max * 0.08, 1);
  const low = min - span * 0.08;
  const high = max + span * 0.08;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const coords = points.map((point, index) => {
    const x = pad.left + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
    const y = pad.top + (1 - (point.price - low) / (high - low)) * innerH;
    return { x, y };
  });
  const line = coords.map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`).join(" ");
  const ticks = [high, (high + low) / 2, low];
  const marks = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((index, place, all) => all.indexOf(index) === place);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="text-info w-full" role="img" aria-label="Market price history">
      {ticks.map((tick) => {
        const y = pad.top + (1 - (tick - low) / (high - low)) * innerH;
        return (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="stroke-base-300" strokeWidth="1" />
            <text x={pad.left - 6} y={y + 4} textAnchor="end" className="fill-base-content/70" fontSize="10">
              {dollars(tick)}
            </text>
          </g>
        );
      })}
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {marks.map((index) => (
        <text key={points[index].date} x={coords[index].x} y={height - 8} textAnchor="middle" className="fill-base-content/70" fontSize="10">
          {dayLabel(points[index].date)}
        </text>
      ))}
    </svg>
  );
}

export function CardFactsPanel({ id }: { id: number }) {
  const [range, setRange] = useState<PriceRange>("quarter");
  const [lines, setLines] = useState<CardLine[] | null>(null);
  const [history, setHistory] = useState<CardFacts["history"]>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(true);
  const loaded = useRef(false);

  useEffect(() => {
    setLines(null);
    setHistory(null);
    loaded.current = false;
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    setPending(true);
    setError("");
    fetch(`/api/card/${id}?range=${range}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return (await response.json()) as CardFacts;
      })
      .then((facts) => {
        loaded.current = true;
        setLines(facts.lines);
        setHistory(facts.history);
        setError("");
        setPending(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!loaded.current) setError("Card details are unavailable.");
        setPending(false);
      });
    return () => controller.abort();
  }, [id, range]);

  const latest = history?.points[history.points.length - 1];

  return (
    <aside aria-label="Card details" className="card-facts fixed top-0 left-0 z-20 flex h-dvh w-[min(100%,22rem)] flex-col gap-4 overflow-y-auto bg-base-100 p-6 shadow-xl">
      {error ? <p className="text-sm text-error">{error}</p> : null}
      {lines === null && pending ? <p className="text-sm text-base-content/70">Loading card details.</p> : null}
      {lines && lines.length === 0 && !pending ? <p className="text-sm text-base-content/70">No printed details for this card.</p> : null}
      {lines?.map((line) => (
        <div key={line.label} className="panel-section flex flex-col gap-1 p-3">
          <h3 className="text-sm font-semibold">{line.label}</h3>
          <p className="text-sm whitespace-pre-line">{line.text}</p>
        </div>
      ))}
      <div className="panel-section flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Market Price History</h3>
          <div className="join" role="group" aria-label="Price history range">
            {RANGES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`btn join-item btn-xs ${range === item.id ? "btn-neutral" : "btn-ghost"}`}
                aria-pressed={range === item.id}
                onClick={() => setRange(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {history && latest ? (
          <p className="text-sm">
            {history.label} <span className="text-success">{dollars(latest.price)}</span>
            <span className="text-base-content/70">{changeLabel(history.points)}</span>
          </p>
        ) : null}
        {pending && !history ? <p className="text-sm text-base-content/70">Loading prices.</p> : null}
        {history ? <PriceChart points={history.points} /> : null}
        {!pending && !history && !error ? <p className="text-sm text-base-content/70">No market price history for this card.</p> : null}
        <p className="text-xs text-base-content/70">Market prices from TCGplayer.</p>
      </div>
    </aside>
  );
}
