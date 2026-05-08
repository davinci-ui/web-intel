# Web-Intel v1.1 Handoff

This installs Web-Intel as a self-hosted OpenClaw web stack on another machine. Each OpenClaw instance runs its own local SearXNG, FlareSolverr, Scrapling, and Agent Browser dependencies.

## 1. Clone, Build, Install

```bash
git clone https://github.com/ApeironOne/web-intel
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

- SearXNG at `http://localhost:8890`
- FlareSolverr at `http://localhost:8191`

The bundled `searxng/settings.yml` enables JSON responses and binds to `0.0.0.0` inside Docker.

## 3. Install Local CLIs

```bash
python3 -m pip install scrapling
npm i -g agent-browser
agent-browser install
```

On Linux, use `agent-browser install --with-deps` if Chrome dependencies are missing.

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
          browser: { enabled: true }
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
    defaultProfile: "clawd",
    attachOnly: false,
    headless: false
  }
}
```

Restart the OpenClaw gateway after changing config.

## 5. Verify

Check the local services:

```bash
curl -s "http://localhost:8890/search?q=openclaw&format=json" | jq '.results[:3][] | {title, url}'
curl -s -X POST "http://localhost:8191/v1" \
  -H "Content-Type: application/json" \
  -d '{"cmd":"request.get","url":"https://example.com","maxTimeout":60000}' | jq '.status'
```

Then ask OpenClaw to run:

- `web_search` for a normal search query.
- `web_intel_fetch` against `https://example.com`.
- `web_intel_screenshot` against `https://example.com`.

Expected routing:

- Search: SearXNG, then Agent Browser fallback.
- Fetch: Scrapling GET, Scrapling stealthy fetch, FlareSolverr, then Agent Browser fallback.
