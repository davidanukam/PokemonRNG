import { artUrl, money, valueOf } from "@/lib/game";
import type { Card } from "@/lib/types";

type FaceProps = {
  card: Card;
  cond: number;
  conditions: string[];
  large?: boolean;
  fresh?: boolean;
  count?: number;
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

export function CardFace({ card, cond, conditions, large, fresh, count, onClick }: FaceProps) {
  const figure = (
    <figure className="relative overflow-hidden rounded-box bg-base-200">
      <img
        alt={card.name}
        src={artUrl(card.id, Boolean(large))}
        width={large ? 300 : 160}
        height={large ? 420 : 224}
        className="aspect-[5/7] w-full object-cover"
      />
      {fresh ? <span className="badge badge-sm absolute top-2 left-2">New</span> : null}
      <span className="absolute inset-x-0 bottom-0 flex justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent px-2 pt-6 pb-2 text-xs text-white">
        <span>{conditions[cond]}</span>
        <span>{money(valueOf(card, cond))}</span>
      </span>
    </figure>
  );

  const tilt = onClick ? (
    <a
      href={`#card-${card.id}`}
      className="hover-3d block"
      onClick={(event) => {
        event.preventDefault();
        onClick();
      }}
    >
      {figure}
      {ZONES}
    </a>
  ) : (
    <div className="hover-3d">{figure}{ZONES}</div>
  );

  if (count && count > 1) {
    return (
      <div className="indicator cv-auto w-full">
        <span className="indicator-item badge badge-sm">×{count}</span>
        {tilt}
      </div>
    );
  }

  return <div className="cv-auto w-full">{tilt}</div>;
}
