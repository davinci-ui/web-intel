// Import plugin SDK types
import { definePluginEntry as sdkDefinePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
export { type OpenClawPluginApi, type OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";

// Re-export with correct signature
export const definePluginEntry = sdkDefinePluginEntry;

// Plugin entry signature
export type PluginEntry = ReturnType<typeof sdkDefinePluginEntry>;

export interface WebIntelConfig {
  searxng?: {
    baseUrl?: string;
    categories?: string;
    language?: string;
  };
  flaresolverr?: {
    baseUrl?: string;
    maxTimeout?: number;
  };
  scrapling?: {
    enabled?: boolean;
    pythonPath?: string;
  };
  browser?: {
    enabled?: boolean;
    endpoint?: string;
    args?: string;
    profile?: string;
  };
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
}

export interface SearchResponse {
  query: string;
  provider: string;
  count: number;
  tookMs: number;
  results: SearchResult[];
  cached?: boolean;
  escalated?: boolean;
  escalationChain?: string[];
}

export interface FetchResponse {
  url: string;
  provider: string;
  content: string;
  tookMs: number;
  escalated?: boolean;
  escalationChain?: string[];
}

export type ProviderResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; data?: T };
