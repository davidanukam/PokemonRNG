"use client";

import { CardFace } from "@/components/card-face";
import { displayCond, evolutionMove, type EvolutionBook, type EvolutionStep } from "@/lib/evolutions";
import type { Card, Catalog, Profile } from "@/lib/types";

export function EvolutionPanel({
  card,
  byKey,
  catalog,
  profile,
  book,
  onOpen,
}: {
  card: Card;
  byKey: Map<string, Card[]>;
  catalog: Catalog;
  profile: Profile;
  book: EvolutionBook;
  onOpen: (card: Card, step: EvolutionStep) => void;
}) {
  const move = evolutionMove(card, byKey, profile, book);
  if (!move) return null;
  return (
    <div className="mt-auto flex flex-col gap-3">
      <div className="evo-cards mx-auto w-40">
        {move.shown && move.shownStep ? (
          <CardFace
            card={move.shown}
            cond={displayCond(profile, move.shown)}
            conditions={catalog.conditions}
            onClick={() => {
              if (move.shown && move.shownStep) onOpen(move.shown, move.shownStep);
            }}
          />
        ) : (
          <div className="grid aspect-[5/7] place-items-center rounded-box border-2 border-dashed border-base-content/40 p-3 text-center text-sm">
            Evolution not collected
          </div>
        )}
      </div>
      {move.previous || move.next ? (
        <div className="flex items-center justify-between gap-2">
          {move.previous ? (
            <button type="button" className="btn btn-success" onClick={() => onOpen(move.previous as Card, "prev")}>
              Prev
            </button>
          ) : (
            <span />
          )}
          {move.next ? (
            <button type="button" className="btn btn-success" onClick={() => onOpen(move.next as Card, "next")}>
              Next
            </button>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </div>
  );
}
