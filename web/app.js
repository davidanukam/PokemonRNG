const WEIGHTS = [500000, 250000, 150000, 80000, 18000, 1900, 100];
const WEIGHT_TOTAL = WEIGHTS.reduce((sum, weight) => sum + weight, 0);
const COND_WEIGHTS = [62, 22, 10, 4, 2];
const COND_DROP = [0, 0, 0, 1, 2];
const COND_FACTOR = [1, 0.75, 0.5, 0.28, 0.12];
const FALLBACK_CENTS = [25, 50, 150, 400, 2000, 8000, 25000];
const SAVE_KEY = "rolldex-v1";
const THEME_KEY = "rolldex-theme";

const screen = document.querySelector("#screen");
const modal = document.querySelector("#modal");
const modalCard = modal.querySelector(".modal-card");

let catalog = null;
let cards = [];
let byId = new Map();
let bySet = new Map();
let profile = loadProfile();
let screenName = "home";
let selectedSet = null;
let lastPulls = [];

document.querySelectorAll(".tabs button").forEach((button) => {
  button.addEventListener("click", () => show(button.dataset.screen));
});
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

const savedTheme = localStorage.getItem(THEME_KEY);
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

boot();

async function boot() {
  screen.innerHTML = "<p class='lead'>Loading the card pool…</p>";
  try {
    const response = await fetch("data/catalog.json");
    if (!response.ok) throw new Error(String(response.status));
    catalog = await response.json();
  } catch (error) {
    screen.innerHTML = "<p class='lead'>The card pool is missing. From the project folder, run <code>python main.py catalog</code> and reload.</p>";
    return;
  }
  hydrate();
  paintStats();
  show("home");
}

function hydrate() {
  cards = catalog.cards.map((row) => ({
    id: row[0],
    name: row[1],
    set: row[2],
    number: row[3],
    tier: row[4],
    rarity: row[5],
    prices: row[6],
  }));
  byId = new Map(cards.map((card) => [card.id, card]));
  bySet = new Map();
  for (const card of cards) {
    if (!bySet.has(card.set)) bySet.set(card.set, []);
    bySet.get(card.set).push(card);
  }
}

function show(name) {
  screenName = name;
  document.querySelectorAll(".tabs button").forEach((button) => {
    button.classList.toggle("is-on", button.dataset.screen === name);
  });
  closeModal();
  if (name === "home") renderHome();
  else if (name === "collection") renderCollection();
  else if (name === "dex") renderDex();
  else if (name === "trade") renderTrade();
  else renderMenu();
  paintStats();
}

function renderHome() {
  const featured = catalog.featured
    .map((code) => catalog.sets.findIndex((set) => set[0] === code))
    .filter((index) => index >= 0);
  const packs = [null, ...featured];
  screen.innerHTML = `
    <h1>Open a pack</h1>
    <p class="lead">Rarer cards show up less often. The same card in Damaged condition is worth less than a Near Mint copy.</p>
    <div class="shelf">${packs.map((index) => packButton(index)).join("")}</div>
    <div class="filters">
      <select id="more-sets" aria-label="Another set">
        ${catalog.sets.map((set, index) => `<option value="${index}">${escapeHtml(set[1])}</option>`).join("")}
      </select>
      <button type="button" class="btn ghost" id="open-more">Open that set</button>
    </div>
  `;
  document.querySelector("#open-more").addEventListener("click", () => {
    selectedSet = Number(document.querySelector("#more-sets").value);
    renderOpen();
  });
  screen.querySelectorAll("[data-pack]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSet = button.dataset.pack === "all" ? null : Number(button.dataset.pack);
      renderOpen();
    });
  });
}

