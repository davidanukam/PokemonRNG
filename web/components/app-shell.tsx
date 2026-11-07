"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { CardFace } from "@/components/card-face";
import { CardFactsPanel } from "@/components/card-facts";
import { EvolutionPanel } from "@/components/evolution-panel";
import { Icon } from "@/components/icons";
import { PackCard } from "@/components/pack-card";
import { PackOrbit } from "@/components/pack-orbit";
import { ProfileAuth } from "@/components/profile-auth";
import { imageFileToAvatar } from "@/lib/avatar";
import {
  artUrl,
  copiesOf,
  effectiveTier,
  hydrateCatalog,
  indexCards,
  money,
  oneIn,
  rollOne,
  valueOf,
} from "@/lib/game";
import { indexEvolutions, readEvolutionBook, type EvolutionBook, type EvolutionStep } from "@/lib/evolutions";
import { condColor, tierColor, xpColor } from "@/lib/look";
import { matchSprite, readSpriteBook, type SpriteBook } from "@/lib/sprites";
import { authClient } from "@/lib/auth/client";
import { pushProfile, syncProfile } from "@/lib/cloud";
import { blankProfile, readProfile, writeProfile } from "@/lib/storage";
import type { Card, Catalog, Profile, Pull, Screen } from "@/lib/types";

const DRAWER_ID = "pokerng-drawer";
const SCREENS: Screen[] = ["packs", "open", "reveal", "collection", "dex", "trade", "profile"];

function readScreen(): Screen {
  if (typeof window === "undefined") return "packs";
  const value = sessionStorage.getItem("pokerng-screen");
  if (value === "reveal") return "open";
  if (SCREENS.includes(value as Screen)) return value as Screen;
  return "packs";
}

function readSet(): number | null {
  if (typeof window === "undefined") return null;
  const value = sessionStorage.getItem("pokerng-set");
  if (value == null || value === "" || value === "all") return null;
  const index = Number(value);
  return Number.isFinite(index) ? index : null;
}

function readPackPick(): string {
  if (typeof window === "undefined") return "all";
  const value = sessionStorage.getItem("pokerng-pack-pick");
  return value == null || value === "" ? "all" : value;
}

function readCollectionSet(): string {
  if (typeof window === "undefined") return "";
  const value = sessionStorage.getItem("pokerng-collection-set");
  return value == null ? "" : value;
}

const NAV: { id: Screen; label: string; icon: "packs" | "collection" | "dex" | "trade" | "profile" }[] = [
  { id: "packs", label: "Packs", icon: "packs" },
  { id: "collection", label: "Collection", icon: "collection" },
  { id: "dex", label: "Dex", icon: "dex" },
  { id: "trade", label: "Trade", icon: "trade" },
  { id: "profile", label: "Profile", icon: "profile" },
];

