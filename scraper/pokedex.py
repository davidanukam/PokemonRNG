"""Build and update the Limitless pokedex.

Species come from https://limitlesstcg.com/cards/pokedex.
Cards come from every international set on https://limitlesstcg.com/cards.

Add one species:

    add_pokemon("1", "Bulbasaur", pixel_image="...", amount="23")

Add or refresh one card. This refits every saved price forecast, because a
new successful entry means the stored histories may have changed:

    add_card({
        "set_code": "30C",
        "number": "1",
        "name": "Exeggcute",
        "card_image": "https://...",
        "prices": {"usd": 0.19, "eur": 0.05},
        "price_history": {"usd": [...], "eur": [...]},
    })
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from scraper.constants import BASE_URL
from scraper.http_client import LimitlessClient
from scraper.parse import (
    merge_list_row,
    parse_card_page,
    parse_price_history,
    parse_set_card_list,
    parse_sets,
    parse_species,
)
from scraper.store import PokedexStore, card_id, now_iso

POKEDEX_URL = f"{BASE_URL}/cards/pokedex"
SETS_URL = f"{BASE_URL}/cards"


def add_pokemon(
    number: str,
    name: str,
    pixel_image: str = "",
    card_image: str = "",
    amount: str = "0",
) -> dict:
    store = PokedexStore.load()
    return store.add_pokemon(number, name, pixel_image, amount, card_image)


def add_to_pokedex(
    card_number: str,
    pixel_image: str,
    card_image: str,
    card_name: str,
    card_amount: str,
) -> dict:
    """Upsert one species row and save pokedex/dex.json."""
    return add_pokemon(card_number, card_name, pixel_image, card_image, card_amount)


def add_card(card: dict) -> dict:
    """Upsert one card, refit every prediction, and save pokedex/dex.json."""
    store = PokedexStore.load()
    return store.add_card(card, repredict_all=True)


def add_entry(**fields) -> dict:
    """Add a card when set_code is present, otherwise add a species row."""
    if fields.get("set_code") or fields.get("set"):
        card = dict(fields)
        if "set" in card and "set_code" not in card:
            card["set_code"] = card.pop("set")
        return add_card(card)
    return add_pokemon(
        str(fields.get("number") or fields.get("card_number") or ""),
        str(fields.get("name") or fields.get("card_name") or ""),
        pixel_image=str(fields.get("pixel_image") or ""),
        card_image=str(fields.get("card_image") or ""),
        amount=str(fields.get("amount") or fields.get("card_amount") or "0"),
    )


def repredict() -> int:
    """Refit every card from the price history already saved in the dex."""
    store = PokedexStore.load()
    store.compile(repredict=True)
    return len(store.cards)


def make_pokedex(delay: float = 0.3) -> int:
    """Refresh the species index and keep any cards already saved."""
    client = LimitlessClient(delay=delay)
    store = PokedexStore.load()
    species = parse_species(client.get_text(POKEDEX_URL))
    if not species:
        raise RuntimeError("The pokedex page did not contain any species rows")
    added = store.replace_species(species)
    store.compile(repredict=False)
    print(
        f"Species index updated. New species: {added}. "
        f"Species in dex: {len(store.pokemon)}. Cards kept: {len(store.cards)}."
    )
    return added


def scrape_cards(
    set_codes: list[str] | None = None,
    limit: int = 0,
    refresh: bool = False,
    delay: float = 0.3,
) -> PokedexStore:
    """Download every international card, including prices and price history.

    Cards saved within the last 7 days are skipped unless refresh is set.
    Each saved card gets a new forecast immediately. After the run, every
    forecast in the dex is fit again from the histories on disk.
    """
    client = LimitlessClient(delay=delay)
    store = PokedexStore.load()
    sets = parse_sets(client.get_text(SETS_URL))
    if not sets:
        raise RuntimeError("No sets found on the Limitless cards page")
    store.replace_sets(sets)
    selected = sets
    if set_codes:
        wanted = {code.upper() for code in set_codes}
        selected = [item for item in sets if item["code"].upper() in wanted]
        missing = wanted - {item["code"].upper() for item in selected}
        if missing:
            raise ValueError(f"Unknown set code(s): {', '.join(sorted(missing))}")

    fetched = 0
    failures = 0
    try:
        for set_info in selected:
            rows = parse_set_card_list(
                client.get_text(
                    f"{set_info['url']}?display=list&show=all&unique=prints&sort=set"
                )
            )
            listed = set_info.get("card_count")
            print(
                f"{set_info['code']} {set_info['name']}: "
                f"{len(rows)} listed"
                + (f" of {listed}" if listed else ""),
                flush=True,
            )
            if listed and len(rows) < listed:
                store.log_error(
                    f"{set_info['code']} page listed {len(rows)} cards, expected {listed}"
                )
            for index, row in enumerate(rows, start=1):
                identifier = card_id(row["set_code"], row["number"])
                existing = store.get_card(identifier)
                if existing and not refresh and _fresh(existing):
                    continue
                if limit and fetched >= limit:
                    print(f"Stopped after {fetched} card page(s).", flush=True)
                    store.compile(repredict=True)
                    return store
                try:
                    card = _fetch_card(client, row, set_info)
                except Exception as exc:
                    failures += 1
                    store.log_error(f"{identifier} {exc}")
                    print(f"  failed {identifier}: {exc}", flush=True)
                    continue
                store.add_card(card, repredict_all=False)
                fetched += 1
                price = card["prices"]
                print(
                    f"  {index}/{len(rows)} {card['name']} "
                    f"USD {price.get('usd')} EUR {price.get('eur')} "
                    f"history {len(card['price_history']['usd'])}/"
                    f"{len(card['price_history']['eur'])}",
                    flush=True,
                )
            store.compile(repredict=False, write_sets=False)
        store.compile(repredict=True)
    except KeyboardInterrupt:
        print("Saving progress before stopping.", flush=True)
        store.compile(repredict=True)
        raise
    print(
        f"Card scrape finished. Fetched {fetched}. Failures {failures}. "
        f"Cards in dex: {len(store.cards)}.",
        flush=True,
    )
    return store


def scrape(url: str | None = None) -> int:
    """Backward-compatible species scrape. The url argument is ignored."""
    del url
    make_pokedex()
    return 200


def _fetch_card(client: LimitlessClient, row: dict, set_info: dict) -> dict:
    page_url = row["url"]
    parsed = parse_card_page(client.get_text(page_url), page_url)
    card = merge_list_row(parsed, row, set_info)
    history = {"usd": [], "eur": []}
    history_ok = True
    if card.get("limitless_id"):
        payload = client.get_json(f"{BASE_URL}/api/cards/{card['limitless_id']}/prices")
        history = parse_price_history(payload)
    card["price_history"] = history
    card["history_ok"] = history_ok
    card["scraped_at"] = now_iso()
    return card


def _fresh(card: dict) -> bool:
    """Skip cards saved recently so an interrupted run can resume."""
    if not card.get("history_ok"):
        return False
    scraped = str(card.get("scraped_at") or "")
    try:
        seen = datetime.fromisoformat(scraped)
    except ValueError:
        return False
    if seen.tzinfo is None:
        seen = seen.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - seen < timedelta(days=7)