function renderOpen() {
  const pool = poolFor(selectedSet);
  const setName = selectedSet == null ? "Every set" : catalog.sets[selectedSet][1];
  const code = selectedSet == null ? "All" : catalog.sets[selectedSet][0];
  screen.innerHTML = `
    <button type="button" class="btn ghost" id="back">All packs</button>
    <div class="hero-pack">
      ${packFace(selectedSet, true)}
      <div>
        <h1>${escapeHtml(setName)}</h1>
        <p class="lead">${pool.length.toLocaleString()} cards in this pool. A roll picks a rarity first, then a card, then a condition.</p>
        <div class="odds">${oddsLine(pool)}</div>
        <div class="toolbar">
          <button type="button" class="btn" id="open-one">Open a pack</button>
          <button type="button" class="btn" id="open-ten">Open 10 packs</button>
        </div>
      </div>
    </div>
  `;
  document.querySelector("#back").addEventListener("click", () => show("home"));
  document.querySelector("#open-one").addEventListener("click", () => openPacks(1));
  document.querySelector("#open-ten").addEventListener("click", () => openPacks(10));
  document.querySelector(".hero-pack .pack")?.setAttribute("data-static", "1");
  const face = document.querySelector(".hero-pack");
  if (face) face.querySelector(".pack").style.width = "220px";
}

function openPacks(count) {
  const pool = poolFor(selectedSet);
  if (!pool.length) return;
  lastPulls = [];
  for (let index = 0; index < count; index += 1) {
    const pull = rollOne(pool);
    remember(pull);
    lastPulls.push(pull);
  }
  persist();
  renderReveal();
}

function renderReveal() {
  const best = Math.max(...lastPulls.map((pull) => pull.card.tier));
  const banner = best >= 5
    ? `<div class="banner">${best >= 6 ? "Mythic pull" : "Secret pull"}. The whole table would have looked up.</div>`
    : "";
  screen.innerHTML = `
    ${banner}
    <div class="toolbar">
      <button type="button" class="btn" id="again">Open another</button>
      <button type="button" class="btn ghost" id="to-collection">Collection</button>
    </div>
    <div class="reveal">
      ${lastPulls.map((pull, index) => pullCard(pull, index)).join("")}
    </div>
  `;
  document.querySelector("#again").addEventListener("click", () => renderOpen());
  document.querySelector("#to-collection").addEventListener("click", () => show("collection"));
  screen.querySelectorAll("[data-id]").forEach((node) => {
    node.addEventListener("click", () => {
      const pull = lastPulls[Number(node.dataset.index)];
      openCard(pull.card, pull.cond);
    });
  });
  bindTilt(screen);
  paintStats();
}

function renderCollection() {
  const setOptions = catalog.sets
    .map((set, index) => `<option value="${index}">${escapeHtml(set[1])}</option>`)
    .join("");
  screen.innerHTML = `
    <h1>Collection</h1>
    <p class="lead">Cards stay in this browser. Hover a card and it leans toward the cursor.</p>
    <div class="filters">
      <input id="q" type="search" placeholder="Search a name" aria-label="Search">
      <select id="set-filter" aria-label="Set"><option value="">Every set</option>${setOptions}</select>
      <select id="sort" aria-label="Sort">
        <option value="value">Highest value</option>
        <option value="rarity">Rarest</option>
        <option value="name">Name</option>
      </select>
    </div>
    <div id="owned" class="grid"></div>
  `;
  const draw = () => {
    const query = document.querySelector("#q").value.trim().toLowerCase();
    const setFilter = document.querySelector("#set-filter").value;
    const sort = document.querySelector("#sort").value;
    const owned = ownedEntries().filter((entry) => {
      if (setFilter !== "" && entry.card.set !== Number(setFilter)) return false;
      if (query && !entry.card.name.toLowerCase().includes(query)) return false;
      return true;
    });
    owned.sort((a, b) => {
      if (sort === "name") return a.card.name.localeCompare(b.card.name);
      if (sort === "rarity") return b.card.tier - a.card.tier || b.bestValue - a.bestValue;
      return b.bestValue - a.bestValue;
    });
    const host = document.querySelector("#owned");
    host.innerHTML = owned.length
      ? owned.map((entry) => ownedCard(entry)).join("")
      : "<p class='empty'>Nothing saved yet. Open a pack and the cards land here.</p>";
    host.querySelectorAll("[data-id]").forEach((node) => {
      node.addEventListener("click", () => {
        const card = byId.get(Number(node.dataset.id));
        openCard(card, Number(node.dataset.cond));
      });
    });
    bindTilt(host);
  };
  document.querySelector("#q").addEventListener("input", draw);
  document.querySelector("#set-filter").addEventListener("change", draw);
  document.querySelector("#sort").addEventListener("change", draw);
  draw();
}

