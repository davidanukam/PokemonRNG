"""Polite HTTP client for limitlesstcg.com."""

from __future__ import annotations

import time

import requests

from scraper.constants import BASE_URL, USER_AGENT


class LimitlessClient:
    def __init__(self, delay: float = 0.3, timeout: float = 45):
        self.delay = delay
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
            }
        )
        self._next_at = 0.0

    def get(self, path_or_url: str) -> requests.Response:
        url = path_or_url if path_or_url.startswith("http") else f"{BASE_URL}{path_or_url}"
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
            return response
        raise requests.RequestException(f"Failed to fetch {url}") from last_error

    def get_text(self, path_or_url: str) -> str:
        return self.get(path_or_url).text

    def get_json(self, path_or_url: str):
        response = self.get(path_or_url)
        return response.json()

    def _wait(self) -> None:
        now = time.monotonic()
        if now < self._next_at:
            time.sleep(self._next_at - now)
        self._next_at = time.monotonic() + self.delay
