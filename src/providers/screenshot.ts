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

export async function takeScreenshot(
  _ctx: BrowserRuntimeContext,
  url: string,
  width: number = 1280,
  height: number = 720,
  profile: string = "openclaw"
): Promise<ProviderResult<Buffer>> {
  try {
    // 1) open tab
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

    // 2) optional navigate (ensures load)
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

    // 3) screenshot
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
      return { ok: false, error: "Screenshot action returned no image data." };
    }

    const imageBuffer = await readFile(imagePath);
    return { ok: true, data: imageBuffer };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Screenshot provider error: ${msg}` };
  }
}