function renderDex() {
  const unique = uniqueCount();
  const rows = catalog.sets.map((set, index) => {
    const pool = bySet.get(index) || [];
    const have = pool.filter((card) => copies(card.id) > 0).length;
    const pct = pool.length ? Math.round((have / pool.length) * 100) : 0;
    return { index, name: set[1], code: set[0], have, total: pool.length, pct };
  }).sort((a, b) => b.pct - a.pct || b.have - a.have);
  screen.innerHTML = `
    <h1>Dex</h1>
    <p class="lead">${unique.toLocaleString()} of ${cards.length.toLocaleString()} cards registered.</p>
    <div class="dex-list">
      ${rows.map((row) => `
        <button type="button" class="dex-row" data-set="${row.index}">
          <strong>${escapeHtml(row.name)}</strong>
          <span>${row.have} / ${row.total}</span>
          <div class="bar"><i style="width:${row.pct}%"></i></div>
        </button>
      `).join("")}
    </div>
  `;
  screen.querySelectorAll("[data-set]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSet = Number(button.dataset.set);
      show("collection");
      const select = document.querySelector("#set-filter");
      if (select) {
        select.value = String(selectedSet);
        select.dispatchEvent(new Event("change"));
      }
    });
  });
}

function renderTrade() {
  screen.innerHTML = `
    <h1>Trading hub</h1>
    <div class="trade-card">
      <div class="trade-art" aria-hidden="true"></div>
      <p>Trading comes later. For now every card stays on this device, and nothing on the site can be bought.</p>
    </div>
  `;
}

function renderMenu() {
  const dark = document.documentElement.dataset.theme === "dark";
  screen.innerHTML = `
    <h1>Menu</h1>
    <div class="panel">
      <label class="field">Trainer name
        <input id="name" maxlength="24" value="${escapeHtml(profile.name)}">
      </label>
      <div class="toolbar">
        <button type="button" class="btn" id="save-name">Save name</button>
        <button type="button" class="btn ghost" id="theme">${dark ? "Light mode" : "Dark mode"}</button>
        <button type="button" class="btn ghost" id="reset">Reset collection</button>
      </div>
    </div>
  `;
  document.querySelector("#save-name").addEventListener("click", () => {
    profile.name = document.querySelector("#name").value.trim() || "Trainer";
    persist();
    paintStats();
  });
  document.querySelector("#theme").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    renderMenu();
  });
  document.querySelector("#reset").addEventListener("click", () => {
    if (!confirm("Erase every card saved in this browser?")) return;
    profile = blankProfile();
    persist();
    show("home");
  });
}

function openCard(card, cond) {
  if (!card) return;
  const owned = profile.owned[String(card.id)] || [0, 0, 0, 0, 0];
  const drop = COND_DROP[cond];
  const effective = Math.max(0, card.tier - drop);
  modalCard.innerHTML = `
    <div class="tilt tier-${card.tier}" data-large="1">${cardFace(card, cond, true)}</div>
    <div>
      <h2 id="modal-title">${escapeHtml(card.name)}</h2>
      <p>${escapeHtml(catalog.sets[card.set][1])} · ${escapeHtml(card.number || "—")}</p>
      <p>${escapeHtml(catalog.rarities[card.rarity])} · 1 in ${oneIn(card.tier).toLocaleString()}</p>
      <p>${escapeHtml(catalog.conditions[cond])} · ${money(valueOf(card, cond))}</p>
      ${drop ? `<p class="drop">This condition drops it to ${catalog.tiers[effective]}.</p>` : ""}
      <p>You own ${owned.reduce((sum, count) => sum + count, 0)} ${owned.reduce((sum, count) => sum + count, 0) === 1 ? "copy" : "copies"}.</p>
      <div class="odds">${catalog.conditions.map((name, index) => `<span>${escapeHtml(name)} ${owned[index] || 0}</span>`).join("")}</div>
      <button type="button" class="btn ghost" id="close-modal">Close</button>
    </div>
  `;
  modal.hidden = false;
  document.querySelector("#close-modal").addEventListener("click", closeModal);
  bindTilt(modalCard);
}

