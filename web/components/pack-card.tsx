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
      <figure className="h-64 bg-base-200">
        {art ? (
          <img alt="" src={artUrl(art.id, false)} width={200} height={280} className="h-full w-full object-contain p-4" />
        ) : (
          <span className="block h-full w-full" />
        )}
      </figure>
      <div className="absolute inset-x-0 bottom-0 translate-y-full bg-neutral px-4 py-2 text-neutral-content transition duration-200 group-hover:translate-y-0">
        <div className="text-xs font-semibold">{code}</div>
        <div className="text-sm">{name}</div>
      </div>
    </>
  );
  const className = "group card card-border relative overflow-hidden! bg-base-100 text-start";
  if (!onClick) return <div className={className}>{body}</div>;
  return (
    <button type="button" className={className} onClick={onClick}>
      {body}
    </button>
  );
}
