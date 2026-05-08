# Web Intelligence — OpenClaw Plugin

Smart-routing web search, fetch, and screenshots for OpenClaw. Zero API cost, self-hosted.

## What It Does

Provides plugin-owned replacements for built-in web search/fetch, plus a browser screenshot tool.

### Search Chain
```
web_search("query")
    ↓
SearXNG (local, ~200ms) → Agent Browser fallback (real browser search)
```

### Fetch Chain
```
web_intel_fetch("https://example.com")
    ↓
Scrapling (fast) → Scrapling (stealthy) → FlareSolverr (Cloudflare) → Agent Browser
```

## Prerequisites

- **SearXNG** instance (self-hosted, local)
- **FlareSolverr** instance (local, for Cloudflare bypass)
- **Python 3** with `scrapling` installed (for anti-bot page reading)
- **agent-browser** CLI (for website interaction fallback)
- **OpenClaw Browser** (built-in, for screenshots)

## Install

Start the local dependency stack first:

```bash
docker compose up -d
python3 -m pip install scrapling
npm i -g agent-browser
```

```bash
openclaw plugins install @ApeironOne/openclaw-web-intel
```

Or from source:
```bash
git clone https://github.com/ApeironOne/web-intel
cd web-intel
npm install && npm run build
openclaw plugins install ./
```

If the npm package is not published yet, use the source install path.

## Configuration

In your OpenClaw config:

```json5
{
  plugins: {
    // plugins.allow is exclusive. Include every plugin this OpenClaw needs.
    allow: ["web-intel", "browser"],
    entries: {
      "web-intel": {
        config: {
          searxng: { baseUrl: "http://localhost:8890" },
          flaresolverr: { baseUrl: "http://localhost:8191" },
          scrapling: { enabled: true, pythonPath: "python3" },
          browser: { enabled: true }
        }
      }
    }
  },
  tools: {
    web: {
      search: { enabled: false }, // plugin provides web_search
      fetch: { enabled: false }   // plugin provides web_intel_fetch
    }
  },
  browser: {
    defaultProfile: "clawd",
    attachOnly: false,
    headless: false
  }
}
```

Environment variables (optional):
```bash
export SEARXNG_BASE_URL="http://localhost:8890"
export FLARESOLVERR_URL="http://localhost:8191"
```

## Tools Provided

### `web_search` (provider replacement)
Plugin-owned replacement for built-in `web_search`. Disable core web search first.

Parameters:
- `query` (string, required) — Search query
- `count` (number, 1-10) — Number of results
- `categories` (string) — general, news, it, science, files, images
- `language` (string) — Language code (en, ja, de, etc.)

### `web_intel_fetch` (new tool)
Fetches and reads web pages with automatic escalation through anti-bot measures.

Parameters:
- `url` (string, required) — URL to fetch

### `web_intel_screenshot` (new tool)
Captures a page screenshot with OpenClaw's browser.

Parameters:
- `url` (string, required) — URL to capture
- `width` (number, optional) — screenshot width, default 1280
- `height` (number, optional) — screenshot height, default 720

## How It Works

### Search Routing
1. **SearXNG** (local, ~200ms) — great for tech, code, docs, Reddit, GitHub
2. **Agent Browser** (fallback) — real browser search for general queries

### Fetch Routing
1. **Scrapling GET** (~500ms) — works for 80% of sites
2. **Scrapling Stealthy** (~2s) — anti-bot fingerprint evasion
3. **FlareSolverr** (~5-15s) — solves Cloudflare challenges with real Chrome
4. **Agent Browser** — real browser interaction & extraction

Each step only runs if the previous one fails. The response includes which provider succeeded and the full escalation chain.

## Ship Deployment

This plugin runs **locally on each ship** — no shared dependency on DS9.
Each ship runs its own SearXNG + FlareSolverr via Docker Compose.

- **USS Prometheus** (Mac) → localhost SearXNG + FlareSolverr
- **USS Hathaway** (DS9) → localhost SearXNG + FlareSolverr
- **USS DaVinci** (work) → localhost SearXNG + FlareSolverr

### Local Stack (recommended)
```bash
docker compose up -d
```

Verify the local stack:

```bash
curl -s "http://localhost:8890/search?q=openclaw&format=json" | jq '.results[:3][] | {title, url}'
curl -s -X POST "http://localhost:8191/v1" \
  -H "Content-Type: application/json" \
  -d '{"cmd":"request.get","url":"https://example.com","maxTimeout":60000}' | jq '.status'
```

## License

MIT