export function AppShell() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<Profile>(blankProfile);
  const [screen, setScreen] = useState<Screen>(readScreen);
  const [setIndex, setSetIndex] = useState<number | null>(readSet);
  const [pulls, setPulls] = useState<Pull[]>([]);
  const [picked, setPicked] = useState<{ card: Card; cond: number } | null>(null);
  const [glide, setGlide] = useState("");
  const [evolutions, setEvolutions] = useState<EvolutionBook | null>(null);
  const glideTimer = useRef<number | null>(null);
  const [sprites, setSprites] = useState<SpriteBook | null>(null);
  const [collectionSet, setCollectionSet] = useState(readCollectionSet);
  const [packPick, setPackPick] = useState(readPackPick);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const saveGen = useRef(0);
  const accountRef = useRef("");
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const accountId = session?.user?.id ?? "";
  accountRef.current = accountId;

  useEffect(() => {
    setProfile(readProfile());
  }, []);

  useEffect(() => {
    if (sessionPending || !accountId) return;
    const local = readProfile();
    const generation = saveGen.current;
    let cancel = false;
    void syncProfile(local, () => !cancel && saveGen.current === generation).then((next) => {
      if (cancel || !next || saveGen.current !== generation) return;
      setProfile(next);
      writeProfile(next);
    });
    return () => {
      cancel = true;
    };
  }, [sessionPending, accountId]);

  useEffect(() => {
    let cancel = false;
    const box = document.getElementById(DRAWER_ID) as HTMLInputElement | null;
    const desktop = window.matchMedia("(min-width: 1024px)");
    function applySidebar() {
      if (!box) return;
      box.checked = desktop.matches && localStorage.getItem("pokerng-sidebar") !== "0";
    }
    applySidebar();
    desktop.addEventListener("change", applySidebar);
    fetch("/data/sprites.json")
      .then((response) => (response.ok ? response.json() : null))
      .then((raw) => {
        if (!cancel) setSprites(readSpriteBook(raw));
      })
      .catch(() => {
        if (!cancel) setSprites(null);
      });
    fetch("/data/evolutions.json")
      .then((response) => (response.ok ? response.json() : null))
      .then((raw) => {
        if (!cancel) setEvolutions(readEvolutionBook(raw));
      })
      .catch(() => {
        if (!cancel) setEvolutions(null);
      });
    fetch("/data/catalog.json")
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((raw) => {
        if (!cancel) setCatalog(hydrateCatalog(raw));
      })
      .catch(() => {
        if (!cancel) setError("The card pool is missing. From the project folder, run python main.py catalog.");
      });
    return () => {
      cancel = true;
      desktop.removeEventListener("change", applySidebar);
    };
  }, []);

  useEffect(() => {
    sessionStorage.setItem("pokerng-screen", screen);
    sessionStorage.setItem("pokerng-set", setIndex == null ? "all" : String(setIndex));
    sessionStorage.setItem("pokerng-pack-pick", packPick);
    sessionStorage.setItem("pokerng-collection-set", collectionSet);
  }, [screen, setIndex, packPick, collectionSet]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (picked && !dialog.open) dialog.showModal();
    if (!picked && dialog.open) dialog.close();
  }, [picked]);

  const indexes = useMemo(
    () => (catalog ? indexCards(catalog.cards) : { byId: new Map<number, Card>(), bySet: new Map<number, Card[]>() }),
    [catalog],
  );
  const evolutionIndex = useMemo(
    () => (catalog && evolutions ? indexEvolutions(catalog.cards, evolutions) : new Map<string, Card[]>()),
    [catalog, evolutions],
  );

  function save(next: Profile) {
    saveGen.current += 1;
    setProfile(next);
    writeProfile(next);
    if (accountRef.current) pushProfile(next);
  }

  function showRelative(card: Card, step: EvolutionStep) {
    if (glide.startsWith("card-glide-out")) return;
    const next = { card, cond: bestCondOf(profile, card) };
    if (glideTimer.current != null) window.clearTimeout(glideTimer.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setGlide("");
      setPicked(next);
      return;
    }
    setGlide(step === "next" ? "card-glide-out-left" : "card-glide-out-right");
    glideTimer.current = window.setTimeout(() => {
      setPicked(next);
      setGlide(step === "next" ? "card-glide-in-right" : "card-glide-in-left");
      glideTimer.current = window.setTimeout(() => {
        setGlide("");
        glideTimer.current = null;
      }, 240);
    }, 240);
  }

  function go(next: Screen) {
    setScreen(next);
    setPicked(null);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      const box = document.getElementById(DRAWER_ID) as HTMLInputElement | null;
      if (box) box.checked = false;
    }
  }

  function pool(): Card[] {
    if (!catalog) return [];
    if (setIndex == null) return catalog.cards;
    return indexes.bySet.get(setIndex) ?? [];
  }

  function openPacks(count: number) {
    const source = pool();
    if (!source.length) return;
    const owned = { ...profile.owned };
    const nextPulls: Pull[] = [];
    let xp = profile.xp;
    let opened = profile.opened;
    for (let index = 0; index < count; index += 1) {
      const pull = rollOne(source, owned);
      const key = String(pull.card.id);
      const row = owned[key] ? owned[key].slice() : [0, 0, 0, 0, 0];
      row[pull.cond] += 1;
      owned[key] = row;
      xp += pull.fresh ? 12 : 1;
      opened += 1;
      nextPulls.push(pull);
    }
    const recent = [...nextPulls.map((pull) => pull.card.id), ...(profile.recent ?? [])].slice(0, 8);
    save({ ...profile, owned, xp, opened, recent });
    setPulls(nextPulls);
    setScreen("reveal");
  }

  function rememberSidebar(checked: boolean) {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      localStorage.setItem("pokerng-sidebar", checked ? "1" : "0");
    }
  }

  const level = levelOf(profile.xp);
  const xpPct = Math.round((level.into / 80) * 100);
  const bestPull = pulls.reduce((best, pull) => Math.max(best, pull.card.tier), 0);

  return (
    <div className="drawer lg:drawer-open">
      <input
        id={DRAWER_ID}
        type="checkbox"
        className="drawer-toggle"
        onChange={(event) => rememberSidebar(event.target.checked)}
      />
      <div className="drawer-content min-h-dvh bg-base-200">
        <div className="navbar sticky top-0 z-20 border-b border-base-300 bg-base-100">
          <div className="navbar-start gap-4">
            <label htmlFor={DRAWER_ID} aria-label="Open menu" className="btn btn-ghost btn-square drawer-button lg:hidden">
              <Icon name="menu" />
            </label>
            <button type="button" className="btn btn-ghost btn-circle size-auto p-0" aria-label="Profile" onClick={() => go("profile")}>
              <div
                className="radial-progress"
                style={{ "--value": xpPct, "--size": "3.25rem", "--thickness": "4px", color: xpColor(xpPct) } as React.CSSProperties}
                role="progressbar"
                aria-valuenow={xpPct}
                aria-label={`Level ${level.level}`}
              >
                <Avatar
                  avatar={profile.avatar}
                  letter={profile.name}
                  className="size-10"
                  cardName={avatarCardName(profile.avatar, indexes.byId)}
                  book={sprites}
                />
                <span className="sr-only">{xpPct}</span>
              </div>
            </button>
            <div className="min-w-0 text-start">
              <div className="font-semibold">{profile.name}</div>
              <div className="text-sm whitespace-nowrap text-base-content/70">
                Level {level.level}
                <span className="ms-2">{level.into} / 80 xp</span>
              </div>
            </div>
          </div>
          <div className="navbar-end pe-6">
            <div className="stats hidden border border-base-300 bg-base-100 md:inline-grid">
              <div className="stat px-4 py-2">
                <div className="stat-title">Unique</div>
                <div className="stat-value text-lg">{uniqueCount(profile, indexes.byId).toLocaleString()}</div>
              </div>
              <div className="stat px-4 py-2">
                <div className="stat-title">Copies</div>
                <div className="stat-value text-lg">{profile.opened.toLocaleString()}</div>
              </div>
              <div className="stat px-4 py-2">
                <div className="stat-title">Value</div>
                <div className="stat-value text-lg">{money(collectionWorth(profile, indexes.byId))}</div>
              </div>
            </div>
          </div>
        </div>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        {error ? (
          <div role="alert" className="alert mb-4">
            {error}
          </div>
        ) : null}
        {!catalog && !error ? <p className="text-base-content/70">Getting the cards.</p> : null}

        {catalog && screen === "packs" ? (
          <Packs
            catalog={catalog}
            bySet={indexes.bySet}
            packPick={packPick}
            onPackPick={setPackPick}
            onOpen={(index) => {
              setSetIndex(index);
              setScreen("open");
            }}
          />
        ) : null}
        {catalog && screen === "open" ? (
          <Opener
            catalog={catalog}
            setIndex={setIndex}
            pool={pool()}
            onBack={() => setScreen("packs")}
            onStep={(delta) => {
              const count = catalog.sets.length;
              if (count === 0) return;
              const index = setIndex == null ? (delta > 0 ? -1 : 0) : setIndex;
              setSetIndex(((index + delta) % count + count) % count);
            }}
            onRoll={openPacks}
          />
        ) : null}
        {catalog && screen === "reveal" ? (
          <Reveal
            catalog={catalog}
            pulls={pulls}
            best={bestPull}
            onAgain={() => setScreen("open")}
            onCollection={() => go("collection")}
            onCard={(card, cond) => setPicked({ card, cond })}
          />
        ) : null}
        {catalog && screen === "collection" ? (
          <Collection
            catalog={catalog}
            profile={profile}
            byId={indexes.byId}
            setFilter={collectionSet}
            onSetFilter={setCollectionSet}
            onCard={(card, cond) => setPicked({ card, cond })}
          />
        ) : null}
        {catalog && screen === "dex" ? (
          <Dex
            catalog={catalog}
            profile={profile}
            bySet={indexes.bySet}
            onCard={(card) => setPicked({ card, cond: bestCondOf(profile, card) })}
          />
        ) : null}
        {screen === "trade" ? <Trade /> : null}
        {screen === "profile" ? (
          <ProfilePage
            profile={profile}
            byId={indexes.byId}
            book={sprites}
            recent={(profile.recent ?? []).map((id) => indexes.byId.get(id)).filter((card): card is Card => Boolean(card))}
            level={level}
            xpPct={xpPct}
            onSave={save}
            onPacks={() => go("packs")}
            onCard={(card) => setPicked({ card, cond: bestCondOf(profile, card) })}
          />
        ) : null}
        </main>
      </div>
      <div className="drawer-side is-drawer-close:overflow-visible">
        <label htmlFor={DRAWER_ID} aria-label="Close menu" className="drawer-overlay" />
        <div className="flex min-h-full flex-col bg-base-200 is-drawer-close:w-20 is-drawer-open:w-72">
          <div className="flex items-center gap-2 px-2 py-4 is-drawer-close:justify-center is-drawer-open:px-4">
            <img src="/pokeball.png" alt="" className="size-8 shrink-0 object-contain is-drawer-close:hidden" style={{ imageRendering: "pixelated" }} />
            <div className="min-w-0 grow is-drawer-close:hidden">
              <div className="font-semibold">PokeRNG</div>
              <div className="text-xs text-base-content/70">Pack rolls</div>
            </div>
            <div className="is-drawer-open:ms-auto">
              <label htmlFor={DRAWER_ID} aria-label="Toggle sidebar" className="btn btn-ghost btn-square drawer-button size-12 is-drawer-close:size-14">
                <Icon name="panel" className="size-8 is-drawer-open:rotate-y-180 is-drawer-close:hidden" />
                <img src="/pokeball.png" alt="" className="size-10 is-drawer-open:hidden" style={{ imageRendering: "pixelated" }} />
              </label>
            </div>
          </div>
          <ul className="menu w-full grow text-lg">
            {NAV.map((item) => {
              const active = screen === item.id || (item.id === "packs" && (screen === "open" || screen === "reveal"));
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`${active ? "menu-active" : ""} is-drawer-close:tooltip is-drawer-close:tooltip-right`}
                    data-tip={item.label}
                    aria-current={active ? "page" : undefined}
                    onClick={() => go(item.id)}
                  >
                    <Icon name={item.icon} className="size-8" />
                    <span className="is-drawer-close:hidden text-lg">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="px-4 pb-4 text-xs text-base-content/70 is-drawer-close:hidden">
            Fan project. Not affiliated with Nintendo, The Pokémon Company, Creatures, or TCGplayer. Nothing here is for sale.
          </p>
        </div>
      </div>

      <dialog
        ref={dialogRef}
        className="modal card-sheet"
        onClose={() => {
          if (glideTimer.current != null) window.clearTimeout(glideTimer.current);
          glideTimer.current = null;
          setGlide("");
          setPicked(null);
        }}
      >
        {picked && catalog ? (
          <div className={`modal-box w-auto! max-w-none! overflow-visible! bg-transparent! p-4! shadow-none! ${glide}`}>
            <CardFace key={picked.card.id} card={picked.card} cond={picked.cond} conditions={catalog.conditions} large hideTag />
          </div>
        ) : (
          <div className="modal-box" />
        )}
        {picked ? <CardFactsPanel id={picked.card.id} /> : null}
        {picked && catalog ? (
          <aside className="card-panel fixed top-0 right-0 z-20 col-start-1 row-start-1 flex h-dvh w-[min(100%,20rem)] flex-col gap-3 overflow-y-auto bg-base-100 p-6 shadow-xl">
            <form method="dialog" className="self-end">
              <button className="btn btn-sm btn-error">Close</button>
            </form>
              <h2 id="card-title" className="text-3xl font-semibold">{picked.card.name}</h2>
              <p className="text-base-content/70">
                {catalog.sets[picked.card.set][1]} · {picked.card.number || "—"}
              </p>
              <div className="panel-section flex flex-col gap-1 p-3">
                <p className="rarity-name text-lg" style={{ color: tierColor(picked.card.tier) }}>
                  {catalog.tiers[picked.card.tier]}
                  {catalog.rarities[picked.card.rarity] && catalog.rarities[picked.card.rarity] !== catalog.tiers[picked.card.tier]
                    ? ` · ${catalog.rarities[picked.card.rarity]}`
                    : ""}
                  {" · "}1 in {oneIn(picked.card.tier).toLocaleString()}
                </p>
                <p className="condition-name text-lg" style={{ color: condColor(picked.cond) }}>
                  {catalog.conditions[picked.cond]} · {money(valueOf(picked.card, picked.cond))}
                </p>
                {COND_DROPPED(picked.card.tier, picked.cond) ? (
                  <p className="rarity-name" style={{ color: tierColor(effectiveTier(picked.card.tier, picked.cond)) }}>
                    This copy counts as {catalog.tiers[effectiveTier(picked.card.tier, picked.cond)]}.
                  </p>
                ) : null}
                <p>
                  You have {copiesOf(profile.owned, picked.card.id)} {copiesOf(profile.owned, picked.card.id) === 1 ? "copy" : "copies"}.
                </p>
              </div>
              <div className="panel-section flex flex-col gap-1 p-3">
                {catalog.conditions.map((name, index) => (
                  <span key={name} className="condition-name text-sm" style={{ color: condColor(index) }}>
                    {name} {(profile.owned[String(picked.card.id)] || [0, 0, 0, 0, 0])[index] || 0}
                  </span>
                ))}
              </div>
              {evolutions ? (
                <EvolutionPanel
                  card={picked.card}
                  byKey={evolutionIndex}
                  catalog={catalog}
                  profile={profile}
                  book={evolutions}
                  onOpen={showRelative}
                />
              ) : null}
          </aside>
        ) : null}
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </div>
  );
}

function COND_DROPPED(tier: number, cond: number) {
  return effectiveTier(tier, cond) !== tier;
}

function levelOf(xp: number) {
  return { level: 1 + Math.floor(xp / 80), into: xp % 80 };
}

function avatarCardName(avatar: string, byId: Map<number, Card>) {
  if (!avatar.startsWith("card:")) return undefined;
  return byId.get(Number(avatar.slice(5)))?.name;
}

function bestCondOf(profile: Profile, card: Card) {
  const row = profile.owned[String(card.id)] || [];
  let best = 0;
  let worth = -1;
  row.forEach((count, cond) => {
    if (!count) return;
    const value = valueOf(card, cond);
    if (value > worth) {
      worth = value;
      best = cond;
    }
  });
  return best;
}

function uniqueCount(profile: Profile, byId: Map<number, Card>) {
  let count = 0;
  for (const key of Object.keys(profile.owned)) {
    if (byId.has(Number(key)) && copiesOf(profile.owned, Number(key)) > 0) count += 1;
  }
  return count;
}

function collectionWorth(profile: Profile, byId: Map<number, Card>) {
  let total = 0;
  for (const [key, counts] of Object.entries(profile.owned)) {
    const card = byId.get(Number(key));
    if (!card) continue;
    counts.forEach((count, cond) => {
      total += count * valueOf(card, cond);
    });
  }
  return total;
}

function coverArt(pool: Card[]): Card | undefined {
  let best: Card | undefined;
  for (const card of pool) {
    if (!best || card.tier > best.tier) best = card;
  }
  return best;
}

function Packs({
  catalog,
  bySet,
  packPick,
  onPackPick,
  onOpen,
}: {
  catalog: Catalog;
  bySet: Map<number, Card[]>;
  packPick: string;
  onPackPick: (value: string) => void;
  onOpen: (index: number | null) => void;
}) {
  const featured = catalog.featured
    .map((code) => catalog.sets.findIndex((set) => set[0] === code))
    .filter((index) => index >= 0);
  const pickIndex = Number(packPick);
  const pickValue = packPick !== "all" && Number.isInteger(pickIndex) && catalog.sets[pickIndex] ? packPick : "all";
  return (
    <>
      <h1 className="text-3xl font-semibold">Packs</h1>
      <p className="mt-1 mb-4 text-sm whitespace-nowrap text-base-content/70">Rarer cards show up less often, and damage lowers the price.</p>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          className="select w-full sm:max-w-xs"
          aria-label="Set"
          value={pickValue}
          onChange={(event) => onPackPick(event.target.value)}
        >
          <option value="all">All · Every card</option>
          {catalog.sets.map((set, index) => (
            <option key={set[0]} value={index}>
              {set[1]}
            </option>
          ))}
        </select>
        <button type="button" className="btn bg-base-300" onClick={() => onOpen(pickValue === "all" ? null : Number(pickValue))}>
          Open that set
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4 overflow-anchor-none pb-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <PackCard code="All" name="Every card" setIndex={null} art={coverArt(catalog.cards)} onClick={() => onOpen(null)} />
        {featured.map((index) => (
          <PackCard
            key={catalog.sets[index][0]}
            code={catalog.sets[index][0]}
            name={catalog.sets[index][1]}
            setIndex={index}
            art={coverArt(bySet.get(index) ?? [])}
            onClick={() => onOpen(index)}
          />
        ))}
      </div>
    </>
  );
}

function Opener({
  catalog,
  setIndex,
  pool,
  onBack,
  onStep,
  onRoll,
}: {
  catalog: Catalog;
  setIndex: number | null;
  pool: Card[];
  onBack: () => void;
  onStep: (delta: number) => void;
  onRoll: (count: number) => void;
}) {
  const name = setIndex == null ? "Every card" : catalog.sets[setIndex][1];
  const code = setIndex == null ? "All" : catalog.sets[setIndex][0];
  const present = new Set(pool.map((card) => card.tier));
  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-neutral" onClick={onBack}>
          All packs
        </button>
        <button type="button" className="btn btn-neutral" onClick={() => onStep(-1)}>
          Prev
        </button>
        <button type="button" className="btn btn-neutral" onClick={() => onStep(1)}>
          Next
        </button>
      </div>
      <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-6 sm:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="mx-auto flex w-full max-w-72 flex-col items-center gap-4 self-start sm:mx-0 sm:max-w-none">
          <PackCard code={code} name={name} setIndex={setIndex} art={coverArt(pool)} />
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="btn btn-primary" onClick={() => onRoll(1)}>
              Open 1 pack
            </button>
            <button type="button" className="btn btn-neutral" onClick={() => onRoll(10)}>
              Open 10 packs
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-col">
          <h1 className="text-3xl font-semibold">{name}</h1>
          <p className="mt-1 mb-4 max-w-prose text-base-content/70">{pool.length.toLocaleString()} cards. A roll picks a rarity, then a card, then a condition.</p>
          <div className="flex flex-wrap gap-2">
            {catalog.tiers.map((tier, index) =>
              present.has(index) ? (
                <span key={tier} className="rarity-name text-sm" style={{ color: tierColor(index) }}>
                  {tier} 1 in {oneIn(index).toLocaleString()}
                </span>
              ) : null,
            )}
          </div>
          <PackOrbit pool={pool} />
        </div>
      </div>
    </div>
  );
}

