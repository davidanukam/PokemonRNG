"""Load, update, and save the pokedex archive.

Card checkpoints live in pokedex/sets so a long scrape can resume.
pokedex/dex.json is the file everything else should read.
"""

from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone

from scraper.constants import DEX_PATH, ERROR_LOG_PATH, POKEDEX_DIR, PROGRESS_PATH, SETS_DIR
from scraper.predict import predict_card


def card_id(set_code: str, number: str) -> str:
    return f"{set_code}-{number}"


def normalize_name(name: str) -> str:
    name = (name or "").casefold().replace("’", "'")
    return re.sub(r"\s+", " ", name).strip()


def number_key(number: str) -> tuple:
    match = re.match(r"(\d+)", str(number))
    return (int(match.group(1)) if match else 10**9, str(number))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class PokedexStore:
    def __init__(self):
        self.pokemon: list[dict] = []
        self.sets: list[dict] = []
        self.cards: dict[str, dict] = {}
        self.species_by_length: list[tuple[str, dict]] = []
        self.scraped_this_run = 0

    @classmethod
    def load(cls) -> "PokedexStore":
        store = cls()
        if DEX_PATH.exists():
            with DEX_PATH.open(encoding="utf-8") as handle:
                data = json.load(handle)
            store.pokemon = data.get("pokemon") or []
            store.sets = data.get("sets") or []
            for card in data.get("cards") or []:
                if card.get("id"):
                    store.cards[card["id"]] = card
        if SETS_DIR.exists():
            for path in sorted(SETS_DIR.glob("*.json")):
                with path.open(encoding="utf-8") as handle:
                    payload = json.load(handle)
                meta = payload.get("set")
                if meta and meta.get("code") and not any(item["code"] == meta["code"] for item in store.sets):
                    store.sets.append(meta)
                for card in payload.get("cards") or []:
                    if card.get("id"):
                        store.cards[card["id"]] = card
        for species in store.pokemon:
            species.setdefault("card_image", "")
            species.setdefault("card_ids", [])
        store.rebuild_species_index()
        return store

    def rebuild_species_index(self) -> None:
        ranked = [(normalize_name(species.get("name", "")), species) for species in self.pokemon]
        ranked.sort(key=lambda item: len(item[0]), reverse=True)
        self.species_by_length = [(name, species) for name, species in ranked if name]

    def replace_species(self, species_rows: list[dict]) -> int:
        previous = {
            (row.get("number"), normalize_name(row.get("name", ""))): row for row in self.pokemon
        }
        added = 0
        merged = []
        for row in species_rows:
            key = (str(row.get("number")), normalize_name(row.get("name", "")))
            existing = previous.get(key)
            if existing is None:
                added += 1
                merged.append(
                    {
                        "number": str(row.get("number")),
                        "pixel_image": row.get("pixel_image") or "",
                        "card_image": row.get("card_image") or "",
                        "name": row.get("name"),
                        "amount": str(row.get("amount") or "0"),
                        "card_ids": [],
                    }
                )
                continue
            existing["pixel_image"] = row.get("pixel_image") or existing.get("pixel_image") or ""
            existing["amount"] = str(row.get("amount") or existing.get("amount") or "0")
            existing["name"] = row.get("name") or existing.get("name")
            existing.setdefault("card_image", "")
            existing.setdefault("card_ids", [])
            merged.append(existing)
        self.pokemon = merged
        self.rebuild_species_index()
        return added

    def add_pokemon(
        self,
        number: str,
        name: str,
        pixel_image: str = "",
        amount: str = "0",
        card_image: str = "",
    ) -> dict:
        number = str(number)
        key = normalize_name(name)
        for species in self.pokemon:
            if species.get("number") == number and normalize_name(species.get("name", "")) == key:
                if pixel_image:
                    species["pixel_image"] = pixel_image
                if amount:
                    species["amount"] = str(amount)
                if card_image:
                    species["card_image"] = card_image
                self.compile(repredict=False)
                return species
        species = {
            "number": number,
            "pixel_image": pixel_image,
            "card_image": card_image,
            "name": name,
            "amount": str(amount),
            "card_ids": [],
        }
        self.pokemon.append(species)
        self.rebuild_species_index()
        self.compile(repredict=False)
        return species

    def replace_sets(self, sets: list[dict]) -> None:
        self.sets = sets

    def get_card(self, identifier: str) -> dict | None:
        return self.cards.get(identifier)

    def add_card(self, card: dict, *, repredict_all: bool = True) -> dict:
        """Insert or replace one card and refresh its price forecast.

        repredict_all refits every stored card before writing dex.json. Use that
        for a single new entry. The bulk scraper predicts the card it just saved,
        then refits the whole dex when the run finishes.
        """
        stored = self._prepare_card(card)
        self.cards[stored["id"]] = stored
        self._link_card(stored)
        self.write_set_file(stored["set_code"])
        self.scraped_this_run += 1
        self.write_progress(stored["id"])
        if repredict_all:
            self.compile(repredict=True)
        return stored

    def compile(self, *, repredict: bool, write_sets: bool = True) -> None:
        if repredict:
            for card in self.cards.values():
                card["prediction"] = predict_card(card.get("price_history"))
        self.relink()
        self._write_dex()
        if write_sets:
            for set_code in {card["set_code"] for card in self.cards.values() if card.get("set_code")}:
                self.write_set_file(set_code)

    def relink(self) -> None:
        best: dict[int, tuple] = {}
        for species in self.pokemon:
            species["card_ids"] = []
            best[id(species)] = ()
        for card in self.cards.values():
            species = self.match_species(card.get("name") or "")
            if species is None:
                card["pokedex_number"] = None
                card["pokemon_name"] = None
                continue
            card["pokedex_number"] = species.get("number")
            card["pokemon_name"] = species.get("name")
            species["card_ids"].append(card["id"])
            key = _recency(card)
            current = best[id(species)]
            if not current or key > current:
                best[id(species)] = key
                species["card_image"] = card.get("card_image") or species.get("card_image") or ""
        for species in self.pokemon:
            species["card_ids"] = sorted(
                species.get("card_ids") or [],
                key=lambda identifier: number_key(self.cards[identifier]["number"])
                if identifier in self.cards
                else (10**9, identifier),
            )

    def match_species(self, card_name: str) -> dict | None:
        norm = normalize_name(card_name)
        if not norm:
            return None
        for species_name, species in self.species_by_length:
            if norm == species_name or norm.startswith(species_name + " "):
                return species
        return None

    def write_set_file(self, set_code: str) -> None:
        code = _safe_code(set_code)
        cards = [card for card in self.cards.values() if card.get("set_code") == set_code]
        cards.sort(key=lambda card: number_key(card.get("number")))
        meta = next((item for item in self.sets if item.get("code") == set_code), {"code": set_code})
        _write_json(SETS_DIR / f"{code}.json", {"set": meta, "cards": cards})

    def write_progress(self, current: str | None = None) -> None:
        expected = sum(item.get("card_count") or 0 for item in self.sets)
        _write_json(
            PROGRESS_PATH,
            {
                "updated_at": now_iso(),
                "cards_saved": len(self.cards),
                "cards_expected": expected,
                "added_this_run": self.scraped_this_run,
                "current": current,
            },
        )

    def log_error(self, message: str) -> None:
        POKEDEX_DIR.mkdir(parents=True, exist_ok=True)
        with ERROR_LOG_PATH.open("a", encoding="utf-8") as handle:
            handle.write(f"{now_iso()} {message}\n")

    def ensure_market_set(self, meta: dict) -> dict:
        """Remember a TCGplayer set. Keep a Limitless name when the set is already here."""
        code = str(meta["code"]).upper()
        for item in self.sets:
            if item.get("code") == code:
                item["tcgplayer_set_id"] = meta.get("tcgplayer_set_id")
                item["tcgplayer_name"] = meta.get("name")
                item["tcgplayer_url"] = meta.get("url")
                if not item.get("release_date") and meta.get("release_date"):
                    item["release_date"] = meta["release_date"]
                return item
        item = {
            "code": code,
            "name": meta.get("name"),
            "series": meta.get("series"),
            "release_date": meta.get("release_date"),
            "card_count": meta.get("card_count"),
            "tcgplayer_set_id": meta.get("tcgplayer_set_id"),
            "tcgplayer_name": meta.get("name"),
            "tcgplayer_url": meta.get("url"),
        }
        self.sets.append(item)
        return item

    def upsert_market_card(self, spec: dict) -> dict:
        """Apply one TCGplayer product group. Image, USD, and conditions come from TCGplayer."""
        set_code = str(spec["set_code"]).upper()
        number = str(spec["number"])
        identifier = card_id(set_code, number)
        existing = dict(self.cards.get(identifier, {}))
        prices = dict(existing.get("prices") or {})
        if spec.get("usd") is not None:
            prices["usd"] = spec["usd"]
        prices["usd_source"] = "tcgplayer"
        prices["usd_condition"] = spec.get("usd_condition")
        prices["usd_printing"] = spec.get("usd_printing")
        prices["conditions"] = spec.get("conditions") or {}
        prices["printings"] = spec.get("printings") or {}
        history = _blank_history(existing.get("price_history"))
        if spec.get("usd") is not None and spec.get("observed_on"):
            _upsert_point(history["usd"], spec["observed_on"], spec["usd"])
        payload = {
            "set_code": set_code,
            "number": number,
            "card_image": spec.get("card_image"),
            "prices": prices,
            "price_history": history,
            "tcgplayer_name": spec.get("tcgplayer_name"),
            "tcgplayer_number": spec.get("number_display"),
            "tcgplayer_product_id": spec.get("product_id"),
            "tcgplayer_set_id": spec.get("set_id"),
            "tcgplayer_url": spec.get("product_url"),
            "tcgplayer_at": spec.get("observed_on"),
        }
        if spec.get("rarity"):
            payload["rarity"] = spec["rarity"]
        old_image = existing.get("card_image")
        if old_image and old_image != spec.get("card_image") and "tcgplayer-cdn.tcgplayer.com" not in old_image:
            if not existing.get("limitless_image"):
                payload["limitless_image"] = old_image
        if not existing:
            payload["name"] = spec.get("name")
            payload["set_name"] = spec.get("set_name")
            payload["release_date"] = spec.get("release_date")
        stored = self._prepare_card(payload)
        stored["tcgplayer_at"] = spec.get("observed_on")
        forecasts = spec.get("condition_forecasts") or {}
        if forecasts:
            stored.setdefault("prediction", {})
            stored["prediction"]["conditions"] = forecasts
        self.cards[stored["id"]] = stored
        self._link_card(stored)
        return stored

    def _prepare_card(self, card: dict) -> dict:
        if not card.get("set_code") or card.get("number") in (None, ""):
            raise ValueError("A card entry needs set_code and number")
        prepared = dict(self.cards.get(card_id(str(card["set_code"]).upper(), str(card["number"])), {}))
        for key, value in card.items():
            if value is not None:
                prepared[key] = value
        prepared["set_code"] = str(prepared["set_code"]).upper()
        prepared["number"] = str(prepared["number"])
        prepared["id"] = card_id(prepared["set_code"], prepared["number"])
        prepared["price_history"] = _blank_history(prepared.get("price_history"))
        prepared["prediction"] = predict_card(prepared["price_history"])
        prepared["scraped_at"] = prepared.get("scraped_at") or now_iso()
        prepared.setdefault("card_image", None)
        prepared.setdefault("prices", {"usd": None, "eur": None, "usd_url": None, "eur_url": None})
        return prepared

    def _link_card(self, card: dict) -> None:
        species = self.match_species(card.get("name") or "")
        if species is None:
            card["pokedex_number"] = None
            card["pokemon_name"] = None
            return
        card["pokedex_number"] = species.get("number")
        card["pokemon_name"] = species.get("name")
        identifiers = species.setdefault("card_ids", [])
        if card["id"] not in identifiers:
            identifiers.append(card["id"])
        if card.get("card_image") and _recency(card) >= _image_recency(species, self.cards):
            species["card_image"] = card["card_image"]

    def _write_dex(self) -> None:
        ordered = []
        seen = set()
        counts: dict[str, int] = {}
        for set_info in self.sets:
            code = set_info.get("code")
            group = [card for card in self.cards.values() if card.get("set_code") == code]
            group.sort(key=lambda card: number_key(card.get("number")))
            ordered.extend(group)
            seen.add(code)
            counts[code] = len(group)
        leftovers = [card for card in self.cards.values() if card.get("set_code") not in seen]
        leftovers.sort(key=lambda card: (card.get("set_code") or "", number_key(card.get("number"))))
        ordered.extend(leftovers)
        sets_out = []
        for set_info in self.sets:
            copied = dict(set_info)
            copied["cards_saved"] = counts.get(set_info.get("code"), 0)
            sets_out.append(copied)
        _write_json(
            DEX_PATH,
            {
                "updated_at": now_iso(),
                "pokemon": self.pokemon,
                "sets": sets_out,
                "cards": ordered,
            },
        )


