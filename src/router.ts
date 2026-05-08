import type {
  WebIntelConfig,
  SearchResult,
  SearchResponse,
  FetchResponse,
} from "./types.js";
import { searchSearxng } from "./providers/searxng.js";
import { fetchWithFlaresolverr } from "./providers/flaresolverr.js";
import {
  fetchWithScraplingEscalation,
} from "./providers/scrapling.js";
import {
  fetchWithBrowser,
  searchWithBrowser,
} from "./providers/browser.js";

/**
 * Smart search router.
 * Escalation: SearXNG → Agent Browser
 *
 * SearXNG is fast and free for tech/code queries.
 * Browser fallback handles news, general, and when SearXNG has no results.
 */
export async function routeSearch(
  config: WebIntelConfig,
  params: {
    query: string;
    count?: number;
    categories?: string;
    language?: string;
  }
): Promise<SearchResponse> {
  const startedAt = Date.now();
  const chain: string[] = [];
  const count = params.count || 5;

  // Step 1: SearXNG (fast, local)
  chain.push("searxng");
  const searxng = await searchSearxng(config, {
    query: params.query,
    count,
    categories: params.categories,
    language: params.language,
  });

  if (searxng.ok && searxng.data.length > 0) {
    return {
      query: params.query,
      provider: "searxng",
      count: searxng.data.length,
      tookMs: Date.now() - startedAt,
      results: searxng.data,
      escalated: false,
      escalationChain: chain,
    };
  }

  // Step 2: Agent Browser fallback
  if (config.browser?.enabled !== false) {
    chain.push("agent-browser");
    const browser = await searchWithBrowser(config, params.query, count);

    if (browser.ok && browser.data.length > 0) {
      return {
        query: params.query,
        provider: "agent-browser",
        count: browser.data.length,
        tookMs: Date.now() - startedAt,
        results: browser.data,
        escalated: true,
        escalationChain: chain,
      };
    }
  }

  // Nothing worked — return empty with chain info
  return {
    query: params.query,
    provider: "none",
    count: 0,
    tookMs: Date.now() - startedAt,
    results: [],
    escalated: true,
    escalationChain: chain,
  };
}

/**
 * Smart fetch router.
 * Escalation: Scrapling (get) → Scrapling (stealthy) → FlareSolverr → Browser
 *
 * Each step is tried only if the previous one fails.
 * FlareSolverr is specifically for Cloudflare-protected sites.
 */
export async function routeFetch(
  config: WebIntelConfig,
  url: string
): Promise<FetchResponse> {
  const startedAt = Date.now();
  const chain: string[] = [];

  // Step 1: Scrapling escalation (get → stealthy-fetch)
  if (config.scrapling?.enabled !== false) {
    chain.push("scrapling");
    const scrapling = await fetchWithScraplingEscalation(config, url);

    if (scrapling.ok) {
      return {
        url,
        provider: `scrapling-${scrapling.mode || "get"}`,
        content: scrapling.data,
        tookMs: Date.now() - startedAt,
        escalated: chain.length > 1,
        escalationChain: chain,
      };
    }
  }

  // Step 2: FlareSolverr (Cloudflare bypass)
  if (config.flaresolverr?.baseUrl) {
    chain.push("flaresolverr");
    const flare = await fetchWithFlaresolverr(config, url);

    if (flare.ok) {
      // FlareSolverr returns raw HTML — extract text
      const text = extractTextFromHtml(flare.data);
      return {
        url,
        provider: "flaresolverr",
        content: text,
        tookMs: Date.now() - startedAt,
        escalated: true,
        escalationChain: chain,
      };
    }
  }

  // Step 3: Browser fallback (guaranteed)
  if (config.browser?.enabled !== false) {
    chain.push("browser");
    const browser = await fetchWithBrowser(config, url);

    if (browser.ok) {
      const text = extractTextFromHtml(browser.data);
      return {
        url,
        provider: "browser",
        content: text,
        tookMs: Date.now() - startedAt,
        escalated: true,
        escalationChain: chain,
      };
    }
  }

  // All failed
  return {
    url,
    provider: "none",
    content: `Failed to fetch ${url}. Tried: ${chain.join(" → ")}`,
    tookMs: Date.now() - startedAt,
    escalated: true,
    escalationChain: chain,
  };
}

/**
 * Basic HTML → text extraction.
 * Strips tags, collapses whitespace, truncates to 50k chars.
 */
function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10000);
}