function readSkipOpen(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  return localStorage.getItem("pokerng-skip-open") === "1";
}

function Reveal({
  catalog,
  pulls,
  best,
  onAgain,
  onCollection,
  onCard,
}: {
  catalog: Catalog;
  pulls: Pull[];
  best: number;
  onAgain: () => void;
  onCollection: () => void;
  onCard: (card: Card, cond: number) => void;
}) {
  const animate = pulls.length > 1 && !readSkipOpen();
  const [placed, setPlaced] = useState(animate ? 0 : pulls.length);
  const flyingRef = useRef(false);
  const flyerRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<Array<HTMLDivElement | null>>([]);
  const done = placed >= pulls.length;
  const current = pulls[placed];

  function placeCurrent() {
    if (flyingRef.current || placed >= pulls.length) return;
    const flyer = flyerRef.current;
    const slot = slotRefs.current[placed];
    if (!flyer || !slot) {
      setPlaced((count) => count + 1);
      return;
    }
    flyingRef.current = true;
    const first = flyer.getBoundingClientRect();
    const to = slot.getBoundingClientRect();
    flyer.style.left = `${to.left}px`;
    flyer.style.top = `${to.top}px`;
    flyer.style.width = `${to.width}px`;
    flyer.style.translate = "none";
    flyer.style.transformOrigin = "top left";
    flyer.style.transform = "none";
    const last = flyer.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const sx = last.width > 0 ? first.width / last.width : 1;
    const sy = last.height > 0 ? first.height / last.height : 1;
    flyer.style.transition = "none";
    flyer.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    void flyer.offsetWidth;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      flyer.removeEventListener("transitionend", onEnd);
      window.clearTimeout(timer);
      flyingRef.current = false;
      setPlaced((count) => (count >= pulls.length ? count : count + 1));
    };
    const onEnd = (event: TransitionEvent) => {
      if (event.propertyName !== "transform") return;
      finish();
    };
    const timer = window.setTimeout(finish, 520);
    flyer.addEventListener("transitionend", onEnd);
    requestAnimationFrame(() => {
      flyer.style.transition = "transform 420ms ease";
      flyer.style.transform = "translate(0px, 0px) scale(1, 1)";
    });
  }

  return (
    <>
      {done && best >= 5 ? (
        <div role="alert" className="alert mb-4">
          {best >= 6 ? "Mythic pull." : "Secret pull."}
        </div>
      ) : null}
      {done ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={onAgain}>
            Open another
          </button>
          <button type="button" className="btn" onClick={onCollection}>
            Collection
          </button>
        </div>
      ) : null}
      <div className="reveal-cards grid grid-cols-2 gap-4 overflow-anchor-none pb-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {pulls.map((pull, index) => (
          <div
            key={`${pull.card.id}-${index}`}
            ref={(node) => {
              slotRefs.current[index] = node;
            }}
            className={index < placed ? undefined : "invisible"}
          >
            <CardFace
              card={pull.card}
              cond={pull.cond}
              conditions={catalog.conditions}
              fresh={pull.fresh}
              onClick={index < placed ? () => onCard(pull.card, pull.cond) : undefined}
            />
          </div>
        ))}
      </div>
      {current ? (
        <>
          <div className="reveal-catch fixed inset-0 z-30 cursor-pointer" onClick={placeCurrent} />
          <div key={placed} ref={flyerRef} className="pointer-events-none fixed top-1/2 left-1/2 z-40 w-72 -translate-x-1/2 -translate-y-1/2">
            <CardFace card={current.card} cond={current.cond} conditions={catalog.conditions} fresh={current.fresh} />
          </div>
          <button
            type="button"
            className="btn btn-neutral fixed right-6 bottom-6 z-50"
            onClick={() => {
              flyingRef.current = false;
              setPlaced(pulls.length);
            }}
          >
            Skip
          </button>
        </>
      ) : null}
    </>
  );
}

