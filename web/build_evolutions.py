"""Save Pokémon evolution links from PokemonDB for the card panel.

The page lists species that evolve. The stored names are the form names
shown on each card (Alolan Rattata, not just Rattata).
"""

from __future__ import annotations

import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen

SOURCE = "https://pokemondb.net/evolution"
OUT = Path(__file__).resolve().parent / "public" / "data" / "evolutions.json"
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


class TreeParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root: dict = {"type": "root", "children": []}
        self.stack = [self.root]
        self.marks: list[int] = []
        self.depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        classes = dict(attrs).get("class") or ""
        names = classes.split()
        node = None
        if tag == "div" and "infocard-list-evo" in names:
            node = {"type": "list", "children": []}
        elif tag == "span" and "infocard-evo-split" in names:
            node = {"type": "split", "children": []}
        if node is not None:
            self.stack[-1]["children"].append(node)
            self.stack.append(node)
            self.marks.append(self.depth)
        elif tag == "img" and "img-sprite" in names and self.stack[-1]["type"] == "list":
            alt = (dict(attrs).get("alt") or "").strip()
            if alt:
                self.stack[-1]["children"].append({"type": "mon", "name": alt})
        if tag not in VOID:
            self.depth += 1

    def handle_endtag(self, tag: str) -> None:
        self.depth -= 1
        if self.marks and self.marks[-1] == self.depth:
            self.marks.pop()
            self.stack.pop()


def walk(node: dict) -> tuple[list[tuple[str, str]], list[str]]:
    edges: list[tuple[str, str]] = []
    entries: list[str] = []
    previous = None
    for child in node["children"]:
        if child["type"] == "mon":
            if previous:
                edges.append((previous, child["name"]))
            else:
                entries.append(child["name"])
            previous = child["name"]
        elif child["type"] == "split":
            for branch in child["children"]:
                if branch["type"] != "list":
                    continue
                branch_edges, branch_entries = walk(branch)
                edges.extend(branch_edges)
                for entry in branch_entries:
                    if previous:
                        edges.append((previous, entry))
                    else:
                        entries.append(entry)
            previous = None
    return edges, entries


def download() -> str:
    request = Request(SOURCE, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8")


def chains_from(html: str) -> dict[str, dict[str, list[str]]]:
    parser = TreeParser()
    parser.feed(html)
    edges: list[tuple[str, str]] = []
    for child in parser.root["children"]:
        if child["type"] == "list":
            found, _entries = walk(child)
            edges.extend(found)
    book: dict[str, dict[str, list[str]]] = {}
    for left, right in edges:
        if left == right:
            continue
        source = book.setdefault(left, {"prev": [], "next": []})
        target = book.setdefault(right, {"prev": [], "next": []})
        if right not in source["next"]:
            source["next"].append(right)
        if left not in target["prev"]:
            target["prev"].append(left)
    return dict(sorted(book.items()))


def main() -> None:
    book = chains_from(download())
    OUT.write_text(json.dumps(book, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"species {len(book)} file {OUT.stat().st_size}")


if __name__ == "__main__":
    main()
