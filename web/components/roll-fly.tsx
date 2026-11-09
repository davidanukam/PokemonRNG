"use client";

import type { CSSProperties } from "react";
import { artUrl } from "@/lib/game";
import type { Card } from "@/lib/types";

export const ROLL_MS = 3200;
export const REEL_WINNER = 14;
const CARD_W = 132;
const CARD_H = 185;
const GAP = 16;

export function reelOf(pool: Card[], winner: Card): Card[] {
  const reel: Card[] = [];
  for (let index = 0; index < 20; index += 1) {
    reel.push(pool[Math.floor(Math.random() * pool.length)] ?? winner);
  }
  reel[REEL_WINNER] = winner;
  return reel;
}

export function reelShift(vertical: boolean): string {
  const stride = (vertical ? CARD_H : CARD_W) + GAP;
  const size = vertical ? CARD_H : CARD_W;
  const view = vertical ? window.innerHeight : window.innerWidth;
  const winnerCenter = REEL_WINNER * stride + size / 2;
  return `${view / 2 - winnerCenter}px`;
}

export function RollFly({
  cards,
  vertical,
  shift,
  onDone,
}: {
  cards: Card[];
  vertical: boolean;
  shift: string;
  onDone: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60">
      <div
        className={vertical ? "roll-fly-y" : "roll-fly-x"}
        style={{ "--roll-end": shift } as CSSProperties}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) onDone();
        }}
      >
        {cards.map((card, index) => (
          <img
            key={`${card.id}-${index}`}
            alt=""
            src={artUrl(card.id, false)}
            draggable={false}
            width={CARD_W}
            height={CARD_H}
            className="shrink-0 rounded-box object-cover shadow-lg"
            style={{ width: CARD_W, height: CARD_H }}
          />
        ))}
      </div>
      {vertical ? (
        <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 h-1 w-44 -translate-x-1/2 -translate-y-1/2" aria-hidden>
          <span className="absolute top-1/2 right-full size-0 -translate-y-1/2 border-y-8 border-l-[12px] border-y-transparent border-l-warning" />
          <span className="block h-full w-full bg-warning shadow-[0_0_12px_var(--color-warning)]" />
        </div>
      ) : (
        <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 h-56 w-1 -translate-x-1/2 -translate-y-1/2" aria-hidden>
          <span className="absolute bottom-full left-1/2 size-0 -translate-x-1/2 border-x-8 border-t-[12px] border-x-transparent border-t-warning" />
          <span className="block h-full w-full bg-warning shadow-[0_0_12px_var(--color-warning)]" />
        </div>
      )}
    </div>
  );
}
