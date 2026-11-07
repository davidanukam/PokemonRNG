"""Shared locations and request settings for the Limitless archive."""

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
POKEDEX_DIR = PROJECT_ROOT / "pokedex"
DEX_PATH = POKEDEX_DIR / "dex.json"
SETS_DIR = POKEDEX_DIR / "sets"
PROGRESS_PATH = POKEDEX_DIR / "progress.json"
TCGPLAYER_DB_PATH = POKEDEX_DIR / "tcgplayer.sqlite"
TCGPLAYER_PROGRESS_PATH = POKEDEX_DIR / "tcgplayer_progress.json"
ERROR_LOG_PATH = POKEDEX_DIR / "errors.log"

BASE_URL = "https://limitlesstcg.com"
TCGPLAYER_INFINITE_API = "https://infinite-api.tcgplayer.com"
TCGPLAYER_CATALOG_API = "https://mpapi.tcgplayer.com"
TCGPLAYER_IMAGE = "https://tcgplayer-cdn.tcgplayer.com/product/{product_id}_in_1000x1000.jpg"
POKEMON_CATEGORY_ID = 3
CARDS_PRODUCT_TYPE_ID = 1
USER_AGENT = "PokemonRNG personal archive (educational, rate-limited)"

# Forecast window used for every card. Days after the last saved price point.
PREDICTION_HORIZON_DAYS = 30
