"""HTML and price-history parsers for Limitless set and card pages."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from scraper.constants import BASE_URL

_DAMAGE_RE = re.compile(
    r"^(?P<name>.*?)(?:\s+(?P<damage>\d+\+?|\d+\s*[×x]|[×x]\s*\d+))?$"
)
_CARD_ID_RE = re.compile(r"var\s+cardId\s*=\s*(\d+)")
_COMMENT_CARD_ID_RE = re.compile(r"CARD ID\s+(\d+)")
_DATA_ID_RE = re.compile(r"DATA ID\s+(\d+)")
_HP_RE = re.compile(r"(\d+)\s*HP\s*$", re.IGNORECASE)


def parse_sets(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    sets = []
    series = None
    for row in soup.select("table.sets-table tr"):
        heading = row.find("th", class_="sub-heading")
        if heading is not None:
            series = heading.get_text(" ", strip=True)
            continue
        cells = row.find_all("td")
        if len(cells) < 3:
            continue
        link = cells[0].find("a")
        if link is None or not link.get("href"):
            continue
        code_node = cells[0].select_one(".code")
        code = code_node.get_text(strip=True) if code_node else link["href"].rstrip("/").split("/")[-1]
        name = _text_without(link, "span", "img")
        release_raw = cells[1].get_text(" ", strip=True)
        count_match = re.search(r"\d+", cells[2].get_text(" ", strip=True))
        sets.append(
            {
                "code": code,
                "name": name,
                "series": series,
                "release_date": _parse_release_date(release_raw),
                "release_label": release_raw or None,
                "card_count": int(count_match.group(0)) if count_match else None,
                "usd": _money(cells[3].get_text(" ", strip=True) if len(cells) > 3 else ""),
                "eur": _money(cells[4].get_text(" ", strip=True) if len(cells) > 4 else ""),
                "url": urljoin(BASE_URL, link["href"]),
            }
        )
    return sets


def parse_set_card_list(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    cards = []
    seen = set()
    for row in soup.select("table.card-list tr"):
        cells = row.find_all("td")
        anchors = [
            anchor
            for cell in cells
            for anchor in cell.find_all("a", href=True)
            if _is_card_href(anchor["href"])
        ]
        if not anchors:
            continue
        set_code, number = _split_card_href(anchors[0]["href"])
        card_id = f"{set_code}-{number}"
        if card_id in seen:
            continue
        seen.add(card_id)
        name = ""
        for anchor in anchors:
            text = anchor.get_text(" ", strip=True)
            if text and text != number and text.upper() != set_code:
                name = text
                break
        prices = row.select("a.card-price")
        usd_link = _price_link(prices, "usd")
        eur_link = _price_link(prices, "eur")
        type_cell = cells[3].get_text(" ", strip=True) if len(cells) >= 7 else ""
        rarity_cell = cells[4].get_text(" ", strip=True) if len(cells) >= 7 else ""
        cards.append(
            {
                "id": card_id,
                "set_code": set_code,
                "number": number,
                "name": name,
                "url": urljoin(BASE_URL, anchors[0]["href"]),
                "card_image": row.get("data-hover") or None,
                "list_type": type_cell or None,
                "rarity": rarity_cell or None,
                "usd": _money(usd_link.get_text(" ", strip=True) if usd_link else ""),
                "eur": _money(eur_link.get_text(" ", strip=True) if eur_link else ""),
                "usd_url": usd_link.get("href") if usd_link else None,
                "eur_url": eur_link.get("href") if eur_link else None,
            }
        )
    if cards:
        return cards

    for link in soup.select("a[href]"):
        href = link.get("href") or ""
        if not _is_card_href(href):
            continue
        set_code, number = _split_card_href(href)
        card_id = f"{set_code}-{number}"
        if card_id in seen:
            continue
        seen.add(card_id)
        image = link.find("img")
        cards.append(
            {
                "id": card_id,
                "set_code": set_code,
                "number": number,
                "name": (image.get("alt") if image else "") or link.get_text(" ", strip=True),
                "url": urljoin(BASE_URL, href),
                "card_image": (image.get("data-src") or image.get("src")) if image else None,
                "list_type": None,
                "rarity": None,
                "usd": None,
                "eur": None,
                "usd_url": None,
                "eur_url": None,
            }
        )
    return cards


def parse_species(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    species = []
    for row in soup.select("table.pokedex tr"):
        cells = row.find_all("td")
        if len(cells) < 4:
            continue
        image = cells[1].find("img")
        number = (row.get("data-pokedex") or cells[0].get_text(strip=True)).strip()
        name = (row.get("data-name") or cells[2].get_text(" ", strip=True)).strip()
        amount = (row.get("data-cards") or cells[3].get_text(strip=True)).strip()
        if not number or not name:
            continue
        species.append(
            {
                "number": number,
                "pixel_image": image.get("src") if image else "",
                "card_image": "",
                "name": name,
                "amount": amount,
                "card_ids": [],
            }
        )
    return species


def parse_card_page(html: str, page_url: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    name_node = soup.select_one(".card-text-name")
    if name_node is None:
        raise ValueError(f"Unrecognized card page: {page_url}")

    set_code, number = _split_card_href(page_url)
    image = soup.select_one(".card-image img")
    title = soup.select_one(".card-text-title")
    type_node = soup.select_one(".card-text-type")
    name = name_node.get_text(" ", strip=True)
    types, hp = _parse_title(title, name)
    supertype, subtypes = _parse_supertype(type_node)
    limitless_id = _first_int(_CARD_ID_RE, html) or _first_int(_COMMENT_CARD_ID_RE, html)
    current_print = _current_print(soup)
    usd, eur, usd_url, eur_url = _page_prices(soup)
    return {
        "id": f"{set_code}-{number}",
        "limitless_id": limitless_id,
        "data_id": _first_int(_DATA_ID_RE, html),
        "url": page_url,
        "set_code": set_code,
        "set_name": current_print.get("set_name"),
        "number": number,
        "name": name,
        "rarity": current_print.get("rarity"),
        "card_image": (image.get("data-src") or image.get("src")) if image else None,
        "supertype": supertype,
        "subtypes": subtypes,
        "types": types,
        "hp": hp,
        "abilities": _parse_abilities(soup),
        "attacks": _parse_attacks(soup),
        "rules": _parse_rules(soup),
        **_parse_wrr(soup),
        "illustrator": _illustrator(soup),
        "regulation": _regulation(soup),
        "legality": _legality(soup),
        "prints": _prints(soup),
        "prices": {
            "usd": usd,
            "eur": eur,
            "usd_url": usd_url,
            "eur_url": eur_url,
        },
    }


def parse_price_history(payload: dict) -> dict:
    return {
        "usd": _history_rows(payload.get("tcgplayer") or []),
        "eur": _history_rows(payload.get("cardmarket") or []),
    }


def merge_list_row(card: dict, row: dict, set_info: dict) -> dict:
    merged = dict(card)
    same_set = not row.get("set_code") or row.get("set_code") == set_info.get("code")
    if same_set:
        merged["set_code"] = set_info["code"]
        merged["set_name"] = set_info.get("name") or merged.get("set_name")
        merged["series"] = set_info.get("series")
        merged["release_date"] = set_info.get("release_date")
    merged["number"] = str(row.get("number") or merged.get("number"))
    merged["id"] = f"{merged['set_code']}-{merged['number']}"
    if not merged.get("name"):
        merged["name"] = row.get("name")
    if not merged.get("card_image"):
        merged["card_image"] = row.get("card_image")
    if not merged.get("rarity"):
        merged["rarity"] = row.get("rarity")
    prices = dict(merged.get("prices") or {})
    for key in ("usd", "eur"):
        if prices.get(key) is None and row.get(key) is not None:
            prices[key] = row[key]
    for key in ("usd_url", "eur_url"):
        if not prices.get(key) and row.get(key):
            prices[key] = row[key]
    merged["prices"] = prices
    if not merged.get("supertype") and row.get("list_type"):
        merged["supertype"] = row["list_type"]
    return merged


def _history_rows(rows: list) -> list[dict]:
    points = []
    for row in rows:
        if not isinstance(row, (list, tuple)) or len(row) < 2:
            continue
        timestamp, raw_price = row[0], row[1]
        try:
            observed = datetime.fromtimestamp(float(timestamp) / 1000, timezone.utc).date()
            price = _cents_to_price(raw_price)
        except (TypeError, ValueError, OSError):
            continue
        if price is None:
            continue
        points.append({"date": observed.isoformat(), "price": price})
    points.sort(key=lambda point: point["date"])
    return points


def _cents_to_price(value) -> float | None:
    number = float(value)
    if isinstance(value, float) and not number.is_integer():
        return round(number, 2)
    return round(number / 100, 2)


def _parse_title(title, name: str) -> tuple[list[str], int | None]:
    if title is None:
        return [], None
    rest = title.get_text(" ", strip=True)
    if rest.startswith(name):
        rest = rest[len(name) :]
    rest = re.sub(r"^[\s\-–—]+", "", rest).strip()
    hp = None
    hp_match = _HP_RE.search(rest)
    if hp_match:
        hp = int(hp_match.group(1))
        rest = rest[: hp_match.start()].strip(" -")
    types = [part.strip() for part in re.split(r"\s+-\s+|/", rest) if part.strip()]
    return types, hp


def _parse_supertype(node) -> tuple[str | None, list[str]]:
    if node is None:
        return None, []
    parts = [part.strip() for part in node.get_text(" ", strip=True).split("-")]
    parts = [part for part in parts if part]
    if not parts:
        return None, []
    return parts[0], parts[1:]


def _parse_attacks(soup: BeautifulSoup) -> list[dict]:
    attacks = []
    for block in soup.select(".card-text-attack"):
        info = block.select_one(".card-text-attack-info")
        effect = block.select_one(".card-text-attack-effect")
        costs: list[str] = []
        name = ""
        damage = None
        if info is not None:
            for symbol in info.select(".ptcg-symbol"):
                costs.extend(_split_symbols(symbol.get_text(strip=True)))
                symbol.extract()
            name, damage = _split_damage(info.get_text(" ", strip=True))
        attacks.append(
            {
                "cost": costs,
                "name": name,
                "damage": damage,
                "effect": effect.get_text(" ", strip=True) if effect else "",
            }
        )
    return attacks


def _parse_abilities(soup: BeautifulSoup) -> list[dict]:
    abilities = []
    for block in soup.select(".card-text-ability"):
        info = block.select_one(".card-text-ability-info")
        effect = block.select_one(".card-text-ability-effect")
        label = info.get_text(" ", strip=True) if info else ""
        kind, _, ability_name = label.partition(":")
        if not ability_name:
            kind, ability_name = "Ability", label
        abilities.append(
            {
                "kind": kind.strip() or "Ability",
                "name": ability_name.strip(),
                "effect": effect.get_text(" ", strip=True) if effect else "",
            }
        )
    return abilities


def _parse_rules(soup: BeautifulSoup) -> list[str]:
    rules = []
    for section in soup.select(".card-text-section"):
        if section.select(
            ".card-text-attack, .card-text-ability, .card-text-title, .card-text-wrr, .card-text-artist"
        ):
            continue
        text = section.get_text(" ", strip=True)
        if text:
            rules.append(text)
    return rules


def _parse_wrr(soup: BeautifulSoup) -> dict:
    parsed = {"weakness": None, "resistance": None, "retreat": None}
    node = soup.select_one(".card-text-wrr")
    if node is None:
        return parsed
    for part in node.get_text("\n", strip=True).splitlines():
        if ":" not in part:
            continue
        key, value = part.split(":", 1)
        key = key.strip().lower()
        value = value.strip()
        if key not in parsed:
            continue
        if not value or value.lower() == "none":
            parsed[key] = None
        elif key == "retreat" and value.isdigit():
            parsed[key] = int(value)
        else:
            parsed[key] = value
    return parsed


def _illustrator(soup: BeautifulSoup) -> str | None:
    node = soup.select_one(".card-text-artist a")
    if node is None:
        return None
    text = node.get_text(" ", strip=True)
    return text or None


def _regulation(soup: BeautifulSoup) -> str | None:
    node = soup.select_one(".regulation-mark")
    if node is None:
        return None
    text = node.get_text(" ", strip=True).replace("More formats", "")
    text = text.strip(" •")
    match = re.match(r"([A-Za-z0-9]+)\s+Regulation", text)
    if match:
        return match.group(1)
    return text or None


def _legality(soup: BeautifulSoup) -> dict:
    legality = {}
    for item in soup.select(".card-legality-item"):
        label_node = item.find("a")
        status_node = item.find("div", class_=re.compile(r"legal|illegal|banned", re.I))
        if label_node is None:
            continue
        label = label_node.get_text(" ", strip=True).lower()
        key = (
            label.replace("(jp)", "jp")
            .replace(" ", "_")
            .replace("__", "_")
            .strip("_")
        )
        status = status_node.get_text(" ", strip=True).lower() if status_node else None
        legality[key] = status
    return legality


def _prints(soup: BeautifulSoup) -> list[dict]:
    prints = []
    region = "int"
    table = soup.select_one("table.card-prints-versions")
    if table is None:
        return prints
    for row in table.find_all("tr"):
        heading = row.find("th")
        if heading is not None:
            label = heading.get_text(" ", strip=True).lower()
            if "jp" in label:
                region = "jp"
            elif "int" in label:
                region = "int"
            continue
        cells = row.find_all("td")
        if not cells:
            continue
        anchor = cells[0].find("a")
        number_node = cells[0].select_one(".prints-table-card-number")
        number = number_node.get_text(strip=True).lstrip("#") if number_node else None
        name = _text_without(cells[0], "span")
        usd_link = cells[1].find("a") if len(cells) > 1 else None
        eur_link = cells[2].find("a") if len(cells) > 2 else None
        href = anchor.get("href") if anchor and anchor.get("href") else None
        prints.append(
            {
                "region": region,
                "name": name,
                "number": number,
                "current": "current" in (row.get("class") or []),
                "url": urljoin(BASE_URL, href) if href else None,
                "usd": _money(usd_link.get_text(" ", strip=True) if usd_link else ""),
                "eur": _money(eur_link.get_text(" ", strip=True) if eur_link else ""),
                "usd_url": usd_link.get("href") if usd_link else None,
                "eur_url": eur_link.get("href") if eur_link else None,
            }
        )
    return prints


def _current_print(soup: BeautifulSoup) -> dict:
    details = soup.select_one(".prints-current-details")
    if details is None:
        return {}
    lines = [line.strip() for line in details.get_text("\n", strip=True).splitlines() if line.strip()]
    set_name = lines[0] if lines else None
    rarity = None
    if len(lines) > 1:
        parts = re.split(r"\s*[·•|]\s*", lines[1], maxsplit=1)
        if len(parts) == 2:
            rarity = parts[1].strip() or None
    if set_name and set_name.endswith(")") and "(" in set_name:
        set_name = set_name[: set_name.rfind("(")].strip()
    return {"set_name": set_name, "rarity": rarity}


def _page_prices(soup: BeautifulSoup) -> tuple:
    usd = eur = usd_url = eur_url = None
    for row in soup.select("table.card-prints-versions tr.current"):
        links = row.select("a.card-price")
        usd_link = _price_link(links, "usd")
        eur_link = _price_link(links, "eur")
        if usd_link is not None:
            usd = _money(usd_link.get_text(" ", strip=True))
            usd_url = usd_link.get("href")
        if eur_link is not None:
            eur = _money(eur_link.get_text(" ", strip=True))
            eur_url = eur_link.get("href")
    for button in soup.select("a.card-buy-button"):
        classes = button.get("class") or []
        price_node = button.select_one(".card-price")
        if price_node is None:
            continue
        if "usd" in classes and usd is None:
            usd = _money(price_node.get_text(" ", strip=True))
            usd_url = button.get("href")
        if "eur" in classes and eur is None:
            eur = _money(price_node.get_text(" ", strip=True))
            eur_url = button.get("href")
    return usd, eur, usd_url, eur_url


def _price_link(links, kind: str):
    for link in links:
        if kind in (link.get("class") or []):
            return link
    return None


def _split_symbols(raw: str) -> list[str]:
    raw = raw.strip()
    if not raw:
        return []
    if " " in raw:
        return [raw]
    return list(raw)


def _split_damage(text: str) -> tuple[str, str | None]:
    text = " ".join(text.split())
    match = _DAMAGE_RE.match(text)
    if not match:
        return text, None
    damage = match.group("damage")
    return (match.group("name") or "").strip(), damage.replace(" ", "") if damage else None


def _money(text: str):
    cleaned = text.replace("$", "").replace("€", "").replace(",", "").strip()
    if not cleaned or cleaned in {"-", "—"}:
        return None
    try:
        return round(float(cleaned), 2)
    except ValueError:
        return None


def _parse_release_date(text: str) -> str | None:
    text = text.strip()
    if not text:
        return None
    try:
        return datetime.strptime(text, "%d %b %y").date().isoformat()
    except ValueError:
        return None


def _text_without(node, *tag_names: str) -> str:
    clone = BeautifulSoup(str(node), "html.parser")
    root = clone.find()
    if root is None:
        return ""
    for tag_name in tag_names:
        for child in root.find_all(tag_name):
            child.extract()
    return root.get_text(" ", strip=True)


def _is_card_href(href: str) -> bool:
    parts = href.split("?")[0].strip("/").split("/")
    if len(parts) != 3 or parts[0] != "cards":
        return False
    return parts[1] not in {"jp", "advanced", "syntax", "pokedex"}


def _split_card_href(href: str) -> tuple[str, str]:
    path = href.split("?")[0]
    if "://" in path:
        path = path.split("://", 1)[1]
        path = path.split("/", 1)[1] if "/" in path else path
    parts = path.strip("/").split("/")
    if len(parts) >= 3 and parts[0] == "cards":
        return parts[1], parts[2]
    if len(parts) >= 2:
        return parts[-2], parts[-1]
    raise ValueError(f"Not a card URL: {href}")


def _first_int(pattern: re.Pattern, text: str) -> int | None:
    match = pattern.search(text)
    if match is None:
        return None
    return int(match.group(1))
