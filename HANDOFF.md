# Web-Intel v1.1 Handoff

This installs Web-Intel as a self-hosted OpenClaw web stack on another machine. Each OpenClaw instance runs its own local SearXNG, FlareSolverr, Scrapling, and Agent Browser dependencies.

## 1. Clone, Build, Install

```bash
git clone https://github.com/davinci-ui/web-intel
cd web-intel
npm install
npm run build
openclaw plugins install ./
```

## 2. Start Local Services

```bash
docker compose up -d
```

This starts:

| Service | URL | Purpose |
|---|---|---|
| SearXNG | `http://localhost:8890` | Local search API with JSON enabled |
| FlareSolverr | `http://localhost:8191` | Cloudflare challenge fetch fallback |

The bundled `searxng/settings.yml` enables JSON responses and binds to `0.0.0.0` inside Docker.

## 3. Install Local CLIs

```bash
python3 -m pip install "scrapling[all]"
npm i -g agent-browser
agent-browser install
```

On Linux, use `agent-browser install --with-deps` if Chrome dependencies are missing. On the VPS, Chrome may need the sandbox disabled:

```bash
export AGENT_BROWSER_ARGS="--no-sandbox"
```

OpenClaw screenshots also need Chrome/Chromium. If OpenClaw cannot find a browser, either install system Chromium/Chrome or point OpenClaw at the Playwright browser installed by Agent Browser:

```bash
openclaw config set browser.executablePath /home/davinci/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome
openclaw config set browser.noSandbox true --strict-json
openclaw config set browser.headless true --strict-json
openclaw config set browser.defaultProfile openclaw
```

## 4. Patch OpenClaw Config

```json5
{
  plugins: {
    // This allowlist is exclusive. Include every plugin this OpenClaw needs.
    allow: ["web-intel", "browser", "discord"],
    entries: {
      "web-intel": {
        config: {
          searxng: { baseUrl: "http://localhost:8890" },
          flaresolverr: { baseUrl: "http://localhost:8191" },
          scrapling: { enabled: true, pythonPath: "python3" },
          browser: { enabled: true, args: "--no-sandbox", profile: "openclaw" }
        }
      }
    }
  },
  tools: {
    web: {
      search: { enabled: false },
      fetch: { enabled: false }
    }
  },
  browser: {
    defaultProfile: "openclaw",
    attachOnly: false,
    headless: false
  }
}
```

Restart the OpenClaw gateway after changing config.

## 5. Tools Provided

| Tool | Replaces | Description |
|---|---|---|
| `web_search` | built-in web_search | Smart routing: SearXNG -> Agent Browser fallback |
| `web_intel_fetch` | built-in web_fetch | Page fetch: Scrapling -> stealth -> FlareSolverr -> Agent Browser |
| `web_intel_screenshot` | none | Takes a PNG screenshot via OpenClaw Browser |
| `registerWebSearchProvider` | provider path | Also registered as native web search provider where supported |

## 6. Verify

Check the local services:

```bash
curl -s "http://localhost:8890/search?q=openclaw&format=json" | jq ".results[:3][] | {title, url}"
curl -s -X POST "http://localhost:8191/v1" \
  -H "Content-Type: application/json" \
  -d "{\"cmd\":\"request.get\",\"url\":\"https://example.com\",\"maxTimeout\":60000}" | jq ".status"
```

Then ask OpenClaw to run:

- `web_search` for a normal search query.
- `web_intel_fetch` against `https://example.com`.
- `web_intel_screenshot` against `https://example.com`.

Expected routing:

- Search: SearXNG, then Agent Browser fallback.
- Fetch: Scrapling GET, Scrapling stealthy fetch, FlareSolverr, then Agent Browser fallback.

## Repo

https://github.com/davinci-ui/web-intel

Tag for v1.1: `git checkout v1.1`
