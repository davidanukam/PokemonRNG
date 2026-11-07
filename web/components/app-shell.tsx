"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CardFace } from "@/components/card-face";
import { Icon } from "@/components/icons";
import { PackCard } from "@/components/pack-card";
import {
  copiesOf,
  effectiveTier,
  hydrateCatalog,
  indexCards,
  money,
  oneIn,
  rollOne,
  valueOf,
} from "@/lib/game";
import { blankProfile, readProfile, writeProfile } from "@/lib/storage";
import type { Card, Catalog, Profile, Pull, Screen } from "@/lib/types";

const DRAWER_ID = "pokerng-drawer";

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
  const [screen, setScreen] = useState<Screen>("packs");
  const [setIndex, setSetIndex] = useState<number | null>(null);
  const [pulls, setPulls] = useState<Pull[]>([]);
  const [picked, setPicked] = useState<{ card: Card; cond: number } | null>(null);
  const [collectionSet, setCollectionSet] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    setProfile(readProfile());
    const box = document.getElementById(DRAWER_ID) as HTMLInputElement | null;
    const desktop = window.matchMedia("(min-width: 1024px)");
    function applySidebar() {
      if (!box) return;
      box.checked = desktop.matches && localStorage.getItem("pokerng-sidebar") !== "0";
    }
    applySidebar();
    desktop.addEventListener("change", applySidebar);
    let cancel = false;
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
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (picked && !dialog.open) dialog.showModal();
    if (!picked && dialog.open) dialog.close();
  }, [picked]);

  const indexes = useMemo(
    () => (catalog ? indexCards(catalog.cards) : { byId: new Map<number, Card>(), bySet: new Map<number, Card[]>() }),
    [catalog],
  );

  function save(next: Profile) {
    setProfile(next);
    writeProfile(next);
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
    save({ ...profile, owned, xp, opened });
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
            <div
              className="radial-progress text-xs"
              style={{ "--value": xpPct, "--size": "2.75rem", "--thickness": "3px" } as React.CSSProperties}
              role="progressbar"
              aria-valuenow={xpPct}
              aria-label={`Level ${level.level}`}
            >
              {xpPct}
            </div>
            <div className="min-w-0">
              <div className="font-semibold">{profile.name}</div>
              <div className="text-sm text-base-content/70">
                Level {level.level}
                <span className="ms-2">{level.into} / 80 xp</span>
              </div>
            </div>
          </div>
          <div className="navbar-end">
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
            initialSet={collectionSet}
            onCard={(card, cond) => setPicked({ card, cond })}
          />
        ) : null}
        {catalog && screen === "dex" ? (
          <Dex
            catalog={catalog}
            profile={profile}
            bySet={indexes.bySet}
            onSet={(index) => {
              setCollectionSet(String(index));
              go("collection");
            }}
          />
        ) : null}
        {screen === "trade" ? <Trade /> : null}
        {screen === "profile" ? <ProfilePage profile={profile} onSave={save} /> : null}
        </main>
      </div>
      <div className="drawer-side is-drawer-close:overflow-visible">
        <label htmlFor={DRAWER_ID} aria-label="Close menu" className="drawer-overlay" />
        <div className="flex min-h-full flex-col bg-base-200 is-drawer-close:w-16 is-drawer-open:w-64">
          <div className="flex items-center gap-2 px-4 py-4">
            <span className="size-8 shrink-0 rounded-box bg-neutral" aria-hidden="true" />
            <div className="is-drawer-close:hidden">
              <div className="font-semibold">PokeRNG</div>
              <div className="text-xs text-base-content/70">Pack rolls</div>
            </div>
          </div>
          <ul className="menu w-full grow">
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
                    <Icon name={item.icon} />
                    <span className="is-drawer-close:hidden">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="px-4 pb-4 text-xs text-base-content/70 is-drawer-close:hidden">
            Fan project. Not affiliated with Nintendo, The Pokémon Company, Creatures, or TCGplayer. Nothing here is for sale.
          </p>
          <div className="m-2 is-drawer-close:tooltip is-drawer-close:tooltip-right" data-tip="Sidebar">
            <label htmlFor={DRAWER_ID} aria-label="Shrink sidebar" className="btn btn-ghost btn-square drawer-button is-drawer-open:rotate-y-180">
              <Icon name="panel" />
            </label>
          </div>
        </div>
      </div>

      <dialog ref={dialogRef} className="modal" onClose={() => setPicked(null)}>
        {picked && catalog ? (
          <div className="modal-box grid w-11/12 max-w-3xl grid-cols-1 gap-4 sm:grid-cols-[16rem_minmax(0,1fr)]">
            <CardFace card={picked.card} cond={picked.cond} conditions={catalog.conditions} large />
            <div>
              <h2 id="card-title" className="text-2xl font-semibold">{picked.card.name}</h2>
              <p className="mt-2 text-base-content/70">
                {catalog.sets[picked.card.set][1]} · {picked.card.number || "—"}
              </p>
              <p className="text-base-content/70">
                {catalog.rarities[picked.card.rarity]} · 1 in {oneIn(picked.card.tier).toLocaleString()}
              </p>
              <p className="text-base-content/70">
                {catalog.conditions[picked.cond]} · {money(valueOf(picked.card, picked.cond))}
              </p>
              {COND_DROPPED(picked.card.tier, picked.cond) ? (
                <p className="mt-2 font-medium">
                  This copy counts as {catalog.tiers[effectiveTier(picked.card.tier, picked.cond)]}.
                </p>
              ) : null}
              <p className="mt-2">
                You have {copiesOf(profile.owned, picked.card.id)} {copiesOf(profile.owned, picked.card.id) === 1 ? "copy" : "copies"}.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {catalog.conditions.map((name, index) => (
                  <span key={name} className="badge badge-ghost">
                    {name} {(profile.owned[String(picked.card.id)] || [0, 0, 0, 0, 0])[index] || 0}
                  </span>
                ))}
              </div>
              <form method="dialog" className="modal-action">
                <button className="btn">Close</button>
              </form>
            </div>
          </div>
        ) : (
          <div className="modal-box" />
        )}
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
  onOpen,
}: {
  catalog: Catalog;
  bySet: Map<number, Card[]>;
  onOpen: (index: number | null) => void;
}) {
  const featured = catalog.featured
    .map((code) => catalog.sets.findIndex((set) => set[0] === code))
    .filter((index) => index >= 0);
  return (
    <>
      <h1 className="text-3xl font-semibold">Packs</h1>
      <p className="mt-1 mb-4 max-w-prose text-base-content/70">Rarer cards show up less often. A damaged copy is worth less than the same card in Near Mint.</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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
      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          onOpen(Number(data.get("set")));
        }}
      >
        <select name="set" className="select w-full sm:max-w-xs" aria-label="Another set" defaultValue={featured[0] ?? 0}>
          {catalog.sets.map((set, index) => (
            <option key={set[0]} value={index}>
              {set[1]}
            </option>
          ))}
        </select>
        <button type="submit" className="btn">
          Open that set
        </button>
      </form>
    </>
  );
}

