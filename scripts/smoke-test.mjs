#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { routeSearch, routeFetch } from "../dist/router.js";
import { loadConfig } from "../dist/config.js";
import { takeScreenshot } from "../dist/providers/screenshot.js";

const execFileAsync = promisify(execFile);
const config = loadConfig();
const profile = config.browser?.profile || "openclaw";
const failures = [];

async function step(name, fn) {
  const started = Date.now();
  try {
    const details = await fn();
    const suffix = details ? ` ${details}` : "";
    console.log(`PASS ${name} (${Date.now() - started}ms)${suffix}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push({ name, message });
    console.log(`FAIL ${name}: ${message}`);
  }
}

async function openclawGateway(args, timeout = 30000) {
  const { stdout } = await execFileAsync("npm", ["exec", "--", "openclaw", ...args], {
    timeout,
    maxBuffer: 5 * 1024 * 1024,
  });
  return stdout;
}

async function browserRequest(payload) {
  const stdout = await openclawGateway([
    "gateway",
    "call",
    "browser.request",
    "--json",
    "--timeout",
    "30000",
    "--params",
    JSON.stringify(payload),
  ], 45000);
  return JSON.parse(stdout);
}

await step("build artifacts loaded", async () => "dist imports ok");

await step("openclaw gateway health", async () => {
  const stdout = await openclawGateway(["gateway", "health"], 15000);
  if (!stdout.includes("OK")) throw new Error(stdout.trim());
  return stdout.trim().split("\n")[0];
});

await step("web search route", async () => {
  const result = await routeSearch(config, { query: "OpenClaw web intel", count: 3 });
  if (!result.results?.length) throw new Error(`no search results; provider=${result.provider}`);
  return `provider=${result.provider} results=${result.results.length}`;
});

await step("web fetch route", async () => {
  const result = await routeFetch(config, "https://example.com");
  if (!result.content?.toLowerCase().includes("example domain")) {
    throw new Error(`unexpected fetch content from provider=${result.provider}`);
  }
  return `provider=${result.provider} chars=${result.content.length}`;
});

let targetId;
await step("openclaw browser tab", async () => {
  const opened = await browserRequest({
    method: "POST",
    path: "/tabs/open",
    query: { profile },
    body: { url: "https://example.com" },
  });
  targetId = opened.targetId;
  if (!targetId) throw new Error(JSON.stringify(opened));
  return `target=${targetId.slice(0, 8)}`;
});

await step("openclaw browser screenshot endpoint", async () => {
  const shot = await browserRequest({
    method: "POST",
    path: "/screenshot",
    query: { profile },
    body: { targetId, type: "png", width: 800, height: 600 },
  });
  if (!shot.path && !shot.base64) throw new Error(JSON.stringify(shot));
  return shot.path ? `path=${shot.path}` : "base64=true";
});

await step("web_intel_screenshot provider", async () => {
  const result = await takeScreenshot({}, "https://example.com", 800, 600, profile);
  if (!result.ok) throw new Error(result.error || "provider returned failure");
  if (!result.data || result.data.length < 1000) throw new Error("screenshot buffer too small");
  return `bytes=${result.data.length}`;
});

if (failures.length) {
  console.error("\nSmoke test failed:");
  for (const failure of failures) console.error(`- ${failure.name}: ${failure.message}`);
  process.exit(1);
}

console.log("\nAll Web-Intel smoke tests passed.");
