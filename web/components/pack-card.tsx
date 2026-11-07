import { artUrl } from "@/lib/game";
import type { Card } from "@/lib/types";

export function PackCard({
  code,
  name,
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
      <div className="flex h-8 items-center bg-neutral px-4 text-xs font-semibold text-neutral-content">
        {code}
      </div>
      <figure className="h-48 bg-base-200">
        {art ? (
          <img alt="" src={artUrl(art.id, false)} width={148} height={168} className="h-full w-full object-contain p-2" />
        ) : (
          <span className="block h-full w-full" />
        )}
      </figure>
      <div className="card-body p-4">
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
