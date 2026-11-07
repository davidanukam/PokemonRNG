"""Download Pokémon price guides from TCGplayer.

The guide the site loads is one JSON list per set:

    GET https://infinite-api.tcgplayer.com/priceguide/set/{setId}/cards/

Each row is a printing plus a condition (Near Mint, Lightly Played,
Moderately Played, Heavily Played, Damaged, and any other grade the
guide returns). The set list is the catalog dropdown:

    GET https://mpapi.tcgplayer.com/v2/Catalog/SetNames?categoryId=3

TCGplayer wins when it disagrees with a card already in the dex: the
image URL, the USD price, and the condition prices. Card text and the
EUR series stay.
"""

from __future__ import annotations

import re
import time
from datetime import datetime, timezone

import requests

from scraper.constants import (
    CARDS_PRODUCT_TYPE_ID,
    POKEMON_CATEGORY_ID,
    TCGPLAYER_CATALOG_API,
    TCGPLAYER_IMAGE,
    TCGPLAYER_INFINITE_API,
    TCGPLAYER_PROGRESS_PATH,
    USER_AGENT,
)
from scraper.predict import predict_series
from scraper.store import PokedexStore, _write_json, card_id, normalize_name, now_iso
from scraper.tcg_db import TcgDatabase

GRADES = (
    "Near Mint",
    "Lightly Played",
    "Moderately Played",
    "Heavily Played",
    "Damaged",
)
PRINTING_ORDER = ("Normal", "Holofoil", "Reverse Holofoil")
PRICE_GUIDE_URL = (
    "https://www.tcgplayer.com/categories/trading-and-collectible-card-games/"
    "pokemon/price-guides/{slug}"
)


class TcgClient:
    def __init__(self, delay: float = 0.3, timeout: float = 45):
        self.delay = delay
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": USER_AGENT,
                "Accept": "application/json",
                "Referer": "https://www.tcgplayer.com/",
                "Origin": "https://www.tcgplayer.com",
            }
        )
        self._next_at = 0.0

    def get_json(self, url: str) -> dict:
        last_error: Exception | None = None
        for attempt in range(4):
            self._wait()
            try:
                response = self.session.get(url, timeout=self.timeout)
            except requests.RequestException as exc:
                last_error = exc
                time.sleep(min(30, 1.5 ** attempt))
                continue
            if response.status_code in {429, 500, 502, 503, 504}:
                retry_after = response.headers.get("Retry-After")
                try:
                    pause = float(retry_after) if retry_after else min(30, 1.5 ** attempt)
                except ValueError:
                    pause = min(30, 1.5 ** attempt)
                time.sleep(pause)
                last_error = requests.HTTPError(f"{response.status_code} for {url}")
                continue
            response.raise_for_status()
            return response.json()
        raise requests.RequestException(f"Failed to fetch {url}") from last_error

    def _wait(self) -> None:
        now = time.monotonic()
        if now < self._next_at:
            time.sleep(self._next_at - now)
        self._next_at = time.monotonic() + self.delay


def scrape_tcgplayer(
    set_filters: list[str] | None = None,
    *,
    refresh: bool = False,
    delay: float = 0.3,
) -> PokedexStore:
    client = TcgClient(delay=delay)
    database = TcgDatabase()
    store = PokedexStore.load()
    observed_on = datetime.now(timezone.utc).date().isoformat()
    try:
        catalog = _assign_codes(_fetch_sets(client))
        chosen = _filter_sets(catalog, set_filters)
        if set_filters and not chosen:
            known = ", ".join(item["code"] for item in catalog[:8])
            raise SystemExit(
                "No TCGplayer set matched "
                + ", ".join(set_filters)
                + f". Codes look like 30C or me-30th-celebration. First codes: {known}"
            )
        print(f"TCGplayer sets to read: {len(chosen)} of {len(catalog)}.", flush=True)
        done = 0
        for index, meta in enumerate(chosen, start=1):
            label = f"{meta['code']} {meta['name']}"
            if not refresh and database.is_fresh(meta["set_id"]):
                print(f"{index}/{len(chosen)} {label}: saved in the last 7 days", flush=True)
                continue
            try:
                rows = _fetch_cards(client, meta["set_id"])
            except Exception as exc:
                store.log_error(f"tcgplayer {label}: {exc}")
                print(f"{index}/{len(chosen)} {label}: failed ({exc})", flush=True)
                continue
            products = _products_from_rows(rows)
            database.save_observations(meta, products, observed_on)
            updated = _merge_set(store, database, meta, products, observed_on)
            database.mark_scraped(meta["set_id"], now_iso())
            store.write_set_file(meta["code"])
            done += 1
            _write_progress(done, len(chosen), meta["code"], len(store.cards))
            print(
                f"{index}/{len(chosen)} {label}: {len(products)} printings, "
                f"{updated} cards",
                flush=True,
            )
        store.compile(repredict=True)
        _attach_condition_forecasts(store, database)
        print(f"TCGplayer finished. Cards in the dex: {len(store.cards)}.", flush=True)
    except KeyboardInterrupt:
        print("Saving the dex before stopping.", flush=True)
        store.compile(repredict=True)
        raise
    finally:
        database.close()
    return store


