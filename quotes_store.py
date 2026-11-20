"""Data loading, validation, filtering, and random selection for Famous Quotes."""

from __future__ import annotations

import json
import random
from collections import Counter
from pathlib import Path
from typing import Any


class QuoteStore:
    """In-memory repository of curated quotes loaded from a JSON file."""

    def __init__(self, quotes: list[dict[str, Any]]) -> None:
        self._quotes: tuple[dict[str, Any], ...] = tuple(
            self._validate_and_normalize(quotes)
        )

    @classmethod
    def from_json_file(cls, path: Path | str) -> "QuoteStore":
        file_path = Path(path)
        with file_path.open("r", encoding="utf-8") as handle:
            raw_data = json.load(handle)
        if not isinstance(raw_data, list):
            raise ValueError("Quotes JSON root must be a list of quote objects.")
        return cls(raw_data)

    @staticmethod
    def _validate_and_normalize(quotes: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        seen_ids: set[int] = set()

        for index, item in enumerate(quotes):
            if not isinstance(item, dict):
                raise ValueError(f"Quote at index {index} must be an object.")

            quote_id = item.get("id")
            text = item.get("text")
            author = item.get("author")
            categories = item.get("categories")

            if not isinstance(quote_id, int) or isinstance(quote_id, bool):
                raise ValueError(f"Quote at index {index} must have an integer 'id'.")
            if quote_id in seen_ids:
                raise ValueError(f"Duplicate quote id detected: {quote_id}.")
            seen_ids.add(quote_id)

            if not isinstance(text, str) or not text.strip():
                raise ValueError(f"Quote {quote_id} must have non-empty 'text'.")
            if not isinstance(author, str) or not author.strip():
                raise ValueError(f"Quote {quote_id} must have non-empty 'author'.")
            if (
                not isinstance(categories, list)
                or not categories
                or not all(isinstance(cat, str) and cat.strip() for cat in categories)
            ):
                raise ValueError(
                    f"Quote {quote_id} must have a non-empty list of category strings."
                )

            normalized.append(
                {
                    "id": quote_id,
                    "text": text.strip(),
                    "author": author.strip(),
                    "categories": [cat.strip() for cat in categories],
                }
            )

        return normalized

    @staticmethod
    def _copy_quote(quote: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": quote["id"],
            "text": quote["text"],
            "author": quote["author"],
            "categories": list(quote["categories"]),
        }

    def __len__(self) -> int:
        return len(self._quotes)

    def all_quotes(self) -> list[dict[str, Any]]:
        return [self._copy_quote(quote) for quote in self._quotes]

    def filter_quotes(
        self,
        author: str | None = None,
        category: str | None = None,
    ) -> list[dict[str, Any]]:
        """Filter quotes by author substring and/or exact category (case-insensitive)."""
        author_term = (author or "").strip().lower()
        category_term = (category or "").strip().lower()

        results: list[dict[str, Any]] = []
        for quote in self._quotes:
            if author_term and author_term not in quote["author"].lower():
                continue
            if category_term and not any(
                cat.lower() == category_term for cat in quote["categories"]
            ):
                continue
            results.append(self._copy_quote(quote))

        return results

    def random_quote(
        self,
        author: str | None = None,
        category: str | None = None,
        exclude_id: int | None = None,
    ) -> tuple[dict[str, Any] | None, int]:
        """Return a random matching quote and total pool size, avoiding exclude_id when possible."""
        matches = self.filter_quotes(author=author, category=category)
        pool_size = len(matches)
        if pool_size == 0:
            return None, 0

        candidates = matches
        if exclude_id is not None and pool_size > 1:
            non_excluded = [quote for quote in matches if quote["id"] != exclude_id]
            if non_excluded:
                candidates = non_excluded

        return random.choice(candidates), pool_size

    def list_categories(self) -> list[dict[str, Any]]:
        """Return sorted category metadata with quote counts."""
        counts: Counter[str] = Counter()
        for quote in self._quotes:
            for category in quote["categories"]:
                counts[category] += 1

        return [
            {"name": name, "count": counts[name]}
            for name in sorted(counts.keys(), key=str.lower)
        ]

    def list_authors(self) -> list[dict[str, Any]]:
        """Return sorted unique author metadata with quote counts."""
        counts: Counter[str] = Counter(quote["author"] for quote in self._quotes)
        return [
            {"name": name, "count": counts[name]}
            for name in sorted(counts.keys(), key=str.lower)
        ]
