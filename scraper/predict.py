"""Price forecasts from saved TCGplayer (USD) and Cardmarket (EUR) history."""

from __future__ import annotations

import math
from datetime import date, datetime, timedelta

from sklearn.linear_model import LinearRegression

from scraper.constants import PREDICTION_HORIZON_DAYS


def predict_card(price_history: dict | None, horizon_days: int = PREDICTION_HORIZON_DAYS) -> dict:
    history = price_history or {}
    fitted_at = datetime.now().astimezone().isoformat(timespec="seconds")
    return {
        "horizon_days": horizon_days,
        "fitted_at": fitted_at,
        "usd": predict_series(history.get("usd") or [], horizon_days),
        "eur": predict_series(history.get("eur") or [], horizon_days),
    }


def predict_series(points: list[dict], horizon_days: int) -> dict | None:
    cleaned = []
    for point in points:
        try:
            observed = date.fromisoformat(str(point["date"]))
            price = float(point["price"])
        except (KeyError, TypeError, ValueError):
            continue
        if math.isfinite(price):
            cleaned.append((observed, price))
    if len(cleaned) < 2:
        return None

    cleaned.sort(key=lambda item: item[0])
    origin = cleaned[0][0]
    day_offsets = [float((observed - origin).days) for observed, _price in cleaned]
    prices = [price for _observed, price in cleaned]
    model = LinearRegression()
    model.fit([[offset] for offset in day_offsets], prices)

    last_day = day_offsets[-1]
    last_date = cleaned[-1][0]
    raw = float(model.predict([[last_day + horizon_days]])[0])
    score = float(model.score([[offset] for offset in day_offsets], prices))
    predicted_date = last_date + timedelta(days=horizon_days)
    return {
        "model": "sklearn.linear_model.LinearRegression",
        "samples": len(cleaned),
        "anchor_date": origin.isoformat(),
        "slope_per_day": _round(float(model.coef_[0]), 6),
        "intercept": _round(float(model.intercept_), 4),
        "r2": _round(score, 4),
        "last_date": last_date.isoformat(),
        "last_price": round(prices[-1], 2),
        "predicted_date": predicted_date.isoformat(),
        "predicted_price": round(max(0.0, raw), 2),
    }


def _round(value: float, digits: int):
    if not math.isfinite(value):
        return None
    return round(value, digits)
