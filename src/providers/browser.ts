import type { WebIntelConfig, SearchResult, ProviderResult } from "../types.js";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Agent Browser (vercel-labs/agent-browser) — Rust CLI for real browser interaction.
 * Used for: website interaction, JS rendering, full page content extraction.
 * NOT for screenshots (that's OpenClaw browser).
 * NOT for scraping (that's Scrapling).
 */

async function runAgentBrowser(
  ...args: string[]
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync("agent-browser", args, {
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 5,
    });
  } catch (err: any) {
    if (err.stdout || err.stderr) {
      return { stdout: err.stdout || "", stderr: err.stderr || "" };
    }
    throw err;
  }
}

function agentBrowserOpenArgs(config: WebIntelConfig, url: string): string[] {
  const args = ["open", url];
  const extraArgs = config.browser?.args?.trim();

  if (extraArgs) {
    args.push("--args", extraArgs);
  } else if (process.platform === "linux") {
    args.push("--args", "--no-sandbox");
  }

  return args;
}

/**
 * Fetch a URL using agent-browser (real headless Chrome).
 * Opens the page, waits for load, extracts body text, closes.
 */
export async function fetchWithBrowser(
  config: WebIntelConfig,
  url: string
): Promise<ProviderResult<string>> {
  try {
    await runAgentBrowser(...agentBrowserOpenArgs(config, url));
    // Wait for page to settle
    try {
      await runAgentBrowser("wait", "--load", "networkidle");
    } catch {
      // networkidle may not be supported in all versions, continue anyway
    }

    const { stdout: content } = await runAgentBrowser("get", "text", "body");
    await runAgentBrowser("close").catch(() => {});

    if (!content || content.trim().length < 50) {
      return { ok: false, error: "Agent browser got insufficient content" };
    }

    return { ok: true, data: content.slice(0, 100000) };
  } catch (err) {
    // Try to close browser on error
    await runAgentBrowser("close").catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Agent browser error: ${msg}` };
  }
}

/**
 * Search using agent-browser (real browser).
 * Opens a search results page and extracts results from the accessibility tree.
 */
export async function searchWithBrowser(
  config: WebIntelConfig,
  query: string,
  count: number = 5
): Promise<ProviderResult<SearchResult[]>> {
  try {
    const ddgUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    await runAgentBrowser(...agentBrowserOpenArgs(config, ddgUrl));
    try {
      await runAgentBrowser("wait", "--load", "networkidle");
    } catch {
      // continue
    }

    // Get the page text and parse results
    const { stdout: snapshot } = await runAgentBrowser("snapshot");
    await runAgentBrowser("close").catch(() => {});

    // Parse the snapshot for search results
    const results = parseBrowserSearchResults(snapshot, count);
    if (results.length === 0) {
      return { ok: false, error: "No results parsed from browser search" };
    }

    return { ok: true, data: results };
  } catch (err) {
    await runAgentBrowser("close").catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Browser search error: ${msg}` };
  }
}

/**
 * Parse search results from agent-browser snapshot output.
 */
function parseBrowserSearchResults(
  snapshot: string,
  count: number
): SearchResult[] {
  const results: SearchResult[] = [];
  // Snapshot is accessibility tree text — parse links and descriptions
  const lines = snapshot.split("\n");

  let currentTitle = "";
  let currentUrl = "";

  for (const line of lines) {
    // Look for links that are search results
    const linkMatch = line.match(/link\s+"([^"]+)"\s+.*url:\s*(\S+)/i);
    if (linkMatch) {
      if (currentTitle && currentUrl) {
        results.push({
          title: currentTitle,
          url: currentUrl,
          snippet: "",
          source: "agent-browser",
        });
        if (results.length >= count) break;
      }
      currentTitle = linkMatch[1];
      currentUrl = linkMatch[2];
    }
  }

  // Push last result
  if (currentTitle && currentUrl && results.length < count) {
    results.push({
      title: currentTitle,
      url: currentUrl,
      snippet: "",
      source: "agent-browser",
    });
  }

  return results;
}
