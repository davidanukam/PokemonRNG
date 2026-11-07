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
  pin = true,
  placeholder,
}: {
  card: Card;
  byKey: Map<string, Card[]>;
  catalog: Catalog;
  profile: Profile;
  book: EvolutionBook;
  onOpen: (card: Card, step: EvolutionStep) => void;
  pin?: boolean;
  placeholder?: string;
}) {
  const move = evolutionMove(card, byKey, profile, book);
  if (!move) return placeholder ? <p className="text-sm text-base-content/70">{placeholder}</p> : null;
  const both = Boolean(move.previous && move.next);
  return (
    <div className={`${pin ? "mt-auto " : ""}flex flex-col gap-3`}>
      <div className={`evo-cards mx-auto w-full max-w-64 ${both ? "evo-stack" : ""}`}>
        {both ? (
          <>
            <EvoCard card={move.previous} step="prev" catalog={catalog} profile={profile} onOpen={onOpen} />
            <EvoCard card={move.next} step="next" catalog={catalog} profile={profile} onOpen={onOpen} />
          </>
        ) : (
          <EvoCard card={move.shown} step={move.shownStep} catalog={catalog} profile={profile} onOpen={onOpen} />
        )}
      </div>
      {move.previous || move.next ? (
        <div className="flex items-center justify-center gap-2">
          {move.previous ? (
            <button type="button" className="btn btn-success" onClick={() => onOpen(move.previous as Card, "prev")}>
              Prev
            </button>
          ) : null}
          {move.next ? (
            <button type="button" className="btn btn-success" onClick={() => onOpen(move.next as Card, "next")}>
              Next
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EvoCard({
  card,
  step,
  catalog,
  profile,
  onOpen,
}: {
  card: Card | null;
  step: EvolutionStep | null;
  catalog: Catalog;
  profile: Profile;
  onOpen: (card: Card, step: EvolutionStep) => void;
}) {
  if (!card || !step) {
    return (
      <div className="grid aspect-[5/7] place-items-center rounded-box border-2 border-dashed border-base-content/40 p-3 text-center text-sm">
        Evolution not collected
      </div>
    );
  }
  return (
    <CardFace
      card={card}
      cond={displayCond(profile, card)}
      conditions={catalog.conditions}
      onClick={() => onOpen(card, step)}
    />
  );
}
