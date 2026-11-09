"use client";

import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { artUrl } from "@/lib/game";
import type { Pull } from "@/lib/types";

export function MiniRoll({ pull, onClose }: { pull: Pull; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = cardRef.current?.getBoundingClientRect();
    const x = box ? (box.left + box.width / 2) / window.innerWidth : 0.88;
    const y = box ? (box.top + box.height / 2) / window.innerHeight : 0.82;
    const burst = confetti.create(undefined, { resize: true, useWorker: false, disableForReducedMotion: true });
    void burst({ particleCount: 120, spread: 80, startVelocity: 38, origin: { x, y }, scalar: 0.9 });
    return () => burst.reset();
  }, [pull]);

  return (
    <div ref={cardRef} className="fixed right-4 bottom-24 z-50 w-32 lg:bottom-6" role="status" aria-label={pull.card.name}>
      <div className="card card-border bg-base-100 shadow-xl">
        <button type="button" className="btn btn-circle btn-ghost btn-xs absolute top-1 right-1 z-10" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <figure>
          <img alt={pull.card.name} src={artUrl(pull.card.id, false)} width={132} height={185} className="aspect-[5/7] w-full object-cover" />
        </figure>
      </div>
    </div>
  );
}