function closeModal() {
  modal.hidden = true;
  modalCard.innerHTML = "";
}

function packButton(setIndex) {
  return `<button type="button" class="pack-hit" data-pack="${setIndex == null ? "all" : setIndex}">${packFace(setIndex, false)}</button>`;
}

function packFace(setIndex, large) {
  const pool = poolFor(setIndex);
  const artCard = [...pool].sort((a, b) => b.tier - a.tier)[0];
  const hue = setIndex == null ? 190 : (setIndex * 47) % 360;
  const code = setIndex == null ? "All" : catalog.sets[setIndex][0];
  const name = setIndex == null ? "Every card" : catalog.sets[setIndex][1];
  const image = artCard ? `<img alt="" src="${art(artCard.id, false)}">` : "";
  return `<div class="pack ${setIndex == null ? "is-all" : ""}" style="--h:${hue}">
    <span class="set-code">${escapeHtml(code)}</span>
    ${image}
    <span class="set-name">${escapeHtml(name)}</span>
  </div>`;
}

function pullCard(pull, index) {
  const delay = Math.min(index, 9) * 0.05;
  return `<button type="button" class="tilt tier-${pull.card.tier}" data-id="${pull.card.id}" data-index="${index}" style="animation-delay:${delay}s">
    ${cardFace(pull.card, pull.cond, false, pull.fresh)}
  </button>`;
}

function ownedCard(entry) {
  return `<button type="button" class="tilt tier-${entry.card.tier}" data-id="${entry.card.id}" data-cond="${entry.bestCond}">
    ${cardFace(entry.card, entry.bestCond, false)}
    <span class="count-badge">×${entry.total}</span>
  </button>`;
}

function cardFace(card, cond, large, fresh) {
  const worth = money(valueOf(card, cond));
  return `<div class="tilt-inner">
    <div class="card-face">
      <img alt="${escapeHtml(card.name)}" src="${art(card.id, large)}">
      <div class="sheen"></div>
      ${fresh ? '<span class="new-badge">NEW</span>' : ""}
      <div class="tag"><span>${escapeHtml(catalog.conditions[cond])}</span><span>${worth}</span></div>
    </div>
  </div>`;
}

function bindTilt(root) {
  root.querySelectorAll(".tilt").forEach((node) => {
    const inner = node.querySelector(".tilt-inner");
    const sheen = node.querySelector(".sheen");
    if (!inner) return;
    node.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      const box = node.getBoundingClientRect();
      const px = (event.clientX - box.left) / box.width;
      const py = (event.clientY - box.top) / box.height;
      inner.style.transform = `rotateX(${(0.5 - py) * 16}deg) rotateY(${(px - 0.5) * 22}deg)`;
      if (sheen) {
        sheen.style.background = `radial-gradient(circle at ${px * 100}% ${py * 100}%, rgba(255,255,255,.72), rgba(120,220,255,.18) 28%, transparent 52%)`;
      }
    });
    node.addEventListener("pointerleave", () => {
      inner.style.transform = "";
    });
  });
}

function poolFor(setIndex) {
  if (setIndex == null) return cards;
  return bySet.get(setIndex) || [];
}

function rollOne(pool) {
  const buckets = [[], [], [], [], [], [], []];
  for (const card of pool) buckets[Math.min(card.tier, 6)].push(card);
  let tier = weighted(WEIGHTS);
  while (tier > 0 && buckets[tier].length === 0) tier -= 1;
  if (!buckets[tier] || buckets[tier].length === 0) {
    tier = buckets.findIndex((bucket) => bucket.length > 0);
  }
  const choices = buckets[tier];
  const card = choices[Math.floor(Math.random() * choices.length)];
  const cond = weighted(COND_WEIGHTS);
  return { card, cond, fresh: copies(card.id) === 0 };
}

