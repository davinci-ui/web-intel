#!/usr/bin/env node
import { access, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const noRestart = args.has("--no-restart");

const linux = platform() === "linux";

async function existsExecutable(path) {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function commandPath(binary) {
  try {
    const { stdout } = await execFileAsync("sh", ["-lc", `command -v ${binary}`], {
      timeout: 5000,
    });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function playwrightChromes() {
  const root = join(homedir(), ".cache", "ms-playwright");
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const candidates = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium-"))
      .map((entry) => join(root, entry.name, "chrome-linux64", "chrome"));
    candidates.sort().reverse();
    return candidates;
  } catch {
    return [];
  }
}

async function validateBrowser(path) {
  try {
    const { stdout, stderr } = await execFileAsync(path, ["--version"], {
      timeout: 10000,
    });
    const version = `${stdout}${stderr}`.trim();
    return version || "version command succeeded";
  } catch (err) {
    return undefined;
  }
}

async function detectBrowser() {
  const envCandidates = [
    process.env.OPENCLAW_BROWSER_EXECUTABLE_PATH,
    process.env.BROWSER_EXECUTABLE_PATH,
  ].filter(Boolean);
  const fixedCandidates = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/snap/bin/chromium",
  ];
  const commandCandidates = [];
  for (const binary of ["google-chrome-stable", "google-chrome", "chromium-browser", "chromium"]) {
    const found = await commandPath(binary);
    if (found) commandCandidates.push(found);
  }

  const candidates = [
    ...envCandidates,
    ...fixedCandidates,
    ...commandCandidates,
    ...(await playwrightChromes()),
  ];

  for (const candidate of [...new Set(candidates)]) {
    if (!candidate || !(await existsExecutable(candidate))) continue;
    const version = await validateBrowser(candidate);
    if (version) return { path: candidate, version };
  }

  return undefined;
}

async function getConfigValue(key) {
  try {
    const { stdout } = await execFileAsync("npm", [
      "exec",
      "--",
      "openclaw",
      "config",
      "get",
      key,
      "--json",
    ], { timeout: 15000 });
    return JSON.parse(stdout);
  } catch {
    return undefined;
  }
}

async function runOpenClaw(args) {
  const printable = `npm exec -- openclaw ${args.join(" ")}`;
  if (dryRun) {
    console.log(`[dry-run] ${printable}`);
    return "";
  }
  const { stdout, stderr } = await execFileAsync("npm", ["exec", "--", "openclaw", ...args], {
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
  return stdout;
}

async function setConfig(key, value, strictJson = false) {
  const current = await getConfigValue(key);
  if (current === value) {
    console.log(`ok ${key} already ${JSON.stringify(value)}`);
    return false;
  }
  const cmd = ["config", "set", key, String(value)];
  if (strictJson) cmd.push("--strict-json");
  await runOpenClaw(cmd);
  console.log(`set ${key}=${JSON.stringify(value)}`);
  return true;
}

const browser = await detectBrowser();
if (!browser) {
  console.error(`No Chrome/Chromium executable was found.
Install one of:
  - sudo apt-get install chromium-browser chromium
  - npx playwright install --with-deps chromium
  - agent-browser install --with-deps
Then rerun npm run browser:bootstrap.`);
  process.exit(1);
}

console.log(`Using browser: ${browser.path}`);
console.log(`Detected: ${browser.version}`);

let changed = false;
changed = (await setConfig("browser.executablePath", browser.path)) || changed;
changed = (await setConfig("browser.defaultProfile", "openclaw")) || changed;
changed = (await setConfig("browser.headless", true, true)) || changed;
if (linux) {
  changed = (await setConfig("browser.noSandbox", true, true)) || changed;
}

await runOpenClaw(["config", "validate"]);

if (changed && !noRestart) {
  await runOpenClaw(["gateway", "restart"]);
} else if (changed) {
  console.log("Config changed; restart the gateway before screenshot testing.");
} else {
  console.log("OpenClaw browser config already matches the detected runtime.");
}
