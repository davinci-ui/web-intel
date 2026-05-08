import type { ProviderResult } from "../types.js";
import { callGatewayTool } from "openclaw/plugin-sdk/browser-support";
import { readFile } from "node:fs/promises";

export interface BrowserRuntimeContext {
  sandboxBridgeUrl?: string;
  allowHostControl?: boolean;
  sessionKey?: string;
}

/**
 * OpenClaw Browser Screenshot Provider (SDK runtime)
 * Uses gateway method browser.request (owner scope) to avoid HTTP /tools/invoke auth.
 */

function normalizeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function browserFailureHint(message: string, profile: string): string {
  const lower = message.toLowerCase();
  const checks = [
    `Direct check: npm exec -- openclaw gateway call browser.request --json --timeout 30000 --params '{"method":"POST","path":"/tabs/open","query":{"profile":"openclaw"},"body":{"url":"https://example.com"}}'`,
    "Bootstrap: npm run browser:bootstrap",
    "Smoke test: npm run smoke",
  ];

  if (lower.includes("profile") && lower.includes("not found")) {
    return `OpenClaw browser profile "${profile}" was not found. Set browser.defaultProfile to "openclaw" or set plugins.entries.web-intel.config.browser.profile to an existing profile. ${checks.join(" | ")}`;
  }

  if (
    lower.includes("no supported browser") ||
    lower.includes("executable") ||
    lower.includes("chromium") ||
    lower.includes("chrome")
  ) {
    return `OpenClaw browser executable is not configured or cannot start. Run npm run browser:bootstrap on this host, then restart the OpenClaw gateway. ${checks.join(" | ")}`;
  }

  if (lower.includes("operator.write") || lower.includes("scope")) {
    return `OpenClaw browser.request rejected the tool scope. web_intel_screenshot requires operator.write through the plugin SDK browser bridge. Reinstall the plugin from this repo and restart the gateway. ${checks.join(" | ")}`;
  }

  if (lower.includes("unauthorized") || lower.includes("forbidden") || lower.includes("token")) {
    return `OpenClaw gateway/browser control auth failed. Restart the gateway and verify the plugin is installed from the VPS repo. ${checks.join(" | ")}`;
  }

  if (lower.includes("econnrefused") || lower.includes("gateway") || lower.includes("connect")) {
    return `OpenClaw gateway/browser control is not reachable from the plugin runtime. Verify npm exec -- openclaw gateway health and restart the gateway if needed. ${checks.join(" | ")}`;
  }

  return `OpenClaw Browser screenshot failed after browser.request. ${checks.join(" | ")}`;
}

async function readScreenshotFile(path: string, profile: string): Promise<ProviderResult<Buffer>> {
  try {
    return { ok: true, data: await readFile(path) };
  } catch (err) {
    const msg = normalizeError(err);
    return {
      ok: false,
      error: `Screenshot image was written to ${path}, but Web-Intel could not read it: ${msg}. ${browserFailureHint(msg, profile)}`,
    };
  }
}

export async function takeScreenshot(
  _ctx: BrowserRuntimeContext,
  url: string,
  width: number = 1280,
  height: number = 720,
  profile: string = "openclaw"
): Promise<ProviderResult<Buffer>> {
  try {
    const opened = await callGatewayTool(
      "browser.request",
      { timeoutMs: 20000 },
      {
        method: "POST",
        path: "/tabs/open",
        body: { url },
        query: { profile },
      },
      { scopes: ["operator.write"] }
    );

    const targetId = (opened as any)?.targetId;
    if (!targetId) {
      return {
        ok: false,
        error: `Browser tab opened without a targetId. Response: ${JSON.stringify(opened)}. ${browserFailureHint("missing targetId", profile)}`,
      };
    }

    await callGatewayTool(
      "browser.request",
      { timeoutMs: 20000 },
      {
        method: "POST",
        path: "/navigate",
        body: { url, targetId },
        query: { profile },
      },
      { scopes: ["operator.write"] }
    );

    const shot = await callGatewayTool(
      "browser.request",
      { timeoutMs: 20000 },
      {
        method: "POST",
        path: "/screenshot",
        body: { targetId, type: "png", width, height },
        query: { profile },
      },
      { scopes: ["operator.write"] }
    );

    const imagePath = (shot as any)?.path;
    const imageBase64 = (shot as any)?.base64;
    if (imageBase64) {
      return { ok: true, data: Buffer.from(imageBase64, "base64") };
    }
    if (!imagePath) {
      return {
        ok: false,
        error: `Screenshot action returned no image data. Response: ${JSON.stringify(shot)}. ${browserFailureHint("no image data", profile)}`,
      };
    }

    return await readScreenshotFile(imagePath, profile);
  } catch (err) {
    const msg = normalizeError(err);
    return { ok: false, error: `Screenshot provider error: ${msg}. ${browserFailureHint(msg, profile)}` };
  }
}