function remember(pull) {
  const key = String(pull.card.id);
  if (!profile.owned[key]) profile.owned[key] = [0, 0, 0, 0, 0];
  profile.owned[key][pull.cond] += 1;
  profile.opened += 1;
  profile.xp += pull.fresh ? 12 : 1;
}

function valueOf(card, cond) {
  const listed = card.prices[cond];
  if (listed != null) return listed;
  const basis = card.prices[0] != null ? card.prices[0] : FALLBACK_CENTS[card.tier] || 25;
  return Math.max(1, Math.round(basis * COND_FACTOR[cond]));
}

function copies(id) {
  const row = profile.owned[String(id)];
  if (!row) return 0;
  return row.reduce((sum, count) => sum + count, 0);
}

function ownedEntries() {
  const entries = [];
  for (const [key, counts] of Object.entries(profile.owned)) {
    const card = byId.get(Number(key));
    if (!card) continue;
    const total = counts.reduce((sum, count) => sum + count, 0);
    if (!total) continue;
    let bestCond = 0;
    let bestValue = -1;
    counts.forEach((count, cond) => {
      if (!count) return;
      const worth = valueOf(card, cond);
      if (worth > bestValue) {
        bestValue = worth;
        bestCond = cond;
      }
    });
    entries.push({ card, total, bestCond, bestValue });
  }
  return entries;
}

function uniqueCount() {
  return ownedEntries().length;
}

function collectionWorth() {
  let total = 0;
  for (const entry of ownedEntries()) {
    const counts = profile.owned[String(entry.card.id)];
    counts.forEach((count, cond) => {
      total += count * valueOf(entry.card, cond);
    });
  }
  return total;
}

function paintStats() {
  const xp = profile.xp || 0;
  const level = 1 + Math.floor(xp / 80);
  const into = xp % 80;
  document.querySelector("#player-name").textContent = profile.name || "Trainer";
  document.querySelector("#level").textContent = String(level);
  document.querySelector("#xp-label").textContent = `${into} / 80 xp`;
  document.querySelector("#xp-bar").style.width = `${(into / 80) * 100}%`;
  document.querySelector("#level-ring").style.setProperty("--p", `${(into / 80) * 100}%`);
  document.querySelector("#stat-unique").textContent = uniqueCount().toLocaleString();
  document.querySelector("#stat-copies").textContent = (profile.opened || 0).toLocaleString();
  document.querySelector("#stat-worth").textContent = money(collectionWorth());
}

function oddsLine(pool) {
  const present = new Set(pool.map((card) => card.tier));
  return catalog.tiers.map((name, tier) => {
    if (!present.has(tier)) return "";
    return `<span>${escapeHtml(name)} · 1 in ${oneIn(tier).toLocaleString()}</span>`;
  }).join("");
}

function oneIn(tier) {
  const weight = WEIGHTS[tier] || 1;
  return Math.max(2, Math.round(WEIGHT_TOTAL / weight));
}

function weighted(weights) {
  let total = 0;
  for (const weight of weights) total += weight;
  let roll = Math.random() * total;
  for (let index = 0; index < weights.length; index += 1) {
    roll -= weights[index];
    if (roll < 0) return index;
  }
  return weights.length - 1;
}

function art(id, large) {
  const size = large ? "1000x1000" : "200x200";
  return `https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_${size}.jpg`;
}

function money(cents) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function loadProfile() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || "");
    if (parsed && typeof parsed === "object") return { ...blankProfile(), ...parsed };
  } catch (error) {
    /* a fresh trainer */
  }
  return blankProfile();
}

function blankProfile() {
  return { name: "Trainer", owned: {}, opened: 0, xp: 0 };
}

function persist() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(profile));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
