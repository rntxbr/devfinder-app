const CONFIG = {
  API_BASE_URL: "https://api.github.com",
  DEBOUNCE_DELAY: 500,
  MAX_REPOS: 100,
  TOP_REPOS_COUNT: 3,
};

const SELECTORS = {
  searchInput: "#searchInput",
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
};

const DOM = Object.entries(SELECTORS).reduce((acc, [key, selector]) => {
  acc[key] = document.querySelector(selector);
  return acc;
}, {});

class GitHubSearchApp {
  constructor() {
    this.searchTimeout = null;
    this.cache = new Map();
    this.init();
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    DOM.aboutBtn.addEventListener("click", () => this.toggleModal(true));
    DOM.closeModal.addEventListener("click", () => this.toggleModal(false));
    DOM.aboutModal.addEventListener("click", (e) => {
      if (e.target === DOM.aboutModal) this.toggleModal(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && DOM.aboutModal.classList.contains("active")) {
        this.toggleModal(false);
      }
    });

    DOM.searchInput.addEventListener("input", (e) => {
      this.handleSearchInput(e.target.value);
    });

    DOM.searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        const username = e.target.value.trim();
        if (username) {
          clearTimeout(this.searchTimeout);
          this.searchUser(username);
        }
      }
    });
  }

  toggleModal(show) {
    DOM.aboutModal.classList.toggle("active", show);
  }

  handleSearchInput(value) {
    clearTimeout(this.searchTimeout);
    const username = value.trim();

    if (!username) {
      this.hideResult();
      return;
    }

    this.searchTimeout = setTimeout(() => {
      this.searchUser(username);
    }, CONFIG.DEBOUNCE_DELAY);
  }

  async searchUser(username) {
    if (this.cache.has(username)) {
      const cachedData = this.cache.get(username);
      this.displayUserData(cachedData);
      this.showResult();
      return;
    }

    try {
      this.showLoading();
      this.hideError();

      const [userData, repos] = await Promise.all([
        this.fetchUserData(username),
        this.fetchUserRepos(username),
      ]);

      const processedData = this.processUserData(userData, repos);
      this.cache.set(username, processedData);

      this.displayUserData(processedData);
      this.showResult();
    } catch (error) {
      console.error("Error:", error);
      this.showError(error.message);
      DOM.userCard.innerHTML = "";
      this.showResult();
    } finally {
      this.hideLoading();
    }
  }

  async fetchUserData(username) {
    const response = await fetch(`${CONFIG.API_BASE_URL}/users/${username}`);

    if (!response.ok) {
      const errorMessages = {
        404: `User "${username}" not found`,
        403: "API rate limit exceeded. Please try again later.",
      };
      throw new Error(
        errorMessages[response.status] || "Error fetching user data"
      );
    }

    return response.json();
  }

  async fetchUserRepos(username) {
    const response = await fetch(
      `${CONFIG.API_BASE_URL}/users/${username}/repos?sort=stars&per_page=${CONFIG.MAX_REPOS}`
    );

    if (response.ok) {
      return response.json();
    }
    return [];
  }

  processUserData(user, repos) {
    const totalStars = repos.reduce(
      (sum, repo) => sum + repo.stargazers_count,
      0
    );
    const topRepos = repos
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, CONFIG.TOP_REPOS_COUNT);

    return { user, totalStars, topRepos };
  }

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
  }

  buildUserHeader(user) {
    return `
      <div class="user-header">
        <img src="${user.avatar_url}" alt="${
      user.name || user.login
    }" class="user-avatar" />
        <div class="user-info">
          <h2 class="user-name">${user.name || user.login}</h2>
          <a href="${
            user.html_url
          }" target="_blank" rel="noopener noreferrer" class="user-username">
            @${user.login}
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
      { value: user.public_repos, label: "Repositories" },
      { value: totalStars, label: "★ Stars" },
      { value: user.followers, label: "Followers" },
      { value: user.following, label: "Following" },
    ];

    return `
      <div class="user-stats">
        ${stats
          .map(
            ({ value, label }) => `
          <div class="stat-item">
            <span class="stat-value">${value}</span>
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
      details.push({
        icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>',
        content: `<span>${this.escapeHtml(user.company)}</span>`,
      });
    }

    if (user.location) {
      details.push({
        icon: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>',
        content: `<span>${this.escapeHtml(user.location)}</span>`,
      });
    }

    if (user.blog) {
      const blogUrl = user.blog.startsWith("http")
        ? user.blog
        : `https://${user.blog}`;
      details.push({
        icon: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>',
        content: `<a href="${blogUrl}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(
          user.blog
        )}</a>`,
      });
    }

    if (details.length === 0) return "";

    return `
      <div class="user-details">
        ${details
          .map(
            ({ icon, content }) => `
          <div class="detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
    if (!repos.length) return "";

    return `
      <div class="top-repos">
        <h3 class="repos-title">Popular Repositories</h3>
        <div class="repos-list">
          ${repos
            .map(
              (repo, index) => `
            <a href="${
              repo.html_url
            }" target="_blank" rel="noopener noreferrer" class="repo-item" style="--i: ${
                index + 1
              }">
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
                <span class="repo-stars">★ ${repo.stargazers_count}</span>
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
        <span>Joined ${joinDate}</span>
      </div>
    `;
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  showLoading() {
    this.setLoadingState(true);
  }

  hideLoading() {
    this.setLoadingState(false);
  }

  setLoadingState(isLoading) {
    DOM.loadingIcon.style.opacity = isLoading ? "1" : "0";
    DOM.magnifierIcon.style.opacity = isLoading ? "0" : "1";
  }

  showError(message) {
    DOM.errorMessage.textContent = message;
    DOM.errorMessage.classList.add("active");
    DOM.userCard.innerHTML = "";
  }

  hideError() {
    DOM.errorMessage.textContent = "";
    DOM.errorMessage.classList.remove("active");
  }

  showResult() {
    DOM.mainContainer.classList.add("has-results");
    DOM.userResultContainer.classList.add("active");
  }

  hideResult() {
    DOM.mainContainer.classList.remove("has-results");
    DOM.userResultContainer.classList.remove("active");
    DOM.userCard.innerHTML = "";
    this.hideError();
  }
}

new GitHubSearchApp();