def rematch_saved() -> PokedexStore:
    """Apply the saved price rows onto the dex again.

    Use this after a matching change. It does not download the guides again.
    """
    database = TcgDatabase()
    store = PokedexStore.load()
    try:
        catalog = database.saved_sets()
        print(f"Rematching {len(catalog)} saved sets.", flush=True)
        for index, meta in enumerate(catalog, start=1):
            products, observed_on = database.products_for(meta["set_id"])
            if not products:
                print(f"{index}/{len(catalog)} {meta['code']} {meta['name']}: no products", flush=True)
                continue
            updated = _merge_set(store, database, meta, products, observed_on)
            store.write_set_file(meta["code"])
            print(
                f"{index}/{len(catalog)} {meta['code']} {meta['name']}: "
                f"{len(products)} printings, {updated} cards",
                flush=True,
            )
        store.compile(repredict=True)
        _attach_condition_forecasts(store, database)
        print(f"Rematch finished. Cards in the dex: {len(store.cards)}.", flush=True)
    finally:
        database.close()
    return store


def _fetch_sets(client: TcgClient) -> list[dict]:
    found = []
    offset = 0
    while True:
        url = (
            f"{TCGPLAYER_CATALOG_API}/v2/Catalog/SetNames"
            f"?categoryId={POKEMON_CATEGORY_ID}&active=true&released=true"
            f"&limit=200&offset={offset}"
        )
        payload = client.get_json(url)
        page = payload.get("results") or []
        found.extend(page)
        if len(page) < 200:
            break
        offset += 200
    return found


def _assign_codes(rows: list[dict]) -> list[dict]:
    ordered = sorted(rows, key=lambda row: (row.get("releaseDate") or "", row.get("setNameId") or 0))
    used: dict[str, int] = {}
    catalog = []
    for row in ordered:
        set_id = int(row["setNameId"])
        abbreviation = (row.get("abbreviation") or "").strip().upper()
        if not abbreviation:
            code = f"TCG{set_id}"
        elif abbreviation not in used:
            code = abbreviation
            used[abbreviation] = set_id
        else:
            code = f"{abbreviation}-{set_id}"
        release = str(row.get("releaseDate") or "")[:10] or None
        slug = row.get("urlName") or ""
        catalog.append(
            {
                "set_id": set_id,
                "code": code,
                "name": row.get("name"),
                "url_name": slug,
                "abbreviation": abbreviation,
                "release_date": release,
                "active": bool(row.get("active")),
                "supplemental": bool(row.get("isSupplemental")),
                "url": PRICE_GUIDE_URL.format(slug=slug),
            }
        )
    catalog.sort(key=lambda item: item["name"] or "")
    return catalog


def _filter_sets(catalog: list[dict], filters: list[str] | None) -> list[dict]:
    if not filters:
        return catalog
    wanted = {item.strip().casefold() for item in filters if item.strip()}
    chosen = []
    for meta in catalog:
        keys = {
            meta["code"].casefold(),
            (meta.get("abbreviation") or "").casefold(),
            (meta.get("url_name") or "").casefold(),
            str(meta["set_id"]),
            (meta.get("name") or "").casefold(),
        }
        if wanted & keys:
            chosen.append(meta)
    return chosen


def _fetch_cards(client: TcgClient, set_id: int) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    total = None
    while True:
        url = (
            f"{TCGPLAYER_INFINITE_API}/priceguide/set/{set_id}/cards/"
            f"?rows=5000&offset={offset}&productTypeID={CARDS_PRODUCT_TYPE_ID}"
        )
        payload = client.get_json(url)
        page = payload.get("result") or []
        if total is None:
            total = int(payload.get("count") or len(page))
        rows.extend(page)
        if not page or len(rows) >= total:
            break
        offset += len(page)
    return rows


