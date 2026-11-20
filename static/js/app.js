(() => {
  "use strict";

  const state = {
    currentQuote: null,
    authorQuery: "",
    selectedCategory: "",
    totalQuotes: 100,
    poolSize: 100,
    matchingQuotes: [],
    showAllUnfiltered: false,
    categories: [],
    activeController: null,
    debounceTimer: null,
  };

  const THEME_STORAGE_KEY = "famous-quotes-theme";

  const dom = {
    themeToggle: document.getElementById("theme-toggle"),
    themeToggleLabel: document.getElementById("theme-toggle-label"),
    poolStatus: document.getElementById("pool-status"),
    heroQuoteContent: document.getElementById("hero-quote-content"),
    heroEmpty: document.getElementById("hero-empty"),
    heroEmptyDetail: document.getElementById("hero-empty-detail"),
    heroClearBtn: document.getElementById("hero-clear-btn"),
    quoteFigure: document.getElementById("quote-figure"),
    featuredText: document.getElementById("featured-text"),
    featuredAuthor: document.getElementById("featured-author"),
    featuredCategories: document.getElementById("featured-categories"),
    randomBtn: document.getElementById("random-btn"),
    randomBtnLabel: document.getElementById("random-btn-label"),
    copyBtn: document.getElementById("copy-btn"),
    copyBtnLabel: document.getElementById("copy-btn-label"),
    statusAnnouncer: document.getElementById("status-announcer"),
    authorSearch: document.getElementById("author-search"),
    clearAuthorBtn: document.getElementById("clear-author-btn"),
    authorSuggestions: document.getElementById("author-suggestions"),
    categoryChips: document.getElementById("category-chips"),
    activeFilterBar: document.getElementById("active-filter-bar"),
    activeFilterSummary: document.getElementById("active-filter-summary"),
    clearAllBtn: document.getElementById("clear-all-btn"),
    resultsToolbar: document.getElementById("results-toolbar"),
    toggleBrowseBtn: document.getElementById("toggle-browse-btn"),
    exportCsvBtn: document.getElementById("export-csv-btn"),
    exportCsvLabel: document.getElementById("export-csv-label"),
    resultsHeader: document.getElementById("results-header"),
    resultsHeading: document.getElementById("results-heading"),
    resultsList: document.getElementById("results-list"),
    resultsEmpty: document.getElementById("results-empty"),
  };

  const copyResetTimers = new WeakMap();

  function hasActiveFilters() {
    return Boolean(state.authorQuery.trim() || state.selectedCategory);
  }

  function buildQueryParams(extra = {}) {
    const params = new URLSearchParams();
    const trimmedAuthor = state.authorQuery.trim();
    if (trimmedAuthor) {
      params.set("author", trimmedAuthor);
    }
    if (state.selectedCategory) {
      params.set("category", state.selectedCategory);
    }
    Object.entries(extra).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "") {
        params.set(key, String(value));
      }
    });
    return params.toString();
  }

  function announce(message) {
    dom.statusAnnouncer.textContent = "";
    window.requestAnimationFrame(() => {
      dom.statusAnnouncer.textContent = message;
    });
  }

  async function fetchJson(url, signal) {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal,
    });
    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }

  function createClipboardIcon() {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "card-btn-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");

    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", "9");
    rect.setAttribute("y", "9");
    rect.setAttribute("width", "13");
    rect.setAttribute("height", "13");
    rect.setAttribute("rx", "2");
    rect.setAttribute("ry", "2");

    const path = document.createElementNS(svgNS, "path");
    path.setAttribute(
      "d",
      "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
    );

    svg.append(rect, path);
    return svg;
  }

  async function handleCopyQuote(quote, buttonEl, labelEl, defaultLabel) {
    if (!quote) {
      return;
    }
    const existingTimer = copyResetTimers.get(buttonEl);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    const formatted = `"${quote.text}" — ${quote.author}`;
    try {
      await copyText(formatted);
      labelEl.textContent = "Copied!";
      buttonEl.classList.add("is-copied");
      announce(`Copied quote by ${quote.author} to clipboard.`);
      const timerId = window.setTimeout(() => {
        labelEl.textContent = defaultLabel;
        buttonEl.classList.remove("is-copied");
        copyResetTimers.delete(buttonEl);
      }, 1800);
      copyResetTimers.set(buttonEl, timerId);
    } catch {
      labelEl.textContent = "Copy failed";
      buttonEl.classList.remove("is-copied");
      const timerId = window.setTimeout(() => {
        labelEl.textContent = defaultLabel;
        copyResetTimers.delete(buttonEl);
      }, 1800);
      copyResetTimers.set(buttonEl, timerId);
    }
  }

  function handleExportCsv() {
    if (dom.exportCsvBtn.disabled) {
      return;
    }
    const queryString = buildQueryParams();
    const url = queryString
      ? `/api/quotes/export.csv?${queryString}`
      : "/api/quotes/export.csv";

    const link = document.createElement("a");
    link.href = url;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    const count = hasActiveFilters()
      ? state.matchingQuotes.length
      : state.totalQuotes;
    const noun = count === 1 ? "quote" : "quotes";
    announce(`Exporting ${count} ${noun} to CSV.`);
  }

  function createCategoryTagButton(categoryName) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "category-tag";
    btn.textContent = categoryName;
    btn.title = `Filter quotes by ${categoryName}`;
    btn.addEventListener("click", () => {
      selectCategory(categoryName);
    });
    return btn;
  }

  function renderFeaturedQuote(quote, poolSize) {
    const previousQuoteId = state.currentQuote ? state.currentQuote.id : null;
    state.currentQuote = quote;
    state.poolSize = poolSize;

    const filtered = hasActiveFilters();

    if (!quote) {
      dom.heroQuoteContent.hidden = true;
      dom.heroEmpty.hidden = false;
      dom.poolStatus.textContent = "0 matching quotes";
      dom.randomBtn.disabled = true;
      dom.copyBtn.disabled = true;
      dom.randomBtnLabel.textContent = "No Matching Quotes";

      const parts = [];
      if (state.authorQuery.trim()) {
        parts.push(`author "${state.authorQuery.trim()}"`);
      }
      if (state.selectedCategory) {
        parts.push(`category "${state.selectedCategory}"`);
      }
      dom.heroEmptyDetail.textContent = parts.length
        ? `No quotes matched ${parts.join(" and ")}.`
        : "No quotes available.";
      syncFeaturedHighlight();
      return;
    }

    dom.heroQuoteContent.hidden = false;
    dom.heroEmpty.hidden = true;
    dom.copyBtn.disabled = false;

    if (previousQuoteId !== quote.id) {
      dom.quoteFigure.classList.remove("is-animating");
      // Trigger reflow so the fade-in animation replays only when the quote changes.
      void dom.quoteFigure.offsetWidth;
      dom.quoteFigure.classList.add("is-animating");
    }

    dom.featuredText.textContent = quote.text;
    dom.featuredAuthor.textContent = quote.author;

    dom.featuredCategories.replaceChildren(
      ...quote.categories.map((cat) => createCategoryTagButton(cat))
    );

    if (filtered) {
      dom.poolStatus.textContent =
        poolSize === 1 ? "1 matching quote" : `${poolSize} matching quotes`;
      if (poolSize <= 1) {
        dom.randomBtn.disabled = true;
        dom.randomBtnLabel.textContent = "Only 1 Matching Quote";
      } else {
        dom.randomBtn.disabled = false;
        dom.randomBtnLabel.textContent = "Random Matching Quote";
      }
    } else {
      dom.poolStatus.textContent = `${poolSize} quotes in pool`;
      dom.randomBtn.disabled = poolSize <= 1;
      dom.randomBtnLabel.textContent = "New Random Quote";
    }

    syncFeaturedHighlight();
  }

  function syncFeaturedHighlight() {
    const featuredId = state.currentQuote ? String(state.currentQuote.id) : "";
    const cards = dom.resultsList.querySelectorAll(".quote-card");
    cards.forEach((card) => {
      card.classList.toggle("is-featured", card.dataset.quoteId === featuredId);
    });
  }

  function renderCategoryChips() {
    const fragment = document.createDocumentFragment();

    const allChip = document.createElement("button");
    allChip.type = "button";
    allChip.className = "category-chip";
    allChip.setAttribute("aria-pressed", String(state.selectedCategory === ""));
    const allLabel = document.createElement("span");
    allLabel.textContent = "All Categories";
    const allCount = document.createElement("span");
    allCount.className = "chip-count";
    allCount.textContent = String(state.totalQuotes);
    allChip.append(allLabel, allCount);
    allChip.addEventListener("click", () => selectCategory(""));
    fragment.appendChild(allChip);

    state.categories.forEach((cat) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "category-chip";
      const isSelected = state.selectedCategory.toLowerCase() === cat.name.toLowerCase();
      chip.setAttribute("aria-pressed", String(isSelected));

      const labelSpan = document.createElement("span");
      labelSpan.textContent = cat.name;
      const countSpan = document.createElement("span");
      countSpan.className = "chip-count";
      countSpan.textContent = String(cat.count);

      chip.append(labelSpan, countSpan);
      chip.addEventListener("click", () => {
        selectCategory(isSelected ? "" : cat.name);
      });
      fragment.appendChild(chip);
    });

    dom.categoryChips.replaceChildren(fragment);
  }

  function renderAuthorSuggestions(authors) {
    const fragment = document.createDocumentFragment();
    authors.forEach((author) => {
      const option = document.createElement("option");
      option.value = author.name;
      fragment.appendChild(option);
    });
    dom.authorSuggestions.replaceChildren(fragment);
  }

  function renderFilterBar() {
    const trimmedAuthor = state.authorQuery.trim();
    dom.clearAuthorBtn.hidden = !trimmedAuthor;

    if (!hasActiveFilters()) {
      dom.activeFilterBar.hidden = true;
      return;
    }

    const clauses = [];
    if (trimmedAuthor) {
      clauses.push(`author matching "${trimmedAuthor}"`);
    }
    if (state.selectedCategory) {
      clauses.push(`category ${state.selectedCategory}`);
    }

    const count = state.matchingQuotes.length;
    const noun = count === 1 ? "quote" : "quotes";
    dom.activeFilterSummary.textContent = `Showing ${count} ${noun} for ${clauses.join(" in ")}.`;
    dom.activeFilterBar.hidden = false;
  }

  function createResultCard(quote) {
    const article = document.createElement("article");
    article.className = "quote-card";
    article.dataset.quoteId = String(quote.id);
    if (state.currentQuote && state.currentQuote.id === quote.id) {
      article.classList.add("is-featured");
    }

    const quoteParagraph = document.createElement("p");
    quoteParagraph.className = "quote-card-text";
    quoteParagraph.textContent = `“${quote.text}”`;
    quoteParagraph.title = "Click to feature this quote above";
    quoteParagraph.addEventListener("click", () => featureQuote(quote));

    const footer = document.createElement("div");
    footer.className = "quote-card-footer";

    const byline = document.createElement("div");
    byline.className = "quote-card-byline";

    const authorBtn = document.createElement("button");
    authorBtn.type = "button";
    authorBtn.className = "author-link";
    authorBtn.textContent = quote.author;
    authorBtn.title = `Filter quotes by ${quote.author}`;
    authorBtn.addEventListener("click", () => filterByAuthor(quote.author));

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const featureBtn = document.createElement("button");
    featureBtn.type = "button";
    featureBtn.className = "card-action-btn";
    featureBtn.textContent = "Feature";
    featureBtn.addEventListener("click", () => featureQuote(quote));

    const copyCardBtn = document.createElement("button");
    copyCardBtn.type = "button";
    copyCardBtn.className = "card-action-btn card-copy-btn";
    copyCardBtn.setAttribute(
      "aria-label",
      `Copy quote by ${quote.author} to clipboard`
    );
    copyCardBtn.title = "Copy quote to clipboard";
    const copyCardLabel = document.createElement("span");
    copyCardLabel.textContent = "Copy to Clipboard";
    copyCardBtn.append(createClipboardIcon(), copyCardLabel);
    copyCardBtn.addEventListener("click", () =>
      handleCopyQuote(quote, copyCardBtn, copyCardLabel, "Copy to Clipboard")
    );

    actions.append(featureBtn, copyCardBtn);
    byline.append(authorBtn, actions);

    const tags = document.createElement("div");
    tags.className = "tag-row";
    quote.categories.forEach((cat) => {
      tags.appendChild(createCategoryTagButton(cat));
    });

    footer.append(byline, tags);
    article.append(quoteParagraph, footer);
    return article;
  }

  function renderExportButton() {
    const filtered = hasActiveFilters();
    const exportCount = filtered ? state.matchingQuotes.length : state.totalQuotes;
    dom.exportCsvBtn.disabled = exportCount === 0;
    dom.exportCsvLabel.textContent = `Export to CSV (${exportCount})`;
    dom.exportCsvBtn.title = filtered
      ? `Download ${exportCount} matching ${exportCount === 1 ? "quote" : "quotes"} as CSV`
      : `Download all ${exportCount} quotes as CSV`;
  }

  function renderResultsSection() {
    const filtered = hasActiveFilters();

    if (!filtered) {
      dom.toggleBrowseBtn.hidden = false;
      dom.toggleBrowseBtn.textContent = state.showAllUnfiltered
        ? "Hide full collection"
        : `Browse all ${state.totalQuotes} quotes`;
    } else {
      dom.toggleBrowseBtn.hidden = true;
    }

    renderExportButton();

    const shouldShowList = filtered || state.showAllUnfiltered;
    dom.resultsToolbar.classList.toggle("is-centered", !shouldShowList);

    if (!shouldShowList) {
      dom.resultsHeader.hidden = true;
      dom.resultsList.hidden = true;
      dom.resultsEmpty.hidden = true;
      return;
    }

    const quotes = state.matchingQuotes;
    dom.resultsHeader.hidden = false;

    if (filtered) {
      const noun = quotes.length === 1 ? "Matching Quote" : "Matching Quotes";
      dom.resultsHeading.textContent = `${quotes.length} ${noun}`;
    } else {
      dom.resultsHeading.textContent = `All ${quotes.length} Quotes`;
    }

    if (quotes.length === 0) {
      dom.resultsList.hidden = true;
      dom.resultsList.replaceChildren();
      dom.resultsEmpty.hidden = false;
      return;
    }

    dom.resultsEmpty.hidden = true;
    dom.resultsList.hidden = false;

    const fragment = document.createDocumentFragment();
    quotes.forEach((quote) => {
      fragment.appendChild(createResultCard(quote));
    });
    dom.resultsList.replaceChildren(fragment);
  }

  function featureQuote(quote) {
    const pool = hasActiveFilters() ? state.matchingQuotes.length : state.totalQuotes;
    renderFeaturedQuote(quote, pool);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function fetchRandomQuote() {
    if (state.activeController) {
      state.activeController.abort();
    }
    const controller = new AbortController();
    state.activeController = controller;

    dom.randomBtn.disabled = true;
    const queryString = buildQueryParams({
      exclude_id: state.currentQuote ? state.currentQuote.id : "",
    });
    const url = queryString
      ? `/api/quotes/random?${queryString}`
      : "/api/quotes/random";

    try {
      const { ok, data } = await fetchJson(url, controller.signal);
      if (!ok) {
        renderFeaturedQuote(null, 0);
        return;
      }
      renderFeaturedQuote(data.quote, data.pool_size);
    } catch (error) {
      if (error.name !== "AbortError") {
        dom.featuredText.textContent =
          "Unable to load a quote right now. Please try again.";
        dom.randomBtn.disabled = false;
      }
    }
  }

  async function applyFilters() {
    if (state.activeController) {
      state.activeController.abort();
    }
    const controller = new AbortController();
    state.activeController = controller;

    const filtered = hasActiveFilters();
    renderCategoryChips();

    if (!filtered && !state.showAllUnfiltered) {
      state.matchingQuotes = [];
      renderFilterBar();
      renderResultsSection();
      if (!state.currentQuote) {
        await fetchRandomQuote();
      } else {
        renderFeaturedQuote(state.currentQuote, state.totalQuotes);
      }
      return;
    }

    const queryString = buildQueryParams();
    const url = queryString ? `/api/quotes?${queryString}` : "/api/quotes";

    try {
      const { ok, data } = await fetchJson(url, controller.signal);
      if (!ok) {
        return;
      }

      state.matchingQuotes = data.quotes;
      renderFilterBar();
      renderResultsSection();

      if (filtered) {
        const currentStillMatches =
          state.currentQuote &&
          data.quotes.some((quote) => quote.id === state.currentQuote.id);

        if (data.quotes.length === 0) {
          renderFeaturedQuote(null, 0);
        } else if (!currentStillMatches) {
          const picked =
            data.quotes[Math.floor(Math.random() * data.quotes.length)];
          renderFeaturedQuote(picked, data.quotes.length);
        } else {
          renderFeaturedQuote(state.currentQuote, data.quotes.length);
        }
      } else if (state.currentQuote) {
        renderFeaturedQuote(state.currentQuote, state.totalQuotes);
      } else if (data.quotes.length > 0) {
        const picked =
          data.quotes[Math.floor(Math.random() * data.quotes.length)];
        renderFeaturedQuote(picked, state.totalQuotes);
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        announce("Could not update search results.");
      }
    }
  }

  function filterByAuthor(authorName) {
    window.clearTimeout(state.debounceTimer);
    state.authorQuery = authorName;
    dom.authorSearch.value = authorName;
    applyFilters();
  }

  function selectCategory(categoryName) {
    window.clearTimeout(state.debounceTimer);
    state.authorQuery = dom.authorSearch.value;
    state.selectedCategory = categoryName;
    applyFilters();
  }

  function clearAllFilters() {
    window.clearTimeout(state.debounceTimer);
    state.authorQuery = "";
    state.selectedCategory = "";
    dom.authorSearch.value = "";
    applyFilters();
  }

  function readSavedTheme() {
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      return saved === "dark" || saved === "light" ? saved : null;
    } catch {
      return null;
    }
  }

  function applyTheme(theme, { persist = false, shouldAnnounce = false } = {}) {
    const normalized = theme === "dark" ? "dark" : "light";
    const isDark = normalized === "dark";

    document.documentElement.setAttribute("data-theme", normalized);

    if (dom.themeToggle) {
      dom.themeToggle.setAttribute("aria-checked", String(isDark));
      dom.themeToggle.setAttribute(
        "aria-label",
        isDark ? "Switch to light mode" : "Switch to dark mode"
      );
    }
    if (dom.themeToggleLabel) {
      dom.themeToggleLabel.textContent = isDark ? "Dark" : "Light";
    }

    if (persist) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, normalized);
      } catch {
        // Ignore storage errors (e.g., private browsing restrictions).
      }
    }

    if (shouldAnnounce) {
      announce(isDark ? "Switched to dark mode." : "Switched to light mode.");
    }
  }

  function initTheme() {
    const attrTheme = document.documentElement.getAttribute("data-theme");
    const initialTheme =
      attrTheme === "dark" || attrTheme === "light"
        ? attrTheme
        : readSavedTheme() ||
          (window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light");

    applyTheme(initialTheme, { persist: false, shouldAnnounce: false });

    if (window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", (event) => {
        if (!readSavedTheme()) {
          applyTheme(event.matches ? "dark" : "light", {
            persist: false,
            shouldAnnounce: false,
          });
        }
      });
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next, { persist: true, shouldAnnounce: true });
  }

  function bindEvents() {
    if (dom.themeToggle) {
      dom.themeToggle.addEventListener("click", toggleTheme);
    }
    dom.randomBtn.addEventListener("click", fetchRandomQuote);

    dom.copyBtn.addEventListener("click", () => {
      handleCopyQuote(
        state.currentQuote,
        dom.copyBtn,
        dom.copyBtnLabel,
        "Copy to Clipboard"
      );
    });

    dom.featuredAuthor.addEventListener("click", () => {
      if (state.currentQuote) {
        filterByAuthor(state.currentQuote.author);
      }
    });

    dom.authorSearch.addEventListener("input", () => {
      state.authorQuery = dom.authorSearch.value;
      dom.clearAuthorBtn.hidden = !state.authorQuery.trim();
      window.clearTimeout(state.debounceTimer);
      state.debounceTimer = window.setTimeout(() => {
        applyFilters();
      }, 200);
    });

    dom.authorSearch.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        window.clearTimeout(state.debounceTimer);
        state.authorQuery = dom.authorSearch.value;
        applyFilters();
      } else if (event.key === "Escape" && dom.authorSearch.value) {
        event.preventDefault();
        state.authorQuery = "";
        dom.authorSearch.value = "";
        applyFilters();
      }
    });

    dom.clearAuthorBtn.addEventListener("click", () => {
      state.authorQuery = "";
      dom.authorSearch.value = "";
      dom.authorSearch.focus();
      applyFilters();
    });

    dom.clearAllBtn.addEventListener("click", clearAllFilters);
    dom.heroClearBtn.addEventListener("click", clearAllFilters);

    dom.toggleBrowseBtn.addEventListener("click", () => {
      state.showAllUnfiltered = !state.showAllUnfiltered;
      applyFilters();
    });

    dom.exportCsvBtn.addEventListener("click", handleExportCsv);

    document.addEventListener("keydown", (event) => {
      if (
        event.key.toLowerCase() !== "r" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      const tag = document.activeElement ? document.activeElement.tagName : "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return;
      }
      if (!dom.randomBtn.disabled) {
        event.preventDefault();
        fetchRandomQuote();
      }
    });
  }

  async function init() {
    initTheme();
    bindEvents();
    try {
      const [categoriesRes, authorsRes, randomRes] = await Promise.all([
        fetchJson("/api/categories"),
        fetchJson("/api/authors"),
        fetchJson("/api/quotes/random"),
      ]);

      if (categoriesRes.ok) {
        state.categories = categoriesRes.data.categories;
        state.totalQuotes = categoriesRes.data.total_quotes;
        renderCategoryChips();
      }
      if (authorsRes.ok) {
        renderAuthorSuggestions(authorsRes.data.authors);
      }
      if (randomRes.ok) {
        renderFeaturedQuote(randomRes.data.quote, randomRes.data.pool_size);
      }
      renderResultsSection();
    } catch {
      dom.featuredText.textContent =
        "Unable to connect to the quotes service. Please refresh the page.";
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
