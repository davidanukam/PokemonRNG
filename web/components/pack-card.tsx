import { artUrl } from "@/lib/game";
import type { Card } from "@/lib/types";

// Transparent window in public/pack-wrap.png, measured from the cropped file.
const WINDOW = { top: "31%", left: 0, width: "100%", height: "57.7%" };

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
    <span className="relative block aspect-[513/938] w-full">
      {art ? (
        <img alt="" src={artUrl(art.id, false)} className="absolute object-cover" style={WINDOW} />
      ) : (
        <span className="absolute bg-base-300" style={{ ...WINDOW, right: 0 }} />
      )}
      <img src="/pack-wrap.png" alt="" className="pointer-events-none absolute inset-0 h-full w-full" />
      <span className="pointer-events-none absolute inset-x-2 flex justify-center" style={{ bottom: "13.5%" }}>
        <span className="max-w-full rounded-box bg-black/75 px-2 py-1 text-center text-white">
          <span className="block text-xs font-semibold tracking-wide">{code}</span>
          <span className="line-clamp-2 text-sm leading-tight font-semibold">{name}</span>
        </span>
      </span>
    </span>
  );
  if (!onClick) return <div className="w-full">{body}</div>;
  return (
    <button type="button" className="block w-full cursor-pointer text-start" onClick={onClick}>
      {body}
    </button>
  );
}
