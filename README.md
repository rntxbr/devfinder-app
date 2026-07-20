# DevFinder

A production-ready GitHub user search app that displays profile information, statistics, and popular repositories using the GitHub public API.

## Technologies

- HTML5 (semantic, accessible markup)
- CSS3 (custom animations, glassmorphism, responsive layout)
- Vanilla JavaScript (ES6+)
- GitHub REST API v3

## Features

- **Live search** with debounce (~450ms) and Enter-to-search
- **Profile card** — avatar, name, bio, company, location, website, Twitter
- **Stats dashboard** — repositories, total stars, followers, following (compact number format)
- **Top 3 popular repositories** sorted by star count
- **Local cache** (TTL 6h, max 30 profiles) with recent profiles ranking
- **Example username chips** for quick discovery
- **Accessible UI** — ARIA live regions, focus trap in modal, skip link, keyboard shortcuts
- **Error handling** — 404, rate limit (with reset time), network errors, retry button
- **Responsive** design for desktop, tablet, and mobile

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Enter` | Search immediately |
| `Escape` | Close modal, or close results / go home |
| `Tab` | Navigate (focus trapped inside About modal) |

## Usage

1. Clone the repository
2. Open `index.html` in a modern browser (or serve via any static server)
3. Type a GitHub username, or click an example chip
4. Browse the profile; press **Back** or `Escape` to return home

No build step or dependencies required.

### Optional local server

```bash
# Python
python -m http.server 8080

# Node
npx serve .
```

## Technical overview

### Architecture

Client-side only:

1. **API** — `GET /users/{username}` and `GET /users/{username}/repos`
2. **Processing** — total stars, top repos by stars, activity score
3. **Cache** — `localStorage` with TTL, search count, and size limit
4. **Rendering** — escaped HTML templates + progressive UI states

### Production hardening

- `AbortController` cancels in-flight requests (no race conditions)
- Request ID ignores stale responses
- Username validation before calling the API
- XSS-safe rendering (`escapeHtml` on all dynamic text)
- Safe external URLs (http/https only for blog links)
- Rate-limit headers parsed for friendlier messages
- `prefers-reduced-motion` respected

### Activity score

```
score = followers×5 + totalStars×10 + publicRepos×2
      + (bio ? 20 : 0) + (company ? 10 : 0)
      + (location ? 10 : 0) + (blog ? 10 : 0)
```

## API rate limits

Unauthenticated GitHub API: **60 requests/hour** per IP.  
The app shows when the limit is exceeded and the approximate reset time. Cached profiles do not consume extra requests until the TTL expires.

## Browser support

Modern browsers with ES6+ and `fetch` / `AbortController`:

- Chrome 66+
- Firefox 57+
- Safari 12.1+
- Edge 79+

## Author

Renato Khael — [LinkedIn](https://www.linkedin.com/in/rkhael/)