function Opener({
  catalog,
  setIndex,
  pool,
  onBack,
  onRoll,
}: {
  catalog: Catalog;
  setIndex: number | null;
  pool: Card[];
  onBack: () => void;
  onRoll: (count: number) => void;
}) {
  const name = setIndex == null ? "Every card" : catalog.sets[setIndex][1];
  const code = setIndex == null ? "All" : catalog.sets[setIndex][0];
  const present = new Set(pool.map((card) => card.tier));
  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={onBack}>
        All packs
      </button>
      <div className="mt-4 grid grid-cols-1 items-start gap-6 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <PackCard code={code} name={name} setIndex={setIndex} art={coverArt(pool)} />
        <div>
          <h1 className="text-3xl font-semibold">{name}</h1>
          <p className="mt-1 mb-4 max-w-prose text-base-content/70">{pool.length.toLocaleString()} cards. A roll picks a rarity, then a card, then a condition.</p>
          <div className="flex flex-wrap gap-2">
            {catalog.tiers.map((tier, index) =>
              present.has(index) ? (
                <span key={tier} className="badge badge-ghost">
                  {tier} 1 in {oneIn(index).toLocaleString()}
                </span>
              ) : null,
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => onRoll(1)}>
              Open a pack
            </button>
            <button type="button" className="btn" onClick={() => onRoll(10)}>
              Open 10
            </button>
          </div>
        </div>
      </div>
    </>
  );
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
  return (
    <>
      {best >= 5 ? (
        <div role="alert" className="alert mb-4">
          {best >= 6 ? "Mythic pull." : "Secret pull."}
        </div>
      ) : null}
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={onAgain}>
          Open another
        </button>
        <button type="button" className="btn" onClick={onCollection}>
          Collection
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {pulls.map((pull, index) => (
          <div key={`${pull.card.id}-${index}`} style={{ animationDelay: `${Math.min(index, 9) * 0.05}s` }}>
            <CardFace
              card={pull.card}
              cond={pull.cond}
              conditions={catalog.conditions}
              fresh={pull.fresh}
              onClick={() => onCard(pull.card, pull.cond)}
            />
          </div>
        ))}
      </div>
    </>
  );
}

