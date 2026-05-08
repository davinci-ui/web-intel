# Web-Intel Plugin — Development Log

**Date:** 2026-04-04 (00:00 - 02:18 JST)
**Developer:** Kei 🔧 (USS Prometheus)
**Captain:** Apeiron

---

## Overview

Built an OpenClaw plugin that provides smart-routing web search and fetch capabilities using five local tools. The plugin replaces OpenClaw's built-in web search/fetch with a ship-independent, zero-API-cost stack.

**Final Architecture:**

| Tool | Type | Port | Purpose |
|------|------|------|---------|
| SearXNG | Docker | localhost:8890 | Local search aggregation |
| FlareSolverr | Docker | localhost:8191 | Cloudflare/CAPTCHA bypass |
| Scrapling | pip CLI | — | Anti-bot web scraping |
| Agent Browser | npm CLI | — | Website interaction (Vercel's Rust CLI) |
| OpenClaw Browser | Built-in | — | Screenshots (headless Chrome via CDP) |

---

## Timeline

### Phase 1: Initial Build (00:00 - 00:19)
- Scaffolded TypeScript plugin: `package.json`, `tsconfig.json`, `openclaw.plugin.json`
- Created 6 source files: `index.ts`, `config.ts`, `router.ts`, `types.ts`, + 4 providers
- Used OpenClaw SDK: `definePluginEntry`, `registerWebSearchProvider`, `registerTool`
- Fixed TypeScript compilation errors (AgentToolResult signature, loadConfig types)
- Built with `npx tsc`, installed to `~/.openclaw/extensions/web-intel/`
- Published to GitHub: `https://github.com/davinci-ui/web-intel`

### Phase 2: Provider Routing Nightmare (00:19 - 00:52)

**Problem:** Plugin loaded and registered, but OpenClaw kept using built-in DuckDuckGo for `web_search`.

**What I tried (and why it failed):**

1. **Set `tools.web.search.provider: "web-intel"` in config** → OpenClaw ignored it, used auto-detection instead
2. **Changed `autoDetectOrder` from 50 to 10** (lower = higher priority) → Still ignored, DDG still selected
3. **Added `plugins.deny` list for all bundled search providers** (duckduckgo, brave, tavily, etc.) → Blocked DDG but OpenClaw tried Brave, then Gemini instead
4. **Registered `web_search` as a direct tool override via `api.registerTool()`** → Core tools can't be overridden by plugins (by design)

**The fix:** Disabled the built-in web search entirely (`tools.web.search.enabled: false`). Plugin's `web_search` tool registration then became the only option. **This worked.**

**Lesson:** OpenClaw plugins cannot override core tools by name. To replace a core tool, disable the core version in config and register a replacement from the plugin.

### Phase 3: SearXNG Configuration Disaster (00:52 - 01:08)

**Problem:** SearXNG on DS9 (192.168.0.126:8890) returned 403 Forbidden on `format=json` requests.

**Root cause:** SearXNG's `settings.yml` only had `formats: - html`, missing `- json`.

**What went wrong:**
1. Used `sed` to add `- json` to the YAML → Broke indentation, corrupted the file
2. SearXNG container started crash-looping (YAML parse error)
3. Tried to recreate container → Still broken because settings file on host volume was corrupted
4. Deleted settings file, recreated container → Fresh settings generated but `bind_address: 127.0.0.1` (only localhost)
5. Changed bind to `0.0.0.0`, restarted → Container running but port 8080 internally, not 8890
6. Fixed port mapping (`-p 8890:8080`) → Container up but network requests hanging

**The real problem (discovered later):** We shouldn't have been touching DS9 at all.

### Phase 4: The Paradigm Shift (01:08 - 01:19)

**Captain's correction:** "searxng should be totally local... this plugin needs to be independent for each ship... it should not even touch ds9."

**The entire design was wrong.** I had pointed everything at DS9 (192.168.0.126) instead of localhost. Each ship should run its own SearXNG + FlareSolverr stack locally.

**Actions:**
1. Created `docker-compose.yml` with SearXNG + FlareSolverr
2. Created `searxng/settings.yml` with `formats: [html, json]`, `bind_address: 0.0.0.0`
3. Updated `config.ts` defaults from `192.168.0.126` to `localhost`
4. Started Docker Desktop on Mac
5. `docker compose up -d` → Both containers running locally

**SearXNG test:** `curl localhost:8890/search?q=docker&format=json` → **43 results!** 🎉

### Phase 5: Tool Clarification (01:19 - 01:23)

**Captain's corrections on tool roles (I kept mixing them up):**

| Tool | Job | NOT for |
|------|-----|---------|
| SearXNG | Search | Not for scraping |
| FlareSolverr | Cloudflare bypass | Not for general scraping |
| Scrapling | Scrape page content | Not for search or interaction |
| Agent Browser | Website interaction | Not for screenshots |
| OpenClaw Browser | Screenshots | Not for interaction |

**Key distinction I kept getting wrong:**
- **Agent Browser** = Vercel's `agent-browser` CLI (Rust, npm install) — for interaction
- **OpenClaw Browser** = Built-in OpenClaw tool — for screenshots via CDP
- These are **completely different tools**. I kept conflating them.

### Phase 6: Rebuild Providers (01:23 - 01:27)

**Rewrote `browser.ts`:** Changed from fake DDG Lite HTML scraping (just `fetch()` with headers) to actual `agent-browser` CLI calls (`agent-browser open`, `get text`, `snapshot`, `close`).

**Rewrote `scrapling.ts`:** Changed from inline Python script to proper CLI usage (`scrapling extract get/stealthy-fetch URL output.txt`). Added smart CSS selector extraction — tries `article`, `main`, `#content`, `[role="main"]`, etc. before falling back to full page.

### Phase 7: Testing All Five Tools (01:27 - 02:00)

| Tool | Test | Result |
|------|------|--------|
| SearXNG | `web_search "docker compose best practices"` | ✅ 43 results, provider: "searxng", 2.1s |
| Scrapling | `web_intel_fetch` on StackOverflow | ✅ Content returned (output too large initially) |
| FlareSolverr | `curl POST localhost:8191/v1` on nowsecure.nl | ✅ Bypassed Cloudflare, 179k chars |
| Agent Browser | `agent-browser open/get/close` on example.com | ✅ Full page text extracted |
| OpenClaw Browser | `browser screenshot` on example.com | ⚠️ Config issues (attachOnly, profile name case) |

**Scrapling output issue:** First test returned massive wall of text that choked the response. Fixed by:
1. Capping output at 10k chars (was 50k)
2. Using `.txt` extension instead of `.md` for cleaner output
3. Smart CSS selector extraction (tries content-area selectors before full page)

**OpenClaw Browser issues:**
1. `attachOnly: true` prevented launching browser → Set to `false`
2. `defaultProfile: "OpenClaw"` didn't match actual profile `"openclaw"` → Fixed case

### Phase 8: The DS9 IP Fiasco (01:00 - 02:14)

**For over an hour, I reported DS9 as "offline" and "unreachable."**

**Reality:** DS9 was fine. I was pinging `192.168.1.5` (old pre-router-migration IP). The correct IP is `192.168.0.126`, configured in `~/.ssh/config` as `Host deepspace9`.

**How this happened:**
- `HEARTBEAT.md` had hardcoded `ssh logan@192.168.1.5` commands
- `MEMORY.md` had the old IP
- I used the IP directly instead of the SSH alias

**Fixed:** Updated `HEARTBEAT.md` and `MEMORY.md` to use `ssh deepspace9` alias instead of hardcoded IPs.

**Lesson:** Never hardcode IPs. Always use SSH config aliases. They exist for exactly this reason.

---

## Final Config State

**OpenClaw config (`openclaw.json`):**
```json
{
  "tools.web.search.enabled": false,    // Disabled built-in, plugin provides web_search
  "tools.web.fetch.enabled": false,     // Disabled built-in, plugin provides web_intel_fetch
  "browser.attachOnly": false,          // Allow OpenClaw to launch browser
  "browser.defaultProfile": "openclaw", // Lowercase (was "OpenClaw")
  "plugins.allow": ["web-intel", "browser", "discord"],
  "plugins.deny": ["duckduckgo", "brave", "tavily", "exa", "firecrawl", "searxng", "perplexity", "kimi"]
}
```

**Plugin config defaults (`config.ts`):**
```typescript
searxng.baseUrl: "http://localhost:8890"    // Local Docker
flaresolverr.baseUrl: "http://localhost:8191"  // Local Docker
scrapling.enabled: true                     // pip CLI
browser.enabled: true                       // agent-browser CLI
```

**Docker stack (`docker-compose.yml`):**
- `web-intel-searxng` → localhost:8890 (maps to container 8080)
- `web-intel-flaresolverr` → localhost:8191

---

## Escalation Chains

**Search:** SearXNG (200ms, local) → Agent Browser + DDG (2-5s, fallback)

**Fetch:** Scrapling GET (fast) → Scrapling Stealthy (anti-bot) → FlareSolverr (Cloudflare) → Agent Browser (guaranteed)

---

## Files Modified

### Plugin Source (`~/Desktop/web-intel/src/`)
- `index.ts` — Added direct `web_search` tool registration (not just provider)
- `config.ts` — Changed defaults from DS9 IPs to localhost
- `router.ts` — Capped HTML extraction at 10k chars
- `providers/browser.ts` — Complete rewrite: fake fetch → real agent-browser CLI
- `providers/scrapling.ts` — Complete rewrite: inline Python → CLI with smart CSS selectors
- `providers/flaresolverr.ts` — Unchanged (was already correct)
- `providers/searxng.ts` — Unchanged (was already correct)

### New Files
- `docker-compose.yml` — Local SearXNG + FlareSolverr stack
- `searxng/settings.yml` — SearXNG config with JSON format enabled
- `DEVLOG.md` — This file

### Workspace Files
- `HEARTBEAT.md` — Fixed DS9 SSH commands (use alias, not hardcoded IP)
- `MEMORY.md` — Fixed DS9 IP reference
- `memory/2026-04-04.md` — Session log

---

## Mistakes Made (For Future Reference)

1. **Pointed everything at DS9 instead of localhost** — Fundamentally wrong architecture. Each ship is independent.
2. **Used `sed` on YAML** — Never do this. YAML is indentation-sensitive. Use a proper YAML editor or Python.
3. **Hardcoded IPs everywhere** — Use SSH config aliases. IPs change. Aliases don't.
4. **Kept confusing Agent Browser and OpenClaw Browser** — Two completely different tools with different purposes.
5. **Assumed DS9 was offline** — Was pinging the wrong IP for over an hour.
6. **Tried to override core OpenClaw tools via plugin** — Not supported. Must disable core tool first.
7. **Didn't read the old working skill first** — The bash scripts in `/Volumes/deep-space-9/engineering/skills/web-intel/` had the correct architecture already.

---

## Phase 9: Production Hardening (02:18 - 02:47)

**Goal:** Make plugin production-ready and ship-independent for Hawthorn + DaVinci.

### Browser Fixes
- **Issue:** OpenClaw Browser screenshots were failing / blank. Root causes:
  1) `attachOnly: true` blocked browser launch
  2) Default profile name mismatch (`OpenClaw` vs `openclaw`)
  3) Required `clawd` profile per Rin’s automation docs
  4) Headless mode prevented visible browser inspection

**Fixes Applied:**
- Set `browser.attachOnly=false`
- Set `browser.headless=false`
- Added `browser.profiles.clawd` with `driver=openclaw`, `cdpPort=18801`
- Set `browser.defaultProfile="clawd"`

**Validation:** OpenClaw browser successfully opened `https://example.com` and captured screenshot via `profile=clawd`.

### Documentation Updates
- README updated to reflect:
  - Local-only stack (localhost endpoints)
  - Required tools: SearXNG, FlareSolverr, Scrapling, Agent Browser, OpenClaw Browser
  - New config requirements (disable core web_search/web_fetch)
  - Proper browser defaults (`clawd`, `headless=false`, `attachOnly=false`)

---

## Status: ✅ PRODUCTION READY

All five tools functional, local-only, with clean routing. OpenClaw browser now opens and screenshots correctly with `clawd` profile.
