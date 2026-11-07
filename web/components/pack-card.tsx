import { artUrl, packColor } from "@/lib/game";
import type { Card } from "@/lib/types";

export function PackCard({
  code,
  name,
  setIndex,
  art,
  onClick,
}: {
  code: string;
  name: string;
  setIndex: number | null;
  art: Card | undefined;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex h-9 items-center px-3 text-xs font-bold text-white" style={{ background: packColor(setIndex) }}>
        {code}
      </div>
      <figure className="h-44 bg-base-200">
        {art ? (
          <img alt="" src={artUrl(art.id, false)} width={148} height={168} className="h-full w-full object-contain p-2" />
        ) : (
          <span className="block h-full w-full" />
        )}
      </figure>
      <div className="card-body p-3">
        <h2 className="card-title text-base">{name}</h2>
      </div>
    </>
  );
  const className = "card card-border bg-base-100 text-start";
  if (!onClick) return <div className={className}>{body}</div>;
  return (
    <button type="button" className={className} onClick={onClick}>
      {body}
    </button>
  );
}
