"""Update the card archive.

Examples:
    python main.py species
    python main.py cards --set 30C --limit 1
    python main.py cards
    python main.py tcgplayer --set 30C
    python main.py tcgplayer
    python main.py predict
    python main.py all
"""

from __future__ import annotations

import argparse
import sys

from scraper.pokedex import make_pokedex, repredict, scrape_cards
from scraper.tcgplayer import rematch_saved, scrape_tcgplayer


def main(argv: list[str] | None = None) -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    parser = argparse.ArgumentParser(description="Download Pokémon cards into pokedex/dex.json")
    sub = parser.add_subparsers(dest="command", required=True)

    species = sub.add_parser("species", help="Refresh the national dex index")
    species.add_argument("--delay", type=float, default=0.3)

    cards = sub.add_parser("cards", help="Download cards, prices, history, and forecasts")
    cards.add_argument("--set", action="append", dest="sets", help="Limit to one set code. Repeatable.")
    cards.add_argument("--limit", type=int, default=0, help="Stop after this many card pages")
    cards.add_argument("--refresh", action="store_true", help="Refetch cards saved in the last 7 days")
    cards.add_argument("--delay", type=float, default=0.3, help="Seconds between requests")

    tcgplayer = sub.add_parser(
        "tcgplayer",
        help="Read TCGplayer price guides. Near Mint and the other conditions, plus sharper images.",
    )
    tcgplayer.add_argument(
        "--set",
        action="append",
        dest="sets",
        help="One set: code, slug, or TCGplayer set id. Repeatable. Omit to read every Pokémon set.",
    )
    tcgplayer.add_argument(
        "--refresh",
        action="store_true",
        help="Read sets again even if they were saved in the last 7 days",
    )
    tcgplayer.add_argument("--delay", type=float, default=0.3, help="Seconds between requests")
    tcgplayer.add_argument(
        "--rematch",
        action="store_true",
        help="Apply the prices already in SQLite. Does not download the guides again.",
    )

    predict = sub.add_parser("predict", help="Refit every forecast from saved price history")
    del predict

    everything = sub.add_parser("all", help="Refresh species, then download every set")
    everything.add_argument("--set", action="append", dest="sets")
    everything.add_argument("--limit", type=int, default=0)
    everything.add_argument("--refresh", action="store_true", help="Refetch cards saved in the last 7 days")
    everything.add_argument("--delay", type=float, default=0.3)

    args = parser.parse_args(argv)
    if args.command == "species":
        make_pokedex(delay=args.delay)
    elif args.command == "predict":
        count = repredict()
        print(f"Refit predictions for {count} cards.")
    elif args.command == "cards":
        scrape_cards(args.sets, limit=args.limit, refresh=args.refresh, delay=args.delay)
    elif args.command == "tcgplayer":
        if args.rematch:
            rematch_saved()
        else:
            scrape_tcgplayer(args.sets, refresh=args.refresh, delay=args.delay)
    elif args.command == "all":
        make_pokedex(delay=args.delay)
        scrape_cards(args.sets, limit=args.limit, refresh=args.refresh, delay=args.delay)


if __name__ == "__main__":
    main()
