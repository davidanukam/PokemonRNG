"""SQLite store for TCGplayer price-guide rows.

One row per product, printing, condition, and day. The JSON dex keeps the
latest snapshot. This file keeps the daily observations so a later scrape
can forecast each condition.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

from scraper.constants import TCGPLAYER_DB_PATH


class TcgDatabase:
    def __init__(self, path=TCGPLAYER_DB_PATH):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS sets (
                set_id INTEGER PRIMARY KEY,
                code TEXT,
                name TEXT,
                url_name TEXT,
                abbreviation TEXT,
                release_date TEXT,
                active INTEGER,
                supplemental INTEGER,
                product_count INTEGER,
                scraped_at TEXT
            );
            CREATE TABLE IF NOT EXISTS products (
                product_id INTEGER NOT NULL,
                printing TEXT NOT NULL,
                set_id INTEGER,
                set_code TEXT,
                name TEXT,
                number_display TEXT,
                rarity TEXT,
                image_url TEXT,
                updated_at TEXT,
                PRIMARY KEY (product_id, printing)
            );
            CREATE TABLE IF NOT EXISTS prices (
                product_id INTEGER NOT NULL,
                printing TEXT NOT NULL,
                condition TEXT NOT NULL,
                observed_on TEXT NOT NULL,
                market_price REAL,
                low_price REAL,
                sales INTEGER,
                PRIMARY KEY (product_id, printing, condition, observed_on)
            );
            CREATE INDEX IF NOT EXISTS idx_prices_product
                ON prices (product_id, printing, observed_on);
            """
        )

    def close(self) -> None:
        self.conn.close()

    def is_fresh(self, set_id: int, days: int = 7) -> bool:
        row = self.conn.execute(
            "SELECT scraped_at FROM sets WHERE set_id = ?",
            (set_id,),
        ).fetchone()
        if row is None or not row["scraped_at"]:
            return False
        try:
            seen = datetime.fromisoformat(row["scraped_at"])
        except ValueError:
            return False
        if seen.tzinfo is None:
            seen = seen.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) - seen < timedelta(days=days)

    def save_observations(self, meta: dict, products: list[dict], observed_on: str) -> None:
        with self.conn:
            self.conn.execute(
                """
                INSERT INTO sets (
                    set_id, code, name, url_name, abbreviation, release_date,
                    active, supplemental, product_count, scraped_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
                ON CONFLICT(set_id) DO UPDATE SET
                    code = excluded.code,
                    name = excluded.name,
                    url_name = excluded.url_name,
                    abbreviation = excluded.abbreviation,
                    release_date = excluded.release_date,
                    active = excluded.active,
                    supplemental = excluded.supplemental,
                    product_count = excluded.product_count
                """,
                (
                    meta["set_id"],
                    meta["code"],
                    meta["name"],
                    meta.get("url_name"),
                    meta.get("abbreviation"),
                    meta.get("release_date"),
                    1 if meta.get("active") else 0,
                    1 if meta.get("supplemental") else 0,
                    len(products),
                ),
            )
            for product in products:
                self.conn.execute(
                    """
                    INSERT INTO products (
                        product_id, printing, set_id, set_code, name,
                        number_display, rarity, image_url, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(product_id, printing) DO UPDATE SET
                        set_id = excluded.set_id,
                        set_code = excluded.set_code,
                        name = excluded.name,
                        number_display = excluded.number_display,
                        rarity = excluded.rarity,
                        image_url = excluded.image_url,
                        updated_at = excluded.updated_at
                    """,
                    (
                        product["product_id"],
                        product["printing"],
                        meta["set_id"],
                        meta["code"],
                        product["name"],
                        product.get("number_display"),
                        product.get("rarity"),
                        product.get("image_url"),
                        observed_on,
                    ),
                )
                for grade, price in product["conditions"].items():
                    self.conn.execute(
                        """
                        INSERT INTO prices (
                            product_id, printing, condition, observed_on,
                            market_price, low_price, sales
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(product_id, printing, condition, observed_on)
                        DO UPDATE SET
                            market_price = excluded.market_price,
                            low_price = excluded.low_price,
                            sales = excluded.sales
                        """,
                        (
                            product["product_id"],
                            product["printing"],
                            grade,
                            observed_on,
                            price.get("market"),
                            price.get("low"),
                            price.get("sales"),
                        ),
                    )

    def mark_scraped(self, set_id: int, when: str) -> None:
        with self.conn:
            self.conn.execute(
                "UPDATE sets SET scraped_at = ? WHERE set_id = ?",
                (when, set_id),
            )

    def saved_sets(self) -> list[dict]:
        rows = self.conn.execute(
            """
            SELECT set_id, code, name, url_name, abbreviation, release_date,
                   active, supplemental
            FROM sets
            ORDER BY name
            """
        ).fetchall()
        found = []
        for row in rows:
            slug = row["url_name"] or ""
            found.append(
                {
                    "set_id": row["set_id"],
                    "code": row["code"],
                    "name": row["name"],
                    "url_name": slug,
                    "abbreviation": row["abbreviation"] or "",
                    "release_date": row["release_date"],
                    "active": bool(row["active"]),
                    "supplemental": bool(row["supplemental"]),
                    "url": (
                        "https://www.tcgplayer.com/categories/trading-and-collectible-card-games/"
                        f"pokemon/price-guides/{slug}"
                    ),
                }
            )
        return found

    def products_for(self, set_id: int) -> tuple[list[dict], str]:
        from scraper.tcgplayer import collector_key

        rows = self.conn.execute(
            """
            SELECT p.product_id, p.printing, p.name, p.number_display, p.rarity, p.image_url,
                   pr.condition, pr.market_price, pr.low_price, pr.sales, pr.observed_on
            FROM products p
            LEFT JOIN prices pr
              ON pr.product_id = p.product_id AND pr.printing = p.printing
            WHERE p.set_id = ?
            """,
            (set_id,),
        ).fetchall()
        grouped: dict[tuple, dict] = {}
        observed = ""
        for row in rows:
            key = (row["product_id"], row["printing"])
            product = grouped.get(key)
            if product is None:
                number_display = row["number_display"] or ""
                product = {
                    "product_id": row["product_id"],
                    "printing": row["printing"],
                    "name": row["name"] or "",
                    "number_display": number_display,
                    "collector_key": collector_key(number_display),
                    "rarity": row["rarity"],
                    "image_url": row["image_url"],
                    "conditions": {},
                }
                grouped[key] = product
            if row["condition"]:
                product["conditions"][row["condition"]] = {
                    "market": row["market_price"],
                    "low": row["low_price"],
                    "sales": row["sales"],
                }
                observed = max(observed, row["observed_on"] or "")
        return list(grouped.values()), observed

    def condition_history(self, product_ids: list[int]) -> dict[tuple, list[dict]]:
        if not product_ids:
            return {}
        marks = ",".join("?" for _ in product_ids)
        rows = self.conn.execute(
            f"""
            SELECT product_id, printing, condition, observed_on, market_price
            FROM prices
            WHERE product_id IN ({marks}) AND market_price IS NOT NULL
            ORDER BY observed_on
            """,
            product_ids,
        )
        grouped: dict[tuple, list[dict]] = {}
        for row in rows:
            key = (row["product_id"], row["printing"], row["condition"])
            grouped.setdefault(key, []).append(
                {"date": row["observed_on"], "price": row["market_price"]}
            )
        return grouped