function Collection({
  catalog,
  profile,
  byId,
  initialSet,
  onCard,
}: {
  catalog: Catalog;
  profile: Profile;
  byId: Map<number, Card>;
  initialSet: string;
  onCard: (card: Card, cond: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [setFilter, setSetFilter] = useState(initialSet);
  const [sort, setSort] = useState("value");
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
      if (setFilter !== "" && entry.card.set !== Number(setFilter)) return false;
      if (needle && !entry.card.name.toLowerCase().includes(needle)) return false;
      return true;
    });
    filtered.sort((a, b) => {
      if (sort === "name") return a.card.name.localeCompare(b.card.name);
      if (sort === "rarity") return b.card.tier - a.card.tier || b.bestValue - a.bestValue;
      return b.bestValue - a.bestValue;
    });
    return filtered;
  }, [profile.owned, byId, query, setFilter, sort]);

  return (
    <>
      <h1 className="text-3xl font-semibold">Collection</h1>
      <p className="mt-1 mb-4 max-w-prose text-base-content/70">Saved in this browser. Move the cursor over a card and it tilts.</p>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <input className="input w-full sm:flex-1" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a name" aria-label="Search" />
        <select className="select w-full sm:w-auto" aria-label="Set" value={setFilter} onChange={(event) => setSetFilter(event.target.value)}>
          <option value="">Every set</option>
          {catalog.sets.map((set, index) => (
            <option key={set[0]} value={index}>
              {set[1]}
            </option>
          ))}
        </select>
        <select className="select w-full sm:w-auto" aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="value">Highest value</option>
          <option value="rarity">Rarest</option>
          <option value="name">Name</option>
        </select>
      </div>
      {entries.length === 0 ? <p className="text-base-content/70">Nothing saved yet. Open a pack and the cards land here.</p> : null}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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

function Dex({
  catalog,
  profile,
  bySet,
  onSet,
}: {
  catalog: Catalog;
  profile: Profile;
  bySet: Map<number, Card[]>;
  onSet: (index: number) => void;
}) {
  const rows = catalog.sets.map((set, index) => {
    const cards = bySet.get(index) ?? [];
    let have = 0;
    for (const card of cards) {
      if (copiesOf(profile.owned, card.id) > 0) have += 1;
    }
    return { index, name: set[1], have, total: cards.length, pct: cards.length ? (have / cards.length) * 100 : 0 };
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
        {rows.map((row) => (
          <button
            key={row.index}
            type="button"
            className="cv-auto relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-box border border-base-300 bg-base-100 px-4 py-4 text-start"
            onClick={() => onSet(row.index)}
          >
            <strong className="font-medium">{row.name}</strong>
            <span className="text-sm text-base-content/70">
              {row.have} / {row.total}
            </span>
            <span className="absolute bottom-0 left-0 h-0.5 bg-base-content" style={{ width: `${row.pct}%` }} />
          </button>
        ))}
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

function ProfilePage({ profile, onSave }: { profile: Profile; onSave: (next: Profile) => void }) {
  const [name, setName] = useState(profile.name);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);
  return (
    <>
      <h1 className="text-3xl font-semibold">Profile</h1>
      <div className="card card-border mt-4 max-w-xl bg-base-100">
        <div className="card-body">
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
          <label className="label cursor-pointer justify-start gap-4">
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
            Dark theme
          </label>
          <div className="card-actions flex-wrap">
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
                onSave(fresh);
              }}
            >
              Reset collection
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