function Collection({
  catalog,
  profile,
  byId,
  setFilter,
  onSetFilter,
  onCard,
}: {
  catalog: Catalog;
  profile: Profile;
  byId: Map<number, Card>;
  setFilter: string;
  onSetFilter: (value: string) => void;
  onCard: (card: Card, cond: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("value");
  const filterValue = setFilter !== "" && catalog.sets[Number(setFilter)] ? setFilter : "";
  const entries = useMemo(() => {
    const found = [];
    for (const [key, counts] of Object.entries(profile.owned)) {
      const card = byId.get(Number(key));
      if (!card) continue;
      let total = 0;
      let bestCond = 0;
      let bestValue = -1;
      counts.forEach((count, cond) => {
        total += count;
        if (!count) return;
        const worth = valueOf(card, cond);
        if (worth > bestValue) {
          bestValue = worth;
          bestCond = cond;
        }
      });
      if (total > 0) found.push({ card, total, bestCond, bestValue });
    }
    const needle = query.trim().toLowerCase();
    const filtered = found.filter((entry) => {
      if (filterValue !== "" && entry.card.set !== Number(filterValue)) return false;
      if (needle && !entry.card.name.toLowerCase().includes(needle)) return false;
      return true;
    });
    filtered.sort((a, b) => {
      if (sort === "name") return a.card.name.localeCompare(b.card.name);
      if (sort === "rarity") return b.card.tier - a.card.tier || b.bestValue - a.bestValue;
      return b.bestValue - a.bestValue;
    });
    return filtered;
  }, [profile.owned, byId, query, filterValue, sort]);

  return (
    <>
      <h1 className="text-3xl font-semibold">Collection</h1>
      <p className="mt-1 mb-4 max-w-prose text-base-content/70">Saved in this browser. Move the cursor over a card and it tilts.</p>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <input className="input w-full sm:flex-1" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a name" aria-label="Search" />
        <select className="select w-full sm:w-auto" aria-label="Set" value={filterValue} onChange={(event) => onSetFilter(event.target.value)}>
          <option value="">Every set</option>
          {catalog.sets.map((set, index) => (
            <option key={set[0]} value={index}>
              {set[1]}
            </option>
          ))}
        </select>
        <button type="button" className="btn bg-base-content text-base-100" onClick={() => onSetFilter("")}>
          Every set
        </button>
        <select className="select w-full sm:w-auto" aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="value">Highest value</option>
          <option value="rarity">Rarest</option>
          <option value="name">Name</option>
        </select>
      </div>
      {entries.length === 0 ? <p className="text-base-content/70">Nothing saved yet. Open a pack and the cards land here.</p> : null}
      <div className="collection-cards grid grid-cols-2 gap-4 overflow-anchor-none pb-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {entries.map((entry) => (
          <CardFace
            key={entry.card.id}
            card={entry.card}
            cond={entry.bestCond}
            conditions={catalog.conditions}
            count={entry.total}
            onClick={() => onCard(entry.card, entry.bestCond)}
          />
        ))}
      </div>
    </>
  );
}

