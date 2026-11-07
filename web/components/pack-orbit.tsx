"use client";

import { useMemo, useState } from "react";
import { artUrl } from "@/lib/game";
import type { Card } from "@/lib/types";

const CARD_W = 132;

function orbitCards(pool: Card[]): Card[] {
  if (pool.length === 0) return [];
  const unique: Card[] = [];
  const seen = new Set<number>();
  const steps = Math.min(12, pool.length);
  for (let i = 0; i < steps; i++) {
    const card = pool[Math.floor((i * pool.length) / steps)];
    if (!card || seen.has(card.id)) continue;
    seen.add(card.id);
    unique.push(card);
  }
  if (unique.length === 0) unique.push(pool[0]);
  const target = Math.min(12, Math.max(unique.length, 8));
  const ring: Card[] = [];
  for (let i = 0; i < target; i++) ring.push(unique[i % unique.length]);
  return ring;
}

export function PackOrbit({ pool }: { pool: Card[] }) {
  const [flat, setFlat] = useState(false);
  const cards = useMemo(() => orbitCards(pool), [pool]);
  if (cards.length === 0) return null;
  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex justify-end">
        <button type="button" className="btn btn-sm" onClick={() => setFlat((value) => !value)}>
          {flat ? "3D" : "2D"}
        </button>
      </div>
      {flat ? <FlatReel cards={cards} /> : <Orbit cards={cards} />}
    </div>
  );
}

function Orbit({ cards }: { cards: Card[] }) {
  const step = 360 / cards.length;
  const radius = Math.round(CARD_W / 2 / Math.tan(Math.PI / cards.length));
  const height = Math.round(CARD_W * 1.4);
  return (
    <div className="pack-scene relative min-h-56 flex-1">
      <div
        className="pack-spin absolute top-1/2 left-1/2"
        style={{ width: CARD_W, height, marginLeft: -CARD_W / 2, marginTop: -height / 2 }}
      >
        {cards.map((card, index) => (
          <img
            key={`${card.id}-${index}`}
            alt=""
            src={artUrl(card.id, false)}
            draggable={false}
            className="pack-orbit-card absolute inset-0 h-full w-full rounded-box object-cover shadow-lg"
            style={{ transform: `rotateY(${index * step}deg) translateZ(${radius}px)` }}
          />
        ))}
      </div>
    </div>
  );
}

function FlatReel({ cards }: { cards: Card[] }) {
  const loop = cards.length > 1 ? [...cards, ...cards] : cards;
  return (
    <div className="relative min-h-56 flex-1 overflow-hidden">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
        <div className={`flex w-max gap-4 ${cards.length > 1 ? "pack-marquee" : ""}`}>
          {loop.map((card, index) => (
            <img
              key={`${card.id}-${index}`}
              alt=""
              src={artUrl(card.id, false)}
              draggable={false}
              className="pack-orbit-card h-auto w-[132px] shrink-0 rounded-box object-cover shadow-lg"
              style={{ aspectRatio: "5 / 7" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
