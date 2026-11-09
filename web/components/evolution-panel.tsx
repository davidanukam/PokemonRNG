"use client";

import { CardFace } from "@/components/card-face";
import { displayCond, evolutionCards, evolutionMove, type EvolutionBook, type EvolutionRelative, type EvolutionStep } from "@/lib/evolutions";
import type { Card, Catalog, Profile } from "@/lib/types";

export function EvolutionPanel({
  card,
  byKey,
  catalog,
  profile,
  book,
  onOpen,
  pin = true,
  fan = false,
}: {
  card: Card;
  byKey: Map<string, Card[]>;
  catalog: Catalog;
  profile: Profile;
  book: EvolutionBook;
  onOpen: (card: Card, step: EvolutionStep) => void;
  pin?: boolean;
  fan?: boolean;
}) {
  const shown = evolutionCards(card, byKey, profile, book);
  const move = evolutionMove(card, byKey, profile, book);
  const many = shown.length >= 3;
  const stacked = shown.length === 2;
  const standsAlone = !shown.length && !move.hasPrev && !move.hasNext;
  return (
    <div className={`${pin ? "mt-auto " : ""}flex flex-col gap-3`}>
      {many ? (
        <div className={`grid w-full grid-cols-2 gap-3 overflow-y-auto ${fan ? "max-h-96" : ""}`}>
          {shown.map((relative) => (
            <RelativeCard key={relativeKey(relative)} relative={relative} catalog={catalog} profile={profile} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <div className={`evo-cards mx-auto w-full max-w-64 ${stacked ? "evo-stack" : ""} ${fan && stacked ? "evo-fan" : ""}`}>
          {standsAlone ? (
            <EmptyEvo text="This card does not evolve" />
          ) : stacked ? (
            shown.map((relative) => (
              <RelativeCard key={relativeKey(relative)} relative={relative} catalog={catalog} profile={profile} onOpen={onOpen} />
            ))
          ) : shown.length === 1 ? (
            <RelativeCard relative={shown[0]} catalog={catalog} profile={profile} onOpen={onOpen} />
          ) : (
            <EvoCard card={move.shown} step={move.shownStep} empty={singleEmpty(move)} catalog={catalog} profile={profile} onOpen={onOpen} />
          )}
        </div>
      )}
    </div>
  );
}

function relativeKey(relative: EvolutionRelative): string {
  return `${relative.name}-${relative.card?.id ?? "missing"}`;
}

function RelativeCard({
  relative,
  catalog,
  profile,
  onOpen,
}: {
  relative: EvolutionRelative;
  catalog: Catalog;
  profile: Profile;
  onOpen: (card: Card, step: EvolutionStep) => void;
}) {
  return (
    <EvoCard
      card={relative.card}
      step={relative.step}
      empty={relative.step === "prev" ? "Previous evolution not collected" : "Next evolution not collected"}
      catalog={catalog}
      profile={profile}
      onOpen={onOpen}
    />
  );
}

export function EvolutionSteps({
  card,
  byKey,
  profile,
  book,
  onOpen,
}: {
  card: Card;
  byKey: Map<string, Card[]>;
  profile: Profile;
  book: EvolutionBook;
  onOpen: (card: Card, step: EvolutionStep) => void;
}) {
  const move = evolutionMove(card, byKey, profile, book);
  return (
    <>
      {move.previous ? (
        <button type="button" className="btn btn-success btn-sm absolute top-1/2 right-full z-30 mr-2 -translate-y-1/2 sm:btn-md sm:mr-4" onClick={() => onOpen(move.previous as Card, "prev")}>
          Prev
        </button>
      ) : null}
      {move.next ? (
        <button type="button" className="btn btn-success btn-sm absolute top-1/2 left-full z-30 ml-2 -translate-y-1/2 sm:btn-md sm:ml-4" onClick={() => onOpen(move.next as Card, "next")}>
          Next
        </button>
      ) : null}
    </>
  );
}

function singleEmpty(move: { hasPrev: boolean; hasNext: boolean; previous: Card | null; next: Card | null }): string {
  if (move.hasNext && !move.hasPrev) return "Next evolution not collected";
  if (move.hasPrev && !move.hasNext) return "Previous evolution not collected";
  if (!move.next) return "Next evolution not collected";
  if (!move.previous) return "Previous evolution not collected";
  return "Next evolution not collected";
}

function EmptyEvo({ text }: { text: string }) {
  return <div className="grid aspect-[5/7] place-items-center rounded-box border-2 border-dashed border-base-content/40 p-3 text-center text-sm">{text}</div>;
}

function EvoCard({
  card,
  step,
  empty,
  catalog,
  profile,
  onOpen,
}: {
  card: Card | null;
  step: EvolutionStep | null;
  empty: string;
  catalog: Catalog;
  profile: Profile;
  onOpen: (card: Card, step: EvolutionStep) => void;
}) {
  if (!card || !step) {
    return <EmptyEvo text={empty} />;
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
