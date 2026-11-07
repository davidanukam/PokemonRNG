import { artUrl } from "@/lib/game";
import { matchSprite, type SpriteBook } from "@/lib/sprites";

export function Avatar({
  avatar,
  letter,
  className,
  cardName,
  book,
}: {
  avatar: string;
  letter: string;
  className?: string;
  cardName?: string;
  book?: SpriteBook | null;
}) {
  const size = className ?? "size-10";
  const pixel = avatar.startsWith("pixel:https://") ? avatar.slice("pixel:".length) : "";
  const upload = avatar.startsWith("data:image/") ? avatar : "";
  const cardId = avatar.startsWith("card:") ? Number(avatar.slice(5)) : 0;
  const matched = !pixel && !upload && book && cardName ? matchSprite(cardName, book) : null;
  const src = pixel || upload || (matched && !matched.fallback ? matched.url : "") || (cardId > 0 ? artUrl(cardId, false) : "");
  const contain = Boolean(pixel || (matched && !matched.fallback));
  if (!src) {
    return (
      <span className={`grid place-items-center rounded-full bg-neutral text-sm font-semibold text-neutral-content ${size}`}>
        {letter.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      alt=""
      src={src}
      className={`rounded-full ${contain ? "bg-base-200 object-contain p-0.5" : "object-cover"} ${size}`}
      style={contain ? { imageRendering: "pixelated" } : undefined}
    />
  );
}
