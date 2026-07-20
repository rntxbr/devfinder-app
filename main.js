/**
 * DevFinder — GitHub user search app
 * Production-ready client for the GitHub REST API v3
 */

const CONFIG = {
  API_BASE_URL: "https://api.github.com",
  DEBOUNCE_DELAY: 450,
  MAX_REPOS: 100,
  TOP_REPOS_COUNT: 3,
  CACHE_KEY: "devfinder_profiles_v2",
  CACHE_TTL_MS: 1000 * 60 * 60 * 6, // 6 hours
  MAX_CACHE_ENTRIES: 30,
  MAX_RANKING: 10,
  USERNAME_REGEX: /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/,
  EXAMPLE_USERS: ["torvalds", "gaearon", "kentcdodds", "tj", "sindresorhus"],
};

const SELECTORS = {
  searchInput: "#searchInput",
  clearSearchBtn: "#clearSearchBtn",
  userCard: "#userCard",
  errorMessage: "#errorMessage",
  userResultContainer: "#userResultContainer",
  mainContainer: "#mainContainer",
  loadingIcon: ".icon-header .loading",
  magnifierIcon: ".icon-header .magnifier",
  aboutBtn: "#aboutBtn",
  aboutModal: "#aboutModal",
  closeModal: "#closeModal",
  helpText: "#helpText",
  rankingContainer: "#rankingContainer",
  rankingList: "#rankingList",
  statusLive: "#statusLive",
  closeResultBtn: "#closeResultBtn",
  exampleChips: "#exampleChips",
  logo: ".logo",
  inputWrapper: ".input-wrapper-header",
};

const DOM = Object.entries(SELECTORS).reduce((acc, [key, selector]) => {
  acc[key] = document.querySelector(selector);
  return acc;
}, {});

class GitHubSearchApp {
  constructor() {
    this.searchTimeout = null;
    this.abortController = null;
    this.requestId = 0;
    this.lastFocusedBeforeModal = null;
    this.loadCache();
    this.init();
  }

  /* ─── Cache ─────────────────────────────────────────────── */

  loadCache() {
    this.cache = new Map();
    try {
      const saved = localStorage.getItem(CONFIG.CACHE_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved);
      const now = Date.now();

      for (const [key, entry] of parsed) {
        if (!entry || !entry.data || !entry.cachedAt) continue;
        if (now - entry.cachedAt > CONFIG.CACHE_TTL_MS) continue;
        this.cache.set(key, entry);
      }
    } catch {
      this.cache = new Map();
    }
  }

