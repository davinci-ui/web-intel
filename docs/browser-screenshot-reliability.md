# Browser Screenshot Reliability Runbook

Web-Intel screenshots use OpenClaw Browser through `browser.request`. Search and fetch can be healthy while screenshots fail if the OpenClaw browser runtime is not configured on that host.

## Golden Path

```bash
cd /home/davinci/davinci-ui/web-intel
npm install
npm run build
npm run browser:bootstrap
npm exec -- openclaw plugins install --link ./
npm exec -- openclaw gateway restart
npm run smoke
```

Expected smoke-test coverage:

- OpenClaw gateway health
- Web-Intel search route
- Web-Intel fetch route
- Direct `browser.request` tab open
- Direct `browser.request` screenshot endpoint
- `web_intel_screenshot` provider path

## Known Good DaVinci Baseline

```json
{
  "executablePath": "/home/davinci/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
  "headless": true,
  "noSandbox": true,
  "defaultProfile": "openclaw"
}
```

Services:

- Gateway health: `npm exec -- openclaw gateway health`
- SearXNG: `http://localhost:8890`
- FlareSolverr: `http://localhost:8191`
- Plugin source: `/home/davinci/davinci-ui/web-intel`

## Direct Browser Checks

Open a tab:

```bash
npm exec -- openclaw gateway call browser.request --json --timeout 30000 --params '{"method":"POST","path":"/tabs/open","query":{"profile":"openclaw"},"body":{"url":"https://example.com"}}'
```

Then screenshot using the returned `targetId`:

```bash
npm exec -- openclaw gateway call browser.request --json --timeout 30000 --params '{"method":"POST","path":"/screenshot","query":{"profile":"openclaw"},"body":{"targetId":"TARGET_ID","type":"png","width":800,"height":600}}'
```

A passing response includes either `path` or `base64`.

## Failure Matrix

| Symptom | Likely Cause | Fix |
|---|---|---|
| `Profile "openclaw" not found` | Browser profile mismatch | `openclaw config set browser.defaultProfile openclaw` or set `plugins.entries.web-intel.config.browser.profile` |
| `No supported browser found`, Chrome/Chromium executable errors | Browser not installed or not configured | `npm run browser:bootstrap`, then restart gateway |
| Scope or `operator.write` rejection | Plugin not running through SDK browser bridge or stale install | Rebuild, reinstall from this VPS repo, restart gateway |
| Gateway unauthorized/token/forbidden | Stale gateway auth/control state | Restart gateway, verify `openclaw gateway health`, reinstall plugin if needed |
| Search/fetch pass but screenshot fails | Browser layer only is broken | Run direct browser checks above and `npm run browser:bootstrap` |
| Screenshot response has no `path` or `base64` | Browser endpoint returned an incomplete response | Run `npm run smoke`, inspect gateway logs, confirm OpenClaw Browser plugin/config |

## Fallback Decision

Do not add a second screenshot stack until a host cannot run OpenClaw Browser after bootstrap. The supported path is the native OpenClaw Browser because it preserves one browser-control interface for the web agent.