def _products_from_rows(rows: list[dict]) -> list[dict]:
    grouped: dict[tuple, dict] = {}
    for row in rows:
        product_id = int(row["productID"])
        printing = (row.get("printing") or "").strip() or "Unknown"
        key = (product_id, printing)
        product = grouped.get(key)
        if product is None:
            number_display = str(row.get("number") or "").strip()
            product = {
                "product_id": product_id,
                "printing": printing,
                "name": (row.get("productName") or "").strip(),
                "number_display": number_display,
                "collector_key": collector_key(number_display),
                "rarity": row.get("rarity") or None,
                "image_url": TCGPLAYER_IMAGE.format(product_id=product_id),
                "conditions": {},
            }
            grouped[key] = product
        grade = split_grade(row.get("condition"), printing)
        product["conditions"][grade] = {
            "market": money(row.get("marketPrice")),
            "low": money(row.get("lowPrice")),
            "sales": count(row.get("sales")),
        }
    return list(grouped.values())


def _merge_set(
    store: PokedexStore,
    database: TcgDatabase,
    meta: dict,
    products: list[dict],
    observed_on: str,
) -> int:
    store.ensure_market_set(meta)
    _drop_split_duplicates(store, meta["code"], products)
    by_product, by_number = _index_cards(store, meta["code"])
    claimed: set[str] = set()
    reserved: set[str] = set()
    updated = 0
    clusters: dict[tuple, list[dict]] = {}
    for product in products:
        name_key = normalize_name(display_name(product["name"], product["number_display"]))
        clusters.setdefault((product["collector_key"], name_key), []).append(product)

    for (collector, name_key), group in clusters.items():
        existing = _match_existing(group, collector, name_key, by_product, by_number, claimed)
        if existing is not None:
            number = str(existing["number"])
            claimed.add(existing["id"])
        else:
            number = _fresh_number(meta["code"], collector, group, store, reserved)
            reserved.add(card_id(meta["code"], number))
        spec = _spec_for_group(meta, group, number, observed_on)
        store.upsert_market_card(spec)
        updated += 1
    return updated


def _drop_split_duplicates(store: PokedexStore, set_code: str, products: list[dict]) -> None:
    """Fold a product that was saved beside the Limitless card back onto that card."""
    by_number = {}
    for card in store.cards.values():
        if card.get("set_code") == set_code:
            by_number[str(card.get("number"))] = card
    for product in products:
        base = product.get("collector_key") or ""
        if not base:
            continue
        extra = by_number.get(f"{base}-{product['product_id']}")
        original = by_number.get(base)
        if extra is None or original is None or extra["id"] == original["id"]:
            continue
        product_name = normalize_name(display_name(product["name"], product.get("number_display") or ""))
        if _names_compatible(normalize_name(original.get("name") or ""), product_name):
            store.cards.pop(extra["id"], None)


def _index_cards(store: PokedexStore, set_code: str):
    by_product: dict[int, dict] = {}
    by_number: dict[str, list[dict]] = {}
    for card in store.cards.values():
        if card.get("set_code") != set_code:
            continue
        for product_id in _card_product_ids(card):
            by_product[product_id] = card
        by_number.setdefault(collector_key(str(card.get("number") or "")), []).append(card)
    return by_product, by_number


def _card_product_ids(card: dict) -> list[int]:
    found = []
    current = card.get("tcgplayer_product_id")
    if isinstance(current, int):
        found.append(current)
    elif isinstance(current, str) and current.isdigit():
        found.append(int(current))
    printings = (card.get("prices") or {}).get("printings") or {}
    if isinstance(printings, dict):
        for printing in printings.values():
            product_id = printing.get("product_id") if isinstance(printing, dict) else None
            if isinstance(product_id, int):
                found.append(product_id)
    url = (card.get("prices") or {}).get("usd_url") or ""
    match = re.search(r"/product/(\d+)", url)
    if match:
        found.append(int(match.group(1)))
    return found


def _match_existing(group, collector, name_key, by_product, by_number, claimed):
    for product in group:
        card = by_product.get(product["product_id"])
        if card is not None and card["id"] not in claimed:
            return card
    if not collector:
        return None
    candidates = []
    for card in by_number.get(collector, []):
        if card["id"] in claimed:
            continue
        if _names_compatible(normalize_name(card.get("name") or ""), name_key):
            candidates.append(card)
    if len(candidates) == 1:
        return candidates[0]
    exact = [card for card in candidates if normalize_name(card.get("name") or "") == name_key]
    if len(exact) == 1:
        return exact[0]
    return None


def _fresh_number(set_code, collector, group, store, reserved) -> str:
    product_id = _preferred(group)["product_id"]
    base = collector or f"p{product_id}"
    identifier = card_id(set_code, base)
    if identifier not in store.cards and identifier not in reserved:
        return base
    return f"{base}-{product_id}"


