# Famous Quotes

A curated literary web application for discovering, searching, and browsing 100 famous quotes across 10 categories. Built with **Python Flask** on the backend and **plain vanilla HTML, CSS, and JavaScript** on the frontend—no database or frontend build step required.

## Features

- **Featured Random Quote Hero:** Displays a highlighted quote with a smooth transition, live matching-pool counter, and repeat avoidance (`exclude_id`) so requesting another random quote never repeats the current one when multiple quotes match.
- **Combined Search & Category Filtering:** Case-insensitive author substring search (200ms debounced with `<datalist>` autocomplete) combined with toggleable category filter chips displaying per-category quote counts.
- **Hybrid Browse & Results Grid:** Keeps the landing view focused with a **"Browse all 100 quotes"** toggle, and automatically expands into a responsive card grid whenever filters are active. Clicking a card promotes it into the hero; clicking any author or category tag refines the active filters.
- **One-Click Copy & CSV Export:** Every quote (hero and results cards) includes a **Copy to Clipboard** button (`"<text>" — <author>`, Clipboard API with `execCommand` fallback) with visual `"Copied!"` confirmation, plus an **Export to CSV** button that downloads either the full collection or currently filtered quotes as a `.csv` file.
- **Accessibility & Keyboard Shortcuts:** Announces updates via `aria-live="polite"`, respects `prefers-reduced-motion`, and supports:
  - `R` — Load another random quote (when not focused in an input)
  - `Enter` — Apply the author search immediately
  - `Escape` — Clear the author search input

## Tech Stack

- **Backend:** Python 3.10+, Flask 3.1, Jinja2
- **Frontend:** Vanilla HTML5, CSS3 (custom properties, CSS Grid), ES6+ JavaScript (`fetch`, `AbortController`)
- **Data:** Static JSON archive (`data/quotes.json`) validated and queried in memory via `QuoteStore`
- **Testing:** `pytest`

## Project Structure

```text
famous-quotes/
├── app.py                  # Flask application factory, HTML route, and JSON API endpoints
├── quotes_store.py         # In-memory QuoteStore: validation, filtering, random selection, counts
├── data/
│   └── quotes.json         # 100 curated quotes across 10 categories
├── templates/
│   └── index.html          # Server-rendered Jinja2 page shell
├── static/
│   ├── css/
│   │   └── styles.css      # Editorial/literary responsive stylesheet
│   └── js/
│       └── app.js          # Client state management, API calls, and DOM rendering
├── tests/
│   └── test_app.py         # Dataset integrity, QuoteStore unit, and Flask API integration tests
├── pytest.ini              # Pytest configuration
├── requirements.txt        # Pinned Python dependencies
└── .gitignore
```

## Getting Started

### Prerequisites

- Python 3.10 or higher

### Installation & Local Run

1. **Clone the repository:**
   ```bash
   git clone https://github.com/justinepetroff-web/justine-famous-quotes.git
   cd justine-famous-quotes
   ```

2. **Create and activate a virtual environment:**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```
   *(On Windows PowerShell: `.venv\Scripts\Activate.ps1`)*

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Start the development server:**
   ```bash
   python app.py
   ```
   *(Alternatively: `flask --app app run --debug`)*

5. Open **http://127.0.0.1:5000** in your browser.

## Running Tests

The test suite verifies dataset integrity (100 unique quotes across all 10 expected categories), `QuoteStore` filtering and repeat-exclusion logic, and every Flask route:

```bash
pytest
```

## API Reference

All API endpoints are read-only `GET` routes returning JSON.

| Endpoint | Query Parameters | Description |
| :--- | :--- | :--- |
| `GET /` | — | Renders the HTML web application (`index.html`). |
| `GET /api/quotes/random` | `author`, `category`, `exclude_id` | Returns one random matching quote and total `pool_size`. Returns `404` if no quotes match. |
| `GET /api/quotes` | `author`, `category` | Returns all matching quotes (or all 100 if unfiltered), plus `total` and echoed `filters`. |
| `GET /api/quotes/export.csv` | `author`, `category` | Downloads matching quotes (or all 100 if unfiltered) as a UTF-8 CSV file (`id,text,author,categories`). |
| `GET /api/categories` | — | Returns alphabetically sorted categories with quote counts and `total_quotes`. |
| `GET /api/authors` | — | Returns alphabetically sorted authors with quote counts. |

### Example Requests & Responses

**Filter quotes by author and category:**
```bash
curl "http://127.0.0.1:5000/api/quotes?author=einstein&category=Creativity"
```
```json
{
  "filters": {
    "author": "einstein",
    "category": "Creativity"
  },
  "quotes": [
    {
      "id": 14,
      "text": "Imagination is more important than knowledge. Knowledge is limited. Imagination encircles the world.",
      "author": "Albert Einstein",
      "categories": ["Creativity", "Science"]
    },
    {
      "id": 17,
      "text": "Anyone who has never made a mistake has never tried anything new.",
      "author": "Albert Einstein",
      "categories": ["Creativity", "Courage"]
    }
  ],
  "total": 2
}
```

**Fetch a random matching quote while avoiding repeats:**
```bash
curl "http://127.0.0.1:5000/api/quotes/random?author=einstein&category=Creativity&exclude_id=14"
```
```json
{
  "pool_size": 2,
  "quote": {
    "id": 17,
    "text": "Anyone who has never made a mistake has never tried anything new.",
    "author": "Albert Einstein",
    "categories": ["Creativity", "Courage"]
  }
}
```

**No matches on `/api/quotes/random` (`404 Not Found`):**
```json
{
  "error": "No quotes found matching the given filters.",
  "pool_size": 0
}
```

## Data Format

Quotes live in `data/quotes.json` as a JSON array of objects validated on startup by `QuoteStore`:

```json
{
  "id": 1,
  "text": "The unexamined life is not worth living.",
  "author": "Socrates",
  "categories": ["Philosophy", "Wisdom"]
}
```

- `id`: Unique integer (booleans rejected).
- `text`: Non-empty string.
- `author`: Non-empty string.
- `categories`: Non-empty list of non-empty category strings (`Courage`, `Creativity`, `Humor`, `Inspiration`, `Leadership`, `Life`, `Philosophy`, `Science`, `Success`, `Wisdom`).
