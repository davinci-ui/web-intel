import type { WebIntelConfig } from "./types.js";

const ENV_DEFAULTS: Record<string, string> = {
  SEARXNG_BASE_URL: "",
  FLARESOLVERR_URL: "",
  SCRAPLING_PYTHON: "python3",
};

export function loadConfig(pluginConfig?: any): WebIntelConfig {
  const raw = (pluginConfig ?? {}) as Partial<WebIntelConfig>;

  return {
    searxng: {
      baseUrl:
        (raw.searxng?.baseUrl as string) ||
        process.env.SEARXNG_BASE_URL ||
        "http://localhost:8890",
      categories: raw.searxng?.categories || "general",
      language: raw.searxng?.language || undefined,
    },
    flaresolverr: {
      baseUrl:
        (raw.flaresolverr?.baseUrl as string) ||
        process.env.FLARESOLVERR_URL ||
        "http://localhost:8191",
      maxTimeout: raw.flaresolverr?.maxTimeout || 60000,
    },
    scrapling: {
      enabled: raw.scrapling?.enabled !== false,
      pythonPath:
        raw.scrapling?.pythonPath ||
        process.env.SCRAPLING_PYTHON ||
        "python3",
    },
    browser: {
      enabled: raw.browser?.enabled !== false,
      endpoint: raw.browser?.endpoint || undefined,
      args: raw.browser?.args || process.env.AGENT_BROWSER_ARGS || undefined,
      profile: raw.browser?.profile || "openclaw",
    },
  };
}
