"""Build the compact card pool the pack site rolls from.

One product becomes one card. The price list is Near Mint, Lightly Played,
Moderately Played, Heavily Played, then Damaged, in cents.
"""

from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "pokedex" / "tcgplayer.sqlite"
OUT_PATH = Path(__file__).resolve().parent / "public" / "data" / "catalog.json"

SKIP_RARITY = {"", "Code Card", "None", "Unconfirmed"}
TIER_NAMES = ["Common", "Uncommon", "Rare", "Holo", "Ultra", "Secret", "Mythic"]
TIER_OF = {
    "Common": 0,
    "Uncommon": 1,
    "Rare": 2,
    "Promo": 2,
    "Holo Rare": 3,
    "Rare BREAK": 3,
    "Rare Ace": 3,
    "Classic Collection": 3,
    "Ultra Rare": 4,
    "Double Rare": 4,
    "Illustration Rare": 4,
    "Shiny Rare": 4,
    "ACE SPEC Rare": 4,
    "Radiant Rare": 4,
    "Prism Rare": 4,
    "Amazing Rare": 4,
    "Pikachu Rare": 4,
    "Secret Rare": 5,
    "Special Illustration Rare": 5,
    "Shiny Holo Rare": 5,
    "Shiny Ultra Rare": 5,
    "Rainbow Rare": 5,
    "Mega Attack Rare": 5,
    "Futuristic Rare": 5,
    "Black White Rare": 5,
    "RGB Rare": 5,
    "Hyper Rare": 6,
    "Mega Hyper Rare": 6,
}
PRINT_RANK = {"Normal": 0, "Holofoil": 1, "Reverse Holofoil": 2}
CONDITIONS = [
    "Near Mint",
    "Lightly Played",
    "Moderately Played",
    "Heavily Played",
    "Damaged",
]
FEATURED = ["MEW", "PRE", "SVI", "PFL", "30C", "BS", "OBF", "PAL", "TWM", "MEG"]


def clean_name(name: str, number: str) -> str:
    text = (name or "").strip()
    head = str(number or "").split("/")[0].strip()
    key = str(int(head)) if head.isdigit() else ""
    if key:
        cleaned = re.sub(
            rf"\s+-\s+0*{re.escape(key)}(?:/\d+)?(?=\s*(?:\(|$))",
            "",
            text,
            count=1,
        )
        if cleaned != text:
            return cleaned.strip()
    return text


def cents(value):
    if value is None:
        return None
    return int(round(float(value) * 100))


def build() -> dict:
    if not DB_PATH.exists():
        raise SystemExit(f"Missing {DB_PATH}. Run the TCGplayer download first.")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT p.product_id, p.printing, p.set_code, s.name AS set_name,
               p.name, p.number_display, p.rarity,
               pr.condition, pr.market_price
        FROM products p
        JOIN sets s ON s.set_id = p.set_id
        LEFT JOIN prices pr
          ON pr.product_id = p.product_id AND pr.printing = p.printing
        """
    )
    grouped: dict[int, dict] = {}
    for row in rows:
        rarity = (row["rarity"] or "").strip()
        if rarity in SKIP_RARITY:
            continue
        product_id = int(row["product_id"])
        printing = row["printing"] or "Normal"
        rank = PRINT_RANK.get(printing, 9)
        current = grouped.get(product_id)
        if current is None or rank < current["rank"]:
            grouped[product_id] = {
                "rank": rank,
                "printing": printing,
                "set_code": row["set_code"],
                "set_name": row["set_name"],
                "name": clean_name(row["name"] or "Card", row["number_display"] or ""),
                "number": row["number_display"] or "",
                "rarity": rarity,
                "prices": [None, None, None, None, None],
            }
            current = grouped[product_id]
        if rank == current["rank"] and row["condition"] in CONDITIONS:
            slot = CONDITIONS.index(row["condition"])
            current["prices"][slot] = cents(row["market_price"])
    conn.close()

    sets: list[list[str]] = []
    set_index: dict[str, int] = {}
    rarities: list[str] = []
    rarity_index: dict[str, int] = {}
    cards = []
    for product_id, item in grouped.items():
        code = item["set_code"]
        if code not in set_index:
            set_index[code] = len(sets)
            sets.append([code, item["set_name"] or code])
        rarity = item["rarity"]
        if rarity not in rarity_index:
            rarity_index[rarity] = len(rarities)
            rarities.append(rarity)
        cards.append(
            [
                product_id,
                item["name"],
                set_index[code],
                item["number"],
                TIER_OF.get(rarity, 3),
                rarity_index[rarity],
                item["prices"],
            ]
        )
    cards.sort(key=lambda card: (card[2], card[3], card[0]))
    present = {code for code, _name in sets}
    featured = [code for code in FEATURED if code in present]
    payload = {
        "tiers": TIER_NAMES,
        "conditions": CONDITIONS,
        "rarities": rarities,
        "sets": sets,
        "featured": featured,
        "cards": cards,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(
        f"Wrote {OUT_PATH} with {len(cards)} cards in {len(sets)} sets "
        f"({OUT_PATH.stat().st_size // 1024} KB)."
    )
    return payload


if __name__ == "__main__":
    build()