  saveCache() {
    try {
      // Keep only the most recently used entries
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => (b[1].lastAccessed || 0) - (a[1].lastAccessed || 0))
        .slice(0, CONFIG.MAX_CACHE_ENTRIES);

      this.cache = new Map(entries);
      localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify(entries));
    } catch {
      // Quota exceeded or private mode — ignore
    }
  }

  getCached(username) {
    const key = username.toLowerCase();
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.cachedAt > CONFIG.CACHE_TTL_MS) {
      this.cache.delete(key);
      this.saveCache();
      return null;
    }

    entry.lastAccessed = Date.now();
    entry.searchCount = (entry.searchCount || 0) + 1;
    this.saveCache();
    return entry.data;
  }

  setCached(username, data) {
    const key = username.toLowerCase();
    const existing = this.cache.get(key);
    this.cache.set(key, {
      data,
      cachedAt: Date.now(),
      lastAccessed: Date.now(),
      searchCount: (existing?.searchCount || 0) + 1,
    });
    this.saveCache();
  }

  /* ─── Init & Events ─────────────────────────────────────── */

  init() {
    this.bindEvents();
    this.renderExampleChips();
    this.renderRanking();
    this.syncClearButton();
  }

  bindEvents() {
    DOM.aboutBtn?.addEventListener("click", () => this.toggleModal(true));
    DOM.closeModal?.addEventListener("click", () => this.toggleModal(false));
    DOM.aboutModal?.addEventListener("click", (e) => {
      if (e.target === DOM.aboutModal) this.toggleModal(false);
    });

    DOM.closeResultBtn?.addEventListener("click", () => this.resetToHome());

    DOM.logo?.addEventListener("click", () => this.resetToHome());
    DOM.logo?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.resetToHome();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (DOM.aboutModal?.classList.contains("active")) {
          this.toggleModal(false);
          return;
        }
        if (DOM.userResultContainer?.classList.contains("active")) {
          this.resetToHome();
        }
      }

      // Focus trap inside modal
      if (
        e.key === "Tab" &&
        DOM.aboutModal?.classList.contains("active")
      ) {
        this.trapFocus(e, DOM.aboutModal);
      }
    });

    DOM.searchInput?.addEventListener("input", (e) => {
      this.syncClearButton();
      this.handleSearchInput(e.target.value);
    });

    DOM.searchInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const username = e.target.value.trim();
        if (username) {
          clearTimeout(this.searchTimeout);
          this.searchUser(username);
        }
      }
    });

    DOM.clearSearchBtn?.addEventListener("click", () => {
      DOM.searchInput.value = "";
      DOM.searchInput.focus();
      this.syncClearButton();
      this.resetToHome();
    });

    DOM.rankingList?.addEventListener("click", (e) => {
      const item = e.target.closest("[data-username]");
      if (!item) return;
      e.preventDefault();
      const username = item.dataset.username;
      DOM.searchInput.value = username;
      this.syncClearButton();
      this.searchUser(username);
    });

    DOM.exampleChips?.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-example]");
      if (!chip) return;
      const username = chip.dataset.example;
      DOM.searchInput.value = username;
      this.syncClearButton();
      this.searchUser(username);
    });
  }

  syncClearButton() {
    if (!DOM.clearSearchBtn || !DOM.searchInput) return;
    const hasValue = DOM.searchInput.value.trim().length > 0;
    DOM.clearSearchBtn.hidden = !hasValue;
    DOM.clearSearchBtn.setAttribute("aria-hidden", String(!hasValue));
  }

  /* ─── Modal ─────────────────────────────────────────────── */

  toggleModal(show) {
    if (!DOM.aboutModal) return;

    DOM.aboutModal.classList.toggle("active", show);
    DOM.aboutModal.setAttribute("aria-hidden", String(!show));
    document.body.classList.toggle("modal-open", show);

    if (show) {
      this.lastFocusedBeforeModal = document.activeElement;
      DOM.aboutBtn?.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => DOM.closeModal?.focus());
    } else {
      DOM.aboutBtn?.setAttribute("aria-expanded", "false");
      this.lastFocusedBeforeModal?.focus?.();
      this.lastFocusedBeforeModal = null;
    }
  }

  trapFocus(e, container) {
    const focusable = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ─── Search ────────────────────────────────────────────── */

  handleSearchInput(value) {
    clearTimeout(this.searchTimeout);
    const username = value.trim();

    if (!username) {
      this.abortPending();
      this.hideResult();
      this.announce("");
      return;
    }

    this.searchTimeout = setTimeout(() => {
      this.searchUser(username);
    }, CONFIG.DEBOUNCE_DELAY);
  }

  abortPending() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  validateUsername(username) {
    if (!username) return "Please enter a GitHub username.";
    if (username.length > 39) return "Username is too long (max 39 characters).";
    if (!CONFIG.USERNAME_REGEX.test(username)) {
      return "Invalid username. Use letters, numbers, and single hyphens only.";
    }
    return null;
  }

  async searchUser(username) {
    const trimmed = username.trim();
    const validationError = this.validateUsername(trimmed);
    if (validationError) {
      this.showError(validationError);
      DOM.userCard.innerHTML = "";
      this.showResult();
      this.announce(validationError);
      return;
    }

    // Serve from cache when available
    const cached = this.getCached(trimmed);
    if (cached) {
      this.hideError();
      this.displayUserData(cached);
      this.showResult();
      this.announce(`Showing cached profile for ${cached.user.login}`);
      this.renderRanking();
      return;
    }

    this.abortPending();
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    const currentRequest = ++this.requestId;

    try {
      this.showLoading();
      this.hideError();
      this.announce(`Searching for ${trimmed}…`);

      const [userData, repos] = await Promise.all([
        this.fetchUserData(trimmed, signal),
        this.fetchUserRepos(trimmed, signal),
      ]);

      // Ignore stale responses
      if (currentRequest !== this.requestId) return;

      const processedData = this.processUserData(userData, repos);
      this.setCached(userData.login, processedData);

      this.displayUserData(processedData);
      this.showResult();
      this.announce(`Found profile for ${userData.login}`);
      this.renderRanking();
    } catch (error) {
      if (error.name === "AbortError") return;
      if (currentRequest !== this.requestId) return;

      console.error("Search error:", error);
      this.showError(error.message);
      DOM.userCard.innerHTML = "";
      this.showResult();
      this.announce(error.message);
    } finally {
      if (currentRequest === this.requestId) {
        this.hideLoading();
        this.abortController = null;
      }
    }
  }

  async fetchUserData(username, signal) {
    let response;
    try {
      response = await fetch(
        `${CONFIG.API_BASE_URL}/users/${encodeURIComponent(username)}`,
        {
          signal,
          headers: {
            Accept: "application/vnd.github+json",
          },
        }
      );
    } catch (err) {
      if (err.name === "AbortError") throw err;
      throw new Error(
        "Network error. Check your connection and try again."
      );
    }

    if (!response.ok) {
      throw new Error(this.mapHttpError(response.status, username, response));
    }

    return response.json();
  }

  async fetchUserRepos(username, signal) {
    let response;
    try {
      // Note: /users/{user}/repos does not support sort=stars — we sort client-side
      response = await fetch(
        `${CONFIG.API_BASE_URL}/users/${encodeURIComponent(
          username
        )}/repos?per_page=${CONFIG.MAX_REPOS}&sort=updated`,
        {
          signal,
          headers: {
            Accept: "application/vnd.github+json",
          },
        }
      );
    } catch (err) {
      if (err.name === "AbortError") throw err;
      return [];
    }

    if (response.ok) {
      return response.json();
    }
    return [];
  }

  mapHttpError(status, username, response) {
    if (status === 404) {
      return `User "${username}" was not found on GitHub.`;
    }
    if (status === 403) {
      const remaining = response.headers.get("X-RateLimit-Remaining");
      if (remaining === "0") {
        const reset = response.headers.get("X-RateLimit-Reset");
        const resetDate = reset
          ? new Date(Number(reset) * 1000).toLocaleTimeString()
          : null;
        return resetDate
          ? `API rate limit exceeded. Resets around ${resetDate}.`
          : "API rate limit exceeded. Please try again later.";
      }
      return "Access denied by GitHub API. Please try again later.";
    }
    if (status === 401) {
      return "Unauthorized request. Please try again later.";
    }
    if (status >= 500) {
      return "GitHub is temporarily unavailable. Please try again soon.";
    }
    return `Error fetching user data (${status}).`;
  }

  processUserData(user, repos) {
    const totalStars = repos.reduce(
      (sum, repo) => sum + (repo.stargazers_count || 0),
      0
    );
    const topRepos = [...repos]
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, CONFIG.TOP_REPOS_COUNT);

    let score =
      (user.followers || 0) * 5 +
      totalStars * 10 +
      (user.public_repos || 0) * 2;
    if (user.bio) score += 20;
    if (user.company) score += 10;
    if (user.location) score += 10;
    if (user.blog) score += 10;

    return { user, totalStars, topRepos, score };
  }

  /* ─── Rendering ─────────────────────────────────────────── */

  displayUserData({ user, totalStars, topRepos }) {
    const joinDate = new Date(user.created_at).toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const template = `
      ${this.buildUserHeader(user)}
      ${this.buildUserBio(user)}
      ${this.buildUserStats(user, totalStars)}
      ${this.buildUserDetails(user)}
      ${this.buildTopRepos(topRepos)}
      ${this.buildUserFooter(joinDate)}
    `;

    DOM.userCard.innerHTML = template;
    DOM.userCard.setAttribute("aria-label", `Profile of ${user.login}`);
  }

  safeHttpUrl(url, fallback = "") {
    if (!url) return fallback;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.href;
      }
    } catch {
      /* invalid */
    }
    return fallback;
  }

  buildUserHeader(user) {
    const displayName = this.escapeHtml(user.name || user.login);
    const login = this.escapeHtml(user.login);
    const avatar = this.escapeHtml(
      this.safeHttpUrl(user.avatar_url, "https://github.com/identicons/jasonlong.png")
    );
    const profileUrl = this.escapeHtml(
      this.safeHttpUrl(user.html_url, `https://github.com/${user.login}`)
    );

    return `
      <div class="user-header">
        <img
          src="${avatar}"
          alt="Avatar of ${login}"
          class="user-avatar"
          width="80"
          height="80"
          loading="eager"
          decoding="async"
        />
        <div class="user-info">
          <h2 class="user-name">${displayName}</h2>
          <a
            href="${profileUrl}"
            target="_blank"
            rel="noopener noreferrer"
            class="user-username"
          >
            @${login}
          </a>
        </div>
      </div>
    `;
  }

  buildUserBio(user) {
    return user.bio
      ? `<p class="user-bio">${this.escapeHtml(user.bio)}</p>`
      : "";
  }

  buildUserStats(user, totalStars) {
    const stats = [
      {
        value: user.public_repos,
        label: "Repositories",
        title: `${user.public_repos?.toLocaleString() || 0} public repositories`,
      },
      {
        value: totalStars,
        label: "Stars",
        title: `${totalStars.toLocaleString()} total stars`,
      },
      {
        value: user.followers,
        label: "Followers",
        title: `${user.followers?.toLocaleString() || 0} followers`,
      },
      {
        value: user.following,
        label: "Following",
        title: `Following ${user.following?.toLocaleString() || 0} users`,
      },
    ];

    return `
      <div class="user-stats" role="group" aria-label="User statistics">
        ${stats
          .map(
            ({ value, label, title }, i) => `
          <div class="stat-item" style="--i: ${i}" title="${this.escapeHtml(
              title
            )}">
            <span class="stat-value">${this.formatNumber(value)}</span>
            <span class="stat-label">${label}</span>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  }

  buildUserDetails(user) {
    const details = [];

    if (user.company) {
      const company = user.company.trim();
      const isOrg = company.startsWith("@");
      const orgName = isOrg ? company.slice(1) : null;
      const content = isOrg
        ? `<a href="https://github.com/${this.escapeHtml(
            orgName
          )}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(
            company
          )}</a>`
        : `<span>${this.escapeHtml(company)}</span>`;

      details.push({
        icon: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"></path><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"></path><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"></path><path d="M10 6h4"></path><path d="M10 10h4"></path><path d="M10 14h4"></path><path d="M10 18h4"></path>',
        content,
        label: "Company",
      });
    }

    if (user.location) {
      details.push({
        icon: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>',
        content: `<span>${this.escapeHtml(user.location)}</span>`,
        label: "Location",
      });
    }

    if (user.blog) {
      const raw = user.blog.trim();
      const blogUrl = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const safeHref = this.safeHttpUrl(blogUrl, "#");

      details.push({
        icon: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>',
        content: `<a href="${this.escapeHtml(
          safeHref
        )}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(
          raw
        )}</a>`,
        label: "Website",
      });
    }

    if (user.twitter_username) {
      details.push({
        icon: '<path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"></path>',
        content: `<a href="https://twitter.com/${this.escapeHtml(
          user.twitter_username
        )}" target="_blank" rel="noopener noreferrer">@${this.escapeHtml(
          user.twitter_username
        )}</a>`,
        label: "Twitter",
      });
    }

    if (details.length === 0) return "";

    return `
      <div class="user-details" role="list" aria-label="Profile details">
        ${details
          .map(
            ({ icon, content, label }) => `
          <div class="detail-item" role="listitem" aria-label="${this.escapeHtml(
            label
          )}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              ${icon}
            </svg>
            ${content}
          </div>
        `
          )
          .join("")}
      </div>
    `;
  }

  buildTopRepos(repos) {
    if (!repos.length) {
      return `
        <div class="top-repos">
          <h3 class="repos-title">Popular Repositories</h3>
          <p class="repos-empty">No public repositories found.</p>
        </div>
      `;
    }

    return `
      <div class="top-repos">
        <h3 class="repos-title">Popular Repositories</h3>
        <div class="repos-list" role="list">
          ${repos
            .map(
              (repo, index) => `
            <a
              href="${this.escapeHtml(repo.html_url)}"
              target="_blank"
              rel="noopener noreferrer"
              class="repo-item"
              style="--i: ${index + 1}"
              role="listitem"
            >
              <div class="repo-info">
                <span class="repo-name">${this.escapeHtml(repo.name)}</span>
                ${
                  repo.description
                    ? `<span class="repo-description">${this.escapeHtml(
                        repo.description
                      )}</span>`
                    : ""
                }
              </div>
              <div class="repo-stats">
                ${
                  repo.language
                    ? `<span class="repo-language">${this.escapeHtml(
                        repo.language
                      )}</span>`
                    : ""
                }
                <span class="repo-stars" title="${repo.stargazers_count.toLocaleString()} stars">
                  <span aria-hidden="true">★</span> ${this.formatNumber(
                    repo.stargazers_count
                  )}
                </span>
              </div>
            </a>
          `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  buildUserFooter(joinDate) {
    return `
      <div class="user-footer">
        <span>Joined ${this.escapeHtml(joinDate)}</span>
      </div>
    `;
  }

  renderExampleChips() {
    if (!DOM.exampleChips) return;
    DOM.exampleChips.innerHTML = CONFIG.EXAMPLE_USERS.map(
      (user) => `
      <button type="button" class="example-chip" data-example="${this.escapeHtml(
        user
      )}" aria-label="Search for ${this.escapeHtml(user)}">
        ${this.escapeHtml(user)}
      </button>
    `
    ).join("");
  }

  renderRanking() {
    if (!DOM.rankingContainer || !DOM.rankingList) return;

    if (this.cache.size === 0) {
      DOM.rankingContainer.hidden = true;
      if (DOM.helpText) DOM.helpText.hidden = false;
      return;
    }

    if (this.cache.size > 2) {
      if (DOM.helpText) DOM.helpText.hidden = true;
    } else {
      if (DOM.helpText) DOM.helpText.hidden = false;
    }

    DOM.rankingContainer.hidden = false;

    const profiles = Array.from(this.cache.values())
      .map((entry) => ({
        ...entry.data,
        searchCount: entry.searchCount || 1,
      }))
      .sort((a, b) => {
        // Primary: score, secondary: search frequency
        if (b.score !== a.score) return b.score - a.score;
        return b.searchCount - a.searchCount;
      })
      .slice(0, CONFIG.MAX_RANKING);

    DOM.rankingList.innerHTML = profiles
      .map(
        (profile, index) => `
      <button
        type="button"
        class="ranking-item"
        data-username="${this.escapeHtml(profile.user.login)}"
        style="animation-delay: ${0.1 + index * 0.05}s"
        aria-label="View profile of ${this.escapeHtml(
          profile.user.name || profile.user.login
        )}"
      >
        <div class="rank-position" aria-hidden="true">#${index + 1}</div>
        <img
          src="${this.escapeHtml(profile.user.avatar_url)}"
          alt=""
          class="rank-avatar"
          width="50"
          height="50"
          loading="lazy"
          decoding="async"
        />
        <div class="rank-info">
          <span class="rank-name">
            ${this.escapeHtml(profile.user.name || profile.user.login)}
          </span>
          <div class="rank-meta">
            <span class="rank-username">@${this.escapeHtml(
              profile.user.login
            )}</span>
            <span class="rank-score">
              Score
              <span class="rank-score-value">${profile.score.toLocaleString()}</span>
            </span>
          </div>
        </div>
        <svg class="rank-arrow" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
    `
      )
      .join("");
  }

  /* ─── UI State ──────────────────────────────────────────── */

  formatNumber(num) {
    const n = Number(num) || 0;
    if (n >= 1_000_000) {
      return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + "M";
    }
    if (n >= 10_000) {
      return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + "K";
    }
    return n.toLocaleString();
  }

  escapeHtml(text) {
    if (text == null) return "";
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
  }

  announce(message) {
    if (!DOM.statusLive) return;
    DOM.statusLive.textContent = message;
  }

  showLoading() {
    this.setLoadingState(true);
  }

  hideLoading() {
    this.setLoadingState(false);
  }

  setLoadingState(isLoading) {
    DOM.inputWrapper?.classList.toggle("is-loading", isLoading);
    DOM.searchInput?.setAttribute("aria-busy", String(isLoading));
    if (DOM.loadingIcon) {
      DOM.loadingIcon.style.opacity = isLoading ? "1" : "0";
    }
    if (DOM.magnifierIcon) {
      DOM.magnifierIcon.style.opacity = isLoading ? "0" : "1";
    }
  }

  showError(message) {
    if (!DOM.errorMessage) return;
    DOM.errorMessage.innerHTML = `
      <div class="error-icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <p class="error-text">${this.escapeHtml(message)}</p>
      <button type="button" class="error-retry-btn" id="errorRetryBtn">Try again</button>
    `;
    DOM.errorMessage.classList.add("active");
    DOM.errorMessage.setAttribute("role", "alert");

    const retryBtn = document.getElementById("errorRetryBtn");
    retryBtn?.addEventListener("click", () => {
      const username = DOM.searchInput?.value.trim();
      if (username) this.searchUser(username);
    });
  }

  hideError() {
    if (!DOM.errorMessage) return;
    DOM.errorMessage.textContent = "";
    DOM.errorMessage.classList.remove("active");
    DOM.errorMessage.removeAttribute("role");
  }

  showResult() {
    DOM.mainContainer?.classList.add("has-results");
    DOM.userResultContainer?.classList.add("active");
    DOM.userResultContainer?.setAttribute("aria-hidden", "false");
    if (DOM.helpText) DOM.helpText.hidden = true;
    if (DOM.rankingContainer) DOM.rankingContainer.hidden = true;
    if (DOM.exampleChips) DOM.exampleChips.hidden = true;
    DOM.closeResultBtn?.removeAttribute("hidden");
  }

  hideResult() {
    DOM.mainContainer?.classList.remove("has-results");
    DOM.userResultContainer?.classList.remove("active");
    DOM.userResultContainer?.setAttribute("aria-hidden", "true");
    if (DOM.userCard) DOM.userCard.innerHTML = "";
    this.hideError();
    if (DOM.helpText) DOM.helpText.hidden = false;
    if (DOM.exampleChips) DOM.exampleChips.hidden = false;
    DOM.closeResultBtn?.setAttribute("hidden", "");
    this.renderRanking();
  }

  resetToHome() {
    clearTimeout(this.searchTimeout);
    this.abortPending();
    this.requestId++;
    this.hideLoading();

    if (DOM.searchInput) {
      DOM.searchInput.value = "";
    }
    this.syncClearButton();
    this.hideResult();
    this.announce("Search cleared");
    DOM.searchInput?.focus();
  }
}

// Boot
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => new GitHubSearchApp());
} else {
  new GitHubSearchApp();
}
