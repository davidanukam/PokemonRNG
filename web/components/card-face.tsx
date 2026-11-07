"use client";

import { useEffect, useState } from "react";
import { artUrl, money, valueOf } from "@/lib/game";
import { condColor } from "@/lib/look";
import type { Card } from "@/lib/types";

type FaceProps = {
  card: Card;
  cond: number;
  conditions: string[];
  large?: boolean;
  fresh?: boolean;
  count?: number;
  hideTag?: boolean;
  onClick?: () => void;
};

const ZONES = (
  <>
    <div />
    <div />
    <div />
    <div />
    <div />
    <div />
    <div />
    <div />
  </>
);

export function CardFace({ card, cond, conditions, large, fresh, count, hideTag, onClick }: FaceProps) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [card.id, large]);
  const layers = count && count > 2 ? 3 : count === 2 ? 2 : 1;
  const peek = (layers - 1) * 16;
  const figure = (
    <figure className="relative">
      <div className="relative overflow-hidden rounded-box bg-base-200">
        {broken ? (
          <MissingArt large={large} />
        ) : (
        <img
          alt={card.name}
          src={artUrl(card.id, Boolean(large))}
          width={large ? 420 : 160}
          height={large ? 588 : 224}
          onError={() => setBroken(true)}
          className={
            large
              ? "h-[min(42dvh,480px)] w-auto max-w-[calc(100vw-2rem)] rounded-box object-contain md:h-[min(70dvh,680px)] md:max-w-[min(50dvh,486px)]"
              : "aspect-[5/7] w-full rounded-box object-cover"
          }
        />
        )}
        {fresh ? <span className="badge badge-sm absolute top-2 left-2">New</span> : null}
        {hideTag ? null : (
          <span className="price-strip pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-full justify-between gap-2 rounded-b-box bg-black/80 px-2 py-2 text-xs text-white opacity-0 transition duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            <span className="condition-name" style={{ color: condColor(cond) }}>
              {conditions[cond]}
            </span>
            <span>{money(valueOf(card, cond))}</span>
          </span>
        )}
      </div>
    </figure>
  );

  const tilt = onClick ? (
    <a
      href={`#card-${card.id}`}
      className={`hover-3d block ${large ? "w-auto" : "w-full"}`}
      onClick={(event) => {
        event.preventDefault();
        onClick();
      }}
    >
      {figure}
      {ZONES}
    </a>
  ) : (
    <div className={`hover-3d ${large ? "w-auto" : "w-full"}`}>
      {figure}
      {ZONES}
    </div>
  );

  return (
    <div className={`group relative ${large ? "mx-auto w-fit" : "w-full"}`} style={peek ? { paddingTop: peek } : undefined}>
      {layers > 2 ? <Back card={card} top={0} peek={peek} /> : null}
      {layers > 1 ? <Back card={card} top={layers > 2 ? 16 : 0} peek={peek} /> : null}
      <div className="relative z-10">{tilt}</div>
    </div>
  );
}

function MissingArt({ large }: { large?: boolean }) {
  return (
    <div
      role="img"
      aria-label="Image coming soon"
      className={
        large
          ? "grid h-[min(42dvh,480px)] w-[min(30dvh,343px)] place-items-center overflow-hidden rounded-box md:h-[min(70dvh,680px)] md:w-[min(50dvh,486px)]"
          : "grid aspect-[5/7] w-full place-items-center overflow-hidden rounded-box"
      }
      style={{ background: "repeating-linear-gradient(-45deg, #161616 0 12px, #e2b340 12px 24px)" }}
    >
      <span className="-rotate-45 bg-black/75 px-3 py-1 text-center text-xs font-semibold tracking-wide text-white sm:text-sm">
        Image Coming Soon
      </span>
    </div>
  );
}

function Back({ card, top, peek }: { card: Card; top: number; peek: number }) {
  return (
    <img
      alt=""
      src={artUrl(card.id, false)}
      className="pointer-events-none absolute inset-x-0 rounded-box border border-base-300 object-cover object-top"
      style={{ top, height: `calc(100% - ${peek}px)` }}
    />
  );
}