def _upsert_point(points: list, day: str, price: float) -> None:
    for point in points:
        if point.get("date") == day:
            point["price"] = price
            return
    points.append({"date": day, "price": price})
    points.sort(key=lambda point: point.get("date") or "")


def _blank_history(history) -> dict:
    history = history or {}
    return {
        "usd": list(history.get("usd") or []),
        "eur": list(history.get("eur") or []),
    }


def _recency(card: dict) -> tuple:
    return (card.get("release_date") or "", number_key(card.get("number")), card.get("set_code") or "")


def _image_recency(species: dict, cards: dict[str, dict]) -> tuple:
    best = ("", (-1, ""), "")
    for identifier in species.get("card_ids") or []:
        card = cards.get(identifier)
        if card and card.get("card_image"):
            best = max(best, _recency(card))
    return best


def _safe_code(code: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", str(code))
    if not cleaned or cleaned in {".", ".."}:
        raise ValueError(f"Unsafe set code: {code}")
    return cleaned


def _write_json(path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    last_error = None
    for attempt in range(8):
        try:
            temporary.replace(path)
            return
        except PermissionError as exc:
            last_error = exc
            time.sleep(0.25 * (attempt + 1))
    try:
        path.write_bytes(temporary.read_bytes())
    except PermissionError:
        raise last_error
    else:
        temporary.unlink(missing_ok=True)