const BRIGHT = ["#ff5a36", "#ffd23f", "#3ecf8e", "#4cc9f0", "#ff4fa3", "#c084fc", "#7dff6b", "#ff9f1c"];

function anotherBright(current: string) {
  const choices = BRIGHT.filter((color) => color !== current);
  return choices[Math.floor(Math.random() * choices.length)];
}

function Dex({
  catalog,
  profile,
  bySet,
  onCard,
}: {
  catalog: Catalog;
  profile: Profile;
  bySet: Map<number, Card[]>;
  onCard: (card: Card) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [titleHue, setTitleHue] = useState<Record<number, string>>({});
  const rows = catalog.sets.map((set, index) => {
    const cards = bySet.get(index) ?? [];
    let have = 0;
    for (const card of cards) {
      if (copiesOf(profile.owned, card.id) > 0) have += 1;
    }
    return { index, name: set[1], have, total: cards.length, pct: cards.length ? (have / cards.length) * 100 : 0, cards };
  });
  rows.sort((a, b) => b.pct - a.pct || b.have - a.have);
  const unique = rows.reduce((sum, row) => sum + row.have, 0);
  return (
    <>
      <h1 className="text-3xl font-semibold">Dex</h1>
      <p className="mt-1 mb-4 max-w-prose text-base-content/70">
        {unique.toLocaleString()} of {catalog.cards.length.toLocaleString()} cards registered.
      </p>
      <div className="flex flex-col gap-2">
        {rows.map((row) => {
          const owned = row.cards.filter((card) => copiesOf(profile.owned, card.id) > 0);
          const expanded = open === row.index;
          return (
            <div key={row.index} className="cv-auto rounded-box border border-base-300 bg-base-100">
              <button
                type="button"
                className="dex-set relative flex w-full items-center justify-between gap-4 rounded-box px-4 py-4 text-start"
                style={{ "--dex-title": titleHue[row.index] ?? BRIGHT[row.index % BRIGHT.length] } as React.CSSProperties}
                aria-expanded={expanded}
                onMouseEnter={() =>
                  setTitleHue((current) => {
                    const now = current[row.index] ?? BRIGHT[row.index % BRIGHT.length];
                    return { ...current, [row.index]: anotherBright(now) };
                  })
                }
                onClick={() => setOpen(expanded ? null : row.index)}
              >
                <strong className="font-medium">{row.name}</strong>
                <span className="text-sm text-base-content/70">
                  {row.have} / {row.total}
                </span>
                <span className="absolute bottom-0 left-0 h-0.5 bg-base-content" style={{ width: `${row.pct}%` }} />
              </button>
              {expanded ? (
                <div className="border-t border-base-300 p-4">
                  {owned.length === 0 ? (
                    <p className="text-sm text-base-content/70">None from this set yet.</p>
                  ) : (
                    <div className="dex-cards grid grid-cols-2 gap-4 pb-3 sm:grid-cols-3 lg:grid-cols-4">
                      {owned.map((card) => (
                        <CardFace
                          key={card.id}
                          card={card}
                          cond={bestCondOf(profile, card)}
                          conditions={catalog.conditions}
                          count={copiesOf(profile.owned, card.id)}
                          onClick={() => onCard(card)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Trade() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Trade</h1>
      <div className="card card-border mt-4 max-w-lg bg-base-100">
        <div className="card-body">
          <p>Trading is not hooked up yet. Cards stay on this computer.</p>
        </div>
      </div>
    </>
  );
}

function ProfilePage({
  profile,
  byId,
  book,
  recent,
  level,
  xpPct,
  onSave,
  onPacks,
  onCard,
}: {
  profile: Profile;
  byId: Map<number, Card>;
  book: SpriteBook | null;
  recent: Card[];
  level: { level: number; into: number };
  xpPct: number;
  onSave: (next: Profile) => void;
  onPacks: () => void;
  onCard: (card: Card) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [dark, setDark] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState("");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
    setSkipOpen(localStorage.getItem("pokerng-skip-open") === "1");
  }, []);
  const owned = useMemo(() => {
    const list: Card[] = [];
    for (const key of Object.keys(profile.owned)) {
      if (copiesOf(profile.owned, Number(key)) <= 0) continue;
      const card = byId.get(Number(key));
      if (card) list.push(card);
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [profile.owned, byId]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const avatar = await imageFileToAvatar(file);
      onSave({ ...profile, avatar });
      setNote("");
      setPicking(false);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not read that image.");
    }
  }

  const pictures = useMemo(() => {
    const list: { name: string; url: string; fallback: boolean }[] = [];
    const seen = new Set<string>();
    if (!book) return list;
    let missed = false;
    for (const card of owned) {
      const match = matchSprite(card.name, book);
      if (match.fallback) {
        missed = true;
        continue;
      }
      if (seen.has(match.url)) continue;
      seen.add(match.url);
      list.push({ name: card.name, url: match.url, fallback: false });
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    if (missed && !seen.has(book.ditto)) list.push({ name: "Ditto", url: book.ditto, fallback: true });
    return list;
  }, [owned, book]);

  function confirmPicture() {
    const pickedPicture = pictures.find((picture) => picture.url === choice);
    if (!pickedPicture) return;
    onSave({ ...profile, avatar: `pixel:${pickedPicture.url}` });
    setPicking(false);
    setChoice("");
    if (pickedPicture.fallback) setNotice(true);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Profile</h1>
        <ProfileAuth />
      </div>
      <div className="mt-4 grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="card card-border bg-base-100">
          <div className="card-body items-center text-center">
            <div
              className="radial-progress"
              style={{ "--value": xpPct, "--size": "7rem", "--thickness": "6px", color: xpColor(xpPct) } as React.CSSProperties}
              role="progressbar"
              aria-valuenow={xpPct}
              aria-label={`Level ${level.level}`}
            >
              <Avatar
                avatar={profile.avatar}
                letter={name || profile.name}
                className="size-20"
                cardName={avatarCardName(profile.avatar, byId)}
                book={book}
              />
              <span className="sr-only">{xpPct}</span>
            </div>
            <h2 className="text-xl font-semibold">{name || profile.name}</h2>
            <p className="text-sm text-base-content/70">
              Level {level.level}
              <span className="ms-2">{level.into} / 80 xp</span>
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
                Upload image
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setChoice("");
                  setPicking(true);
                }}
              >
                Use a card
              </button>
              {profile.avatar ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSave({ ...profile, avatar: "" })}>
                  Remove
                </button>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void onFile(file);
              }}
            />
            <div className="mt-6 flex w-full flex-col gap-6 text-start">
              <p className="text-sm text-base-content/70">Images up to 2 MB. A card picture uses one you already pulled.</p>
              {note ? <p className="text-sm text-error">{note}</p> : null}
              <label className="floating-label">
                <input
                  className="input"
                  placeholder="Trainer name"
                  value={name}
                  maxLength={24}
                  onChange={(event) => setName(event.target.value)}
                />
                <span>Trainer name</span>
              </label>
            </div>
            <label className="label mt-2 justify-start gap-4 self-start">
              <input
                type="checkbox"
                className="toggle"
                checked={dark}
                onChange={(event) => {
                  const next = event.target.checked ? "dark" : "light";
                  document.documentElement.setAttribute("data-theme", next);
                  localStorage.setItem("pokerng-theme", next);
                  setDark(event.target.checked);
                }}
              />
              {dark ? "Dark theme" : "Light theme"}
            </label>
            <label className="label justify-start gap-4 self-start">
              <input
                type="checkbox"
                className="toggle"
                checked={skipOpen}
                onChange={(event) => {
                  localStorage.setItem("pokerng-skip-open", event.target.checked ? "1" : "0");
                  setSkipOpen(event.target.checked);
                }}
              />
              Skip pack opening animations
            </label>
            <div className="card-actions mt-2 w-full">
              <button type="button" className="btn" onClick={() => onSave({ ...profile, name: name.trim() || "Trainer" })}>
                Save name
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  if (!window.confirm("Erase every card saved in this browser?")) return;
                  const fresh = blankProfile();
                  fresh.name = profile.name;
                  fresh.avatar = profile.avatar.startsWith("data:image/") ? profile.avatar : "";
                  onSave(fresh);
                }}
              >
                Reset collection
              </button>
            </div>
          </div>
        </div>
        <section className="card card-border bg-base-100">
          <div className="border-b border-base-300 px-4 py-4">
            <h2 className="inline-block border-b-2 border-primary pb-2 font-semibold">Latest cards</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
            {recent.map((card, index) => (
              <button key={`${card.id}-${index}`} type="button" className="card card-border overflow-hidden text-start" onClick={() => onCard(card)}>
                <img alt={card.name} src={artUrl(card.id, false)} className="aspect-[5/7] w-full object-cover" />
                <div className="card-body p-4">
                  <h3 className="text-sm font-semibold">{card.name}</h3>
                </div>
              </button>
            ))}
            <button type="button" className="card card-border min-h-40" onClick={onPacks}>
              <div className="card-body items-center justify-center text-center">
                <span className="grid size-12 place-items-center rounded-full bg-neutral text-2xl text-neutral-content">+</span>
                <span className="font-semibold">Open a pack</span>
              </div>
            </button>
          </div>
        </section>
      </div>
      {picking ? (
        <dialog className="modal modal-open card-sheet">
          <div className="modal-box w-[min(94vw,76rem)]! max-w-none!">
            <h2 className="text-xl font-semibold">Choose a picture</h2>
            {!book ? (
              <p className="mt-4 text-sm text-base-content/70">Getting the pictures.</p>
            ) : pictures.length === 0 ? (
              <p className="mt-4 text-sm text-base-content/70">Open a pack first, then pick one of those cards.</p>
            ) : (
              <div className="mt-4 grid max-h-[70dvh] grid-cols-3 gap-3 overflow-y-auto p-1.5 sm:grid-cols-5 lg:grid-cols-7">
                {pictures.map((picture) => (
                  <button
                    key={picture.url}
                    type="button"
                    aria-pressed={choice === picture.url}
                    className={`flex aspect-square w-full flex-col items-center justify-between overflow-hidden rounded-box border border-base-300 bg-base-200 p-3 ${choice === picture.url ? "outline outline-2 outline-offset-2 outline-[#3aaa6a]" : ""}`}
                    onClick={() => setChoice(picture.url)}
                  >
                    <img alt="" src={picture.url} className="min-h-0 w-2/3 flex-1 object-contain" style={{ imageRendering: "pixelated" }} />
                    <span className="line-clamp-2 w-full text-center text-xs leading-tight">{picture.name}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="modal-action">
              <button type="button" className="btn btn-ghost" onClick={() => setPicking(false)}>
                Cancel
              </button>
              <button type="button" className="btn bg-base-300" disabled={!choice} onClick={confirmPicture}>
                Confirm
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button type="button" onClick={() => setPicking(false)}>
              close
            </button>
          </form>
        </dialog>
      ) : null}
      {notice ? (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <p>We're working on adding more images soon.</p>
            <div className="modal-action">
              <button type="button" className="btn" onClick={() => setNotice(false)}>
                Close
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button type="button" onClick={() => setNotice(false)}>
              close
            </button>
          </form>
        </dialog>
      ) : null}
    </>
  );
}
