"""Flask application entry point for the Famous Quotes web app."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request

from quotes_store import QuoteStore

DEFAULT_DATA_PATH = Path(__file__).resolve().parent / "data" / "quotes.json"


def _parse_optional_int(raw_value: str) -> int | None:
    cleaned = raw_value.strip()
    if not cleaned:
        return None
    try:
        return int(cleaned)
    except ValueError:
        return None


def create_app(data_path: Path | str | None = None) -> Flask:
    """Create and configure the Flask application instance."""
    app = Flask(__name__)
    store = QuoteStore.from_json_file(data_path or DEFAULT_DATA_PATH)
    app.config["QUOTE_STORE"] = store

    @app.get("/")
    def index() -> str:
        return render_template("index.html", total_quotes=len(store))

    @app.get("/api/quotes/random")
    def api_random_quote() -> tuple[Any, int] | Any:
        author = request.args.get("author", "").strip()
        category = request.args.get("category", "").strip()
        exclude_id = _parse_optional_int(request.args.get("exclude_id", ""))

        quote, pool_size = store.random_quote(
            author=author,
            category=category,
            exclude_id=exclude_id,
        )
        if quote is None:
            return (
                jsonify(
                    {
                        "error": "No quotes found matching the given filters.",
                        "pool_size": 0,
                    }
                ),
                404,
            )

        return jsonify({"quote": quote, "pool_size": pool_size})

    @app.get("/api/quotes")
    def api_quotes() -> Any:
        author = request.args.get("author", "").strip()
        category = request.args.get("category", "").strip()
        matches = store.filter_quotes(author=author, category=category)

        return jsonify(
            {
                "quotes": matches,
                "total": len(matches),
                "filters": {
                    "author": author,
                    "category": category,
                },
            }
        )

    @app.get("/api/categories")
    def api_categories() -> Any:
        return jsonify(
            {
                "categories": store.list_categories(),
                "total_quotes": len(store),
            }
        )

    @app.get("/api/authors")
    def api_authors() -> Any:
        return jsonify({"authors": store.list_authors()})

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