def _names_compatible(card_name: str, product_name: str) -> bool:
    if not card_name or not product_name:
        return False
    if card_name == product_name:
        return True
    return (
        product_name.startswith(card_name + " ")
        or card_name.startswith(product_name + " ")
        or product_name.endswith(" " + card_name)
        or card_name.endswith(" " + product_name)
    )


def _spec_for_group(meta, group, number, observed_on) -> dict:
    preferred = _preferred(group)
    printings = {}
    for product in group:
        grades = {
            grade: {
                "market": price.get("market"),
                "low": price.get("low"),
                "sales": price.get("sales"),
            }
            for grade, price in product["conditions"].items()
        }
        printings[product["printing"]] = {
            "product_id": product["product_id"],
            "image": product["image_url"],
            "rarity": product.get("rarity"),
            "conditions": grades,
        }
    conditions = printings[preferred["printing"]]["conditions"]
    near_mint = conditions.get("Near Mint") or {}
    usd = near_mint.get("market")
    return {
        "set_code": meta["code"],
        "set_id": meta["set_id"],
        "set_name": meta["name"],
        "release_date": meta.get("release_date"),
        "number": number,
        "number_display": preferred.get("number_display"),
        "name": display_name(preferred["name"], preferred.get("number_display") or ""),
        "tcgplayer_name": preferred["name"],
        "rarity": preferred.get("rarity"),
        "card_image": preferred["image_url"],
        "product_id": preferred["product_id"],
        "product_url": f"https://www.tcgplayer.com/product/{preferred['product_id']}",
        "printings": printings,
        "conditions": conditions,
        "usd": usd,
        "usd_condition": "Near Mint" if usd is not None else None,
        "usd_printing": preferred["printing"],
        "observed_on": observed_on,
    }


def _attach_condition_forecasts(store: PokedexStore, database: TcgDatabase) -> None:
    product_ids = []
    for card in store.cards.values():
        product_ids.extend(_card_product_ids(card))
    history = database.condition_history(sorted(set(product_ids)))
    if not history:
        return
    changed = False
    for card in store.cards.values():
        printings = (card.get("prices") or {}).get("printings") or {}
        if not isinstance(printings, dict):
            continue
        preferred_name = (card.get("prices") or {}).get("usd_printing")
        printing = printings.get(preferred_name) if preferred_name else None
        if not isinstance(printing, dict):
            continue
        product_id = printing.get("product_id")
        forecasts = {}
        for grade in printing.get("conditions") or {}:
            points = history.get((product_id, preferred_name, grade)) or []
            forecast = predict_series(points, 30)
            if forecast is not None:
                forecasts[grade] = forecast
        if not forecasts:
            continue
        card.setdefault("prediction", {})
        card["prediction"]["conditions"] = forecasts
        changed = True
    if changed:
        store.compile(repredict=False)


def _preferred(group: list[dict]) -> dict:
    by_name = {product["printing"]: product for product in group}
    for name in PRINTING_ORDER:
        if name in by_name:
            return by_name[name]
    return sorted(group, key=lambda product: product["printing"])[0]


def _write_progress(done: int, total: int, current: str, cards: int) -> None:
    _write_json(
        TCGPLAYER_PROGRESS_PATH,
        {
            "updated_at": now_iso(),
            "sets_saved": done,
            "sets_expected": total,
            "cards_in_dex": cards,
            "current": current,
        },
    )


def collector_key(number: str) -> str:
    raw = str(number or "").strip()
    if not raw:
        return ""
    head = raw.split("/")[0].strip()
    if re.fullmatch(r"\d+", head):
        return str(int(head))
    return head


def display_name(name: str, number_display: str) -> str:
    """Drop the collector number TCGplayer appends to the product name."""
    text = (name or "").strip()
    key = collector_key(number_display)
    if key.isdigit():
        cleaned = re.sub(
            rf"\s+-\s+0*{re.escape(key)}(?:/\d+)?(?=\s*(?:\(|$))",
            "",
            text,
            count=1,
        )
        if cleaned != text:
            return cleaned.strip()
    suffix = f" - {number_display}" if number_display else ""
    if suffix and text.endswith(suffix):
        return text[: -len(suffix)].strip()
    return text


def split_grade(condition: str | None, printing: str | None) -> str:
    text = (condition or "").strip()
    printing = (printing or "").strip()
    if printing and text.lower().endswith(printing.lower()):
        text = text[: -len(printing)].strip(" -")
    for grade in GRADES:
        if text.lower() == grade.lower():
            return grade
    return text or "Unknown"


def money(value):
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in {float("inf"), float("-inf")}:
        return None
    return round(number, 2)


def count(value):
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
