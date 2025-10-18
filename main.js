// Elementos do DOM
const searchInput = document.getElementById("searchInput");
const userCard = document.getElementById("userCard");
const errorMessage = document.getElementById("errorMessage");
const userResultContainer = document.getElementById("userResultContainer");
const mainContainer = document.getElementById("mainContainer");
const loadingIcon = document.querySelector(".icon-header .loading");
const magnifierIcon = document.querySelector(".icon-header .magnifier");
const aboutBtn = document.getElementById("aboutBtn");
const aboutModal = document.getElementById("aboutModal");
const closeModal = document.getElementById("closeModal");
const helpText = document.getElementById("helpText");

let searchTimeout;

// Modal About functionality
aboutBtn.addEventListener("click", () => {
  aboutModal.classList.add("active");
});

closeModal.addEventListener("click", () => {
  aboutModal.classList.remove("active");
});

aboutModal.addEventListener("click", (e) => {
  if (e.target === aboutModal) {
    aboutModal.classList.remove("active");
  }
});

// Close modal with Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && aboutModal.classList.contains("active")) {
    aboutModal.classList.remove("active");
  }
});

// Escutar eventos de input
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimeout);

  const username = searchInput.value.trim();

  if (username.length === 0) {
    hideResult();
    return;
  }

  // Debounce de 500ms para evitar muitas requisições
  searchTimeout = setTimeout(() => {
    searchGithubUser(username);
  }, 500);
});

// Escutar evento de Enter
searchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    const username = searchInput.value.trim();
    if (username.length > 0) {
      clearTimeout(searchTimeout);
      searchGithubUser(username);
    }
  }
});

// Função para buscar usuário do GitHub
async function searchGithubUser(username) {
  try {
    showLoading();
    hideError();

    const response = await fetch(`https://api.github.com/users/${username}`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`User "${username}" not found`);
      } else if (response.status === 403) {
        throw new Error("API rate limit exceeded. Please try again later.");
      } else {
        throw new Error("Error fetching user data");
      }
    }

    const userData = await response.json();

    // Buscar repositórios do usuário
    const reposResponse = await fetch(
      `https://api.github.com/users/${username}/repos?sort=stars&per_page=100`
    );
    const repos = await reposResponse.json();

    // Calcular total de estrelas
    const totalStars = repos.reduce(
      (total, repo) => total + repo.stargazers_count,
      0
    );

    // Obter os 3 repositórios mais populares
    const topRepos = repos
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, 3);

    displayUserData(userData, totalStars, topRepos);
    hideLoading();
    showResult();
  } catch (error) {
    console.error("Error:", error);
    showError(error.message);
    hideLoading();
    userCard.innerHTML = "";
    showResult();
  }
}

// Função para exibir dados do usuário
function displayUserData(user, totalStars, topRepos) {
  const joinDate = new Date(user.created_at).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const cardHTML = `
    <div class="user-header">
      <img src="${user.avatar_url}" alt="${
    user.name || user.login
  }" class="user-avatar" />
      <div class="user-info">
        <h2 class="user-name">${user.name || user.login}</h2>
        <a href="${user.html_url}" target="_blank" class="user-username">@${
    user.login
  }</a>
      </div>
    </div>
    
    ${user.bio ? `<p class="user-bio">${user.bio}</p>` : ""}
    
    <div class="user-stats">
      <div class="stat-item">
        <span class="stat-value">${user.public_repos}</span>
        <span class="stat-label">Repositories</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${totalStars}</span>
        <span class="stat-label">★ Stars</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${user.followers}</span>
        <span class="stat-label">Followers</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${user.following}</span>
        <span class="stat-label">Following</span>
      </div>
    </div>
    
    ${
      user.location || user.company || user.blog
        ? `
      <div class="user-details">
        ${
          user.company
            ? `
          <div class="detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span>${user.company}</span>
          </div>
        `
            : ""
        }
        ${
          user.location
            ? `
          <div class="detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <span>${user.location}</span>
          </div>
        `
            : ""
        }
        ${
          user.blog
            ? `
          <div class="detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            <a href="${
              user.blog.startsWith("http") ? user.blog : "https://" + user.blog
            }" target="_blank">${user.blog}</a>
          </div>
        `
            : ""
        }
      </div>
    `
        : ""
    }
    
    ${
      topRepos.length > 0
        ? `
      <div class="top-repos">
        <h3 class="repos-title">Popular Repositories</h3>
        <div class="repos-list">
          ${topRepos
            .map(
              (repo, index) => `
            <a href="${
              repo.html_url
            }" target="_blank" class="repo-item" style="--i: ${index + 1}">
              <div class="repo-info">
                <span class="repo-name">${repo.name}</span>
                ${
                  repo.description
                    ? `<span class="repo-description">${repo.description}</span>`
                    : ""
                }
              </div>
              <div class="repo-stats">
                ${
                  repo.language
                    ? `<span class="repo-language">${repo.language}</span>`
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
    `
        : ""
    }
    
    <div class="user-footer">
      <span>Joined ${joinDate}</span>
    </div>
  `;

  userCard.innerHTML = cardHTML;
}

// Funções auxiliares
function showLoading() {
  loadingIcon.style.opacity = "1";
  magnifierIcon.style.opacity = "0";
}

function hideLoading() {
  loadingIcon.style.opacity = "0";
  magnifierIcon.style.opacity = "1";
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.add("active");
  userCard.innerHTML = "";
}

function hideError() {
  errorMessage.textContent = "";
  errorMessage.classList.remove("active");
}

function showResult() {
  mainContainer.classList.add("has-results");
  userResultContainer.classList.add("active");
}

function hideResult() {
  mainContainer.classList.remove("has-results");
  userResultContainer.classList.remove("active");
  userCard.innerHTML = "";
  hideError();
}
