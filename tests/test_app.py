"""Automated tests for the Famous Quotes dataset, QuoteStore, and Flask API."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app import DEFAULT_DATA_PATH, create_app
from quotes_store import QuoteStore

EXPECTED_CATEGORIES = {
    "Courage",
    "Creativity",
    "Humor",
    "Inspiration",
    "Leadership",
    "Life",
    "Philosophy",
    "Science",
    "Success",
    "Wisdom",
}


@pytest.fixture()
def store() -> QuoteStore:
    return QuoteStore.from_json_file(DEFAULT_DATA_PATH)


@pytest.fixture()
def client():
    flask_app = create_app(DEFAULT_DATA_PATH)
    flask_app.config["TESTING"] = True
    with flask_app.test_client() as test_client:
        yield test_client


# --- Dataset Integrity Tests ---


def test_dataset_has_exact_100_unique_valid_quotes() -> None:
    raw = json.loads(Path(DEFAULT_DATA_PATH).read_text(encoding="utf-8"))
    assert isinstance(raw, list)
    assert len(raw) == 100

    ids = [q["id"] for q in raw]
    assert ids == list(range(1, 101))

    normalized_texts = [q["text"].strip().lower() for q in raw]
    assert len(set(normalized_texts)) == 100

    found_categories: set[str] = set()
    for quote in raw:
        assert isinstance(quote["text"], str) and quote["text"].strip()
        assert isinstance(quote["author"], str) and quote["author"].strip()
        assert isinstance(quote["categories"], list) and len(quote["categories"]) >= 1
        for category in quote["categories"]:
            assert category in EXPECTED_CATEGORIES
            found_categories.add(category)

    assert found_categories == EXPECTED_CATEGORIES


def test_dataset_categories_are_well_populated(store: QuoteStore) -> None:
    categories = store.list_categories()
    assert len(categories) == len(EXPECTED_CATEGORIES)
    for entry in categories:
        assert entry["count"] >= 5, f"Category {entry['name']} has too few quotes"


# --- QuoteStore Unit Tests ---


def test_store_validation_rejects_duplicate_ids() -> None:
    bad_quotes = [
        {"id": 1, "text": "A", "author": "Author A", "categories": ["Wisdom"]},
        {"id": 1, "text": "B", "author": "Author B", "categories": ["Wisdom"]},
    ]
    with pytest.raises(ValueError, match="Duplicate quote id"):
        QuoteStore(bad_quotes)


def test_store_filter_by_author_case_insensitive_substring(store: QuoteStore) -> None:
    einstein_quotes = store.filter_quotes(author="  einstein ")
    assert len(einstein_quotes) >= 2
    assert all("einstein" in q["author"].lower() for q in einstein_quotes)


def test_store_filter_by_category_case_insensitive(store: QuoteStore) -> None:
    science_quotes = store.filter_quotes(category="science")
    assert len(science_quotes) >= 5
    assert all("Science" in q["categories"] for q in science_quotes)


def test_store_filter_combined_author_and_category(store: QuoteStore) -> None:
    results = store.filter_quotes(author="einstein", category="Science")
    assert len(results) >= 1
    assert all(
        "einstein" in q["author"].lower() and "Science" in q["categories"]
        for q in results
    )


def test_store_random_excludes_current_id_when_multiple_match(store: QuoteStore) -> None:
    einstein_quotes = store.filter_quotes(author="Albert Einstein")
    assert len(einstein_quotes) >= 2
    excluded_id = einstein_quotes[0]["id"]

    for _ in range(25):
        quote, pool_size = store.random_quote(
            author="Albert Einstein",
            exclude_id=excluded_id,
        )
        assert quote is not None
        assert pool_size == len(einstein_quotes)
        assert quote["id"] != excluded_id


def test_store_random_returns_sole_match_even_if_excluded() -> None:
    single_store = QuoteStore(
        [{"id": 7, "text": "Solo quote.", "author": "Solo Author", "categories": ["Wisdom"]}]
    )
    quote, pool_size = single_store.random_quote(exclude_id=7)
    assert pool_size == 1
    assert quote is not None
    assert quote["id"] == 7


def test_store_random_returns_none_when_no_matches(store: QuoteStore) -> None:
    quote, pool_size = store.random_quote(author="Nonexistent Person XYZ")
    assert quote is None
    assert pool_size == 0


# --- Flask HTTP & API Integration Tests ---


def test_index_route_renders_html(client) -> None:
    response = client.get("/")
    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert "Famous Quotes" in html
    assert "static/css/styles.css" in html
    assert "static/js/app.js" in html
    assert 'id="author-search"' in html
    assert 'id="category-chips"' in html


def test_api_random_quote_unfiltered(client) -> None:
    response = client.get("/api/quotes/random")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["pool_size"] == 100
    quote = payload["quote"]
    assert set(quote.keys()) == {"id", "text", "author", "categories"}


def test_api_random_quote_with_filters_and_exclude_id(client) -> None:
    first = client.get("/api/quotes/random?category=Humor").get_json()
    assert first["pool_size"] >= 2
    first_id = first["quote"]["id"]

    for _ in range(10):
        resp = client.get(f"/api/quotes/random?category=Humor&exclude_id={first_id}")
        assert resp.status_code == 200
        data = resp.get_json()
        assert "Humor" in data["quote"]["categories"]
        assert data["quote"]["id"] != first_id


def test_api_random_quote_ignores_non_integer_exclude_id(client) -> None:
    response = client.get("/api/quotes/random?exclude_id=not-a-number")
    assert response.status_code == 200
    assert response.get_json()["pool_size"] == 100


def test_api_random_quote_returns_404_when_empty(client) -> None:
    response = client.get("/api/quotes/random?author=DoesNotExist123")
    assert response.status_code == 404
    payload = response.get_json()
    assert payload["pool_size"] == 0
    assert "error" in payload


def test_api_quotes_unfiltered_returns_all_100(client) -> None:
    response = client.get("/api/quotes")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["total"] == 100
    assert len(payload["quotes"]) == 100


def test_api_quotes_filtered_by_author_and_category(client) -> None:
    response = client.get("/api/quotes?author=twain&category=Humor")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["total"] >= 2
    assert payload["filters"] == {"author": "twain", "category": "Humor"}
    for quote in payload["quotes"]:
        assert "twain" in quote["author"].lower()
        assert "Humor" in quote["categories"]


def test_api_categories_endpoint(client) -> None:
    response = client.get("/api/categories")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["total_quotes"] == 100
    names = [cat["name"] for cat in payload["categories"]]
    assert names == sorted(EXPECTED_CATEGORIES)


def test_api_authors_endpoint(client) -> None:
    response = client.get("/api/authors")
    assert response.status_code == 200
    payload = response.get_json()
    authors = payload["authors"]
    assert len(authors) >= 30
    names = [author["name"] for author in authors]
    assert names == sorted(names, key=str.lower)
    assert sum(author["count"] for author in authors) == 100
