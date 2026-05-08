# Web-Intel v1.1 — Handoff Guide

## Quick Install

```bash
git clone https://github.com/ApeironOne/web-intel
cd web-intel
npm install
npm run build
# Install path varies by OpenClaw version:
openclaw plugins install ./
```

## Prerequisites (must be running before plugin is useful)

| Service | How | Port |
|---------|-----|------|
| SearXNG | `docker compose up -d` (from repo root) | 8890 |
| FlareSolverr | `docker compose up -d` (from repo root) | 8191 |
| Scrapling | `pip3 install scrapling` | — |
| agent-browser | `brew install agent-browser` (macOS) or install from Rust | — |

### One-command stack

```bash
docker compose up -d
```

This starts SearXNG (with JSON format support, bound to 0.0.0.0) and FlareSolverr.

## OpenClaw Config

In your OpenClaw config, add:

```json
{
  "plugins": {
    "entries": {
      "web-intel": {
        "config": {
          "searxng": { "baseUrl": "http://localhost:8890" },
          "flaresolverr": { "baseUrl": "http://localhost:8191" },
          "scrapling": { "enabled": true, "pythonPath": "python3" },
          "browser": { "enabled": true }
        }
      }
    }
  },
  "tools": {
    "web": {
      "search": { "enabled": false },
      "fetch": { "enabled": false }
    }
  }
}
```

### ⚠️ plugins.allow warning

If your OpenClaw config has `plugins.allow` set, it's an **exclusive allowlist**. You MUST include `web-intel` AND all your other plugins:

```json
"plugins": {
  "allow": ["web-intel", "discord", "browser"]
}
```

Omitting a plugin from this list will block it. This is the most common installation mistake.

## Tools Provided

| Tool | Replaces | Description |
|------|----------|-------------|
| `web_search` | built-in web_search | Smart routing: SearXNG → browser fallback |
| `web_intel_fetch` | built-in web_fetch | Page fetch: Scrapling → stealth → FlareSolverr → browser |
| `web_intel_screenshot` | — NEW — | Takes a PNG screenshot via OpenClaw's browser |
| `registerWebSearchProvider` | — | Also registered as native web search provider |

## Verify

```
# Test search
web_search("latest TypeScript release")

# Test fetch
web_intel_fetch("https://example.com")

# Test screenshot
web_intel_screenshot("https://example.com")
```

## Escalation Chains

**Search:** SearXNG (local, ~200ms) → Agent Browser (real browser DDG search)
**Fetch:** Scrapling GET (fast, ~500ms) → Scrapling stealthy (anti-bot) → FlareSolverr (Cloudflare, ~5-15s) → Agent Browser

## Repo

https://github.com/ApeironOne/web-intel/

Tag for v1.1: `git checkout v1.1`

## License

MIT
