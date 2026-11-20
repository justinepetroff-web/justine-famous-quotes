"""Flask application entry point for the Famous Quotes web app."""

from __future__ import annotations

import csv
import io
import re
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, render_template, request

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


def _slugify_filename_part(value: str, max_length: int = 40) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:max_length].strip("-")


def _build_export_filename(author: str, category: str) -> str:
    parts = ["famous-quotes"]
    for raw in (author, category):
        slug = _slugify_filename_part(raw)
        if slug:
            parts.append(slug)
    return f"{'-'.join(parts)}.csv"


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

    @app.get("/api/quotes/export.csv")
    def api_export_quotes_csv() -> Response:
        author = request.args.get("author", "").strip()
        category = request.args.get("category", "").strip()
        matches = store.filter_quotes(author=author, category=category)

        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(["id", "text", "author", "categories"])
        for quote in matches:
            writer.writerow(
                [
                    quote["id"],
                    quote["text"],
                    quote["author"],
                    "; ".join(quote["categories"]),
                ]
            )

        filename = _build_export_filename(author, category)
        return Response(
            buffer.getvalue(),
            status=200,
            mimetype="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
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
