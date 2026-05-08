import { definePluginEntry } from "./types.js";
import { loadConfig } from "./config.js";
import { routeSearch, routeFetch } from "./router.js";
import { takeScreenshot } from "./providers/screenshot.js";
import { Type } from "@sinclair/typebox";

export default definePluginEntry({
  id: "web-intel",
  name: "Web Intelligence",
  description:
    "Smart-routing web search and fetch: SearXNG -> Scrapling -> FlareSolverr -> Browser",

  register(api) {
    const config = loadConfig() as any;

    api.logger.info(
      `web-intel: registering (searxng=${config.searxng?.baseUrl}, flaresolverr=${config.flaresolverr?.baseUrl}, scrapling=${config.scrapling?.enabled}, browser=${config.browser?.enabled})`
    );

    const getRuntimeConfig = (ctx?: any) =>
      loadConfig(
        ctx?.config?.plugins?.entries?.["web-intel"]?.config as
          | Record<string, unknown>
          | undefined
      );

    // Register as a native search provider for OpenClaw versions that honor providers.
    api.registerWebSearchProvider({
      id: "web-intel",
      label: "Web Intelligence (Smart Router)",
      hint: "Smart-routing search: SearXNG -> Agent Browser fallback. Zero API cost.",
      requiresCredential: false,
      credentialLabel: "SearXNG Base URL (optional, auto-detected)",
      envVars: ["SEARXNG_BASE_URL", "FLARESOLVERR_URL"],
      placeholder: "http://localhost:8890",
      signupUrl: "https://github.com/davinci-ui/web-intel",
      autoDetectOrder: 10,
      credentialPath: "plugins.entries.web-intel.config.searxng.baseUrl",

      getCredentialValue: (searchConfig?: Record<string, unknown>) => {
        return (searchConfig as Record<string, unknown>)?.["web-intel"] ?? undefined;
      },

      setCredentialValue: (
        searchConfigTarget: Record<string, unknown>,
        value: unknown
      ) => {
        searchConfigTarget["web-intel"] = value;
      },

      createTool: (ctx) => ({
        description:
          "Search the web using smart routing: tries SearXNG first, then Agent Browser fallback. Returns titles, URLs, and snippets. Zero API cost.",
        parameters: Type.Object(
          {
            query: Type.String({ description: "Search query string." }),
            count: Type.Optional(
              Type.Number({
                description: "Number of results (1-10).",
                minimum: 1,
                maximum: 10,
              })
            ),
            categories: Type.Optional(
              Type.String({
                description:
                  "Search categories: general, news, it, science, files, images, music, videos.",
              })
            ),
            language: Type.Optional(
              Type.String({
                description: "Language code for results, for example en, ja, or de.",
              })
            ),
          },
          { additionalProperties: false }
        ),
        execute: async (args: Record<string, unknown>) => {
          const runtimeConfig = getRuntimeConfig(ctx);
          const result = await routeSearch(runtimeConfig, {
            query: args.query as string,
            count: args.count as number | undefined,
            categories: args.categories as string | undefined,
            language: args.language as string | undefined,
          });

          return {
            query: result.query,
            provider: result.provider,
            count: result.count,
            tookMs: result.tookMs,
            escalated: result.escalated,
            escalationChain: result.escalationChain,
            externalContent: {
              untrusted: true,
              source: "web_search",
              provider: "web-intel",
              wrapped: true,
            },
            results: result.results.map((r) => ({
              title: r.title,
              url: r.url,
              snippet: r.snippet,
              siteName: r.source || undefined,
            })),
          };
        },
      }),
    });

    // Register as a native fetch provider for OpenClaw versions that honor providers.
    api.registerWebFetchProvider({
      id: "web-intel",
      label: "Web Intelligence (Smart Fetch)",
      hint: "Smart-routing fetch: Scrapling -> FlareSolverr -> Agent Browser fallback. Zero API cost.",
      requiresCredential: false,
      credentialLabel: "FlareSolverr URL (optional, auto-detected)",
      envVars: ["FLARESOLVERR_URL", "SEARXNG_BASE_URL"],
      placeholder: "http://localhost:8191",
      signupUrl: "https://github.com/davinci-ui/web-intel",
      autoDetectOrder: 10,
      credentialPath: "plugins.entries.web-intel.config.flaresolverr.baseUrl",

      getCredentialValue: (fetchConfig?: Record<string, unknown>) => {
        return (fetchConfig as Record<string, unknown>)?.["web-intel"] ?? undefined;
      },

      setCredentialValue: (
        fetchConfigTarget: Record<string, unknown>,
        value: unknown
      ) => {
        fetchConfigTarget["web-intel"] = value;
      },

      createTool: (ctx) => ({
        description:
          "Fetch and read a web page with smart escalation: Scrapling -> FlareSolverr -> Agent Browser.",
        parameters: Type.Object(
          {
            url: Type.String({ description: "URL to fetch and read." }),
          },
          { additionalProperties: false }
        ),
        execute: async (args: Record<string, unknown>) => {
          const runtimeConfig = getRuntimeConfig(ctx);
          const result = await routeFetch(runtimeConfig, args.url as string);

          return {
            url: result.url,
            provider: result.provider,
            content: result.content,
            tookMs: result.tookMs,
            escalated: result.escalated,
            escalationChain: result.escalationChain,
            externalContent: {
              untrusted: true,
              source: "web_fetch",
              provider: "web-intel",
              wrapped: true,
            },
          };
        },
      }),
    });

    // Also register web_search directly for OpenClaw versions where core tools are disabled.
    api.registerTool((ctx) => ({
      name: "web_search",
      label: "Web Search (Smart Router)",
      description:
        "Search the web using smart routing: tries SearXNG first, then Agent Browser fallback. Returns titles, URLs, and snippets. Zero API cost.",
      parameters: Type.Object(
        {
          query: Type.String({ description: "Search query string." }),
          count: Type.Optional(
            Type.Number({
              description: "Number of results (1-10).",
              minimum: 1,
              maximum: 10,
            })
          ),
          categories: Type.Optional(
            Type.String({
              description:
                "Search categories: general, news, it, science, files, images, music, videos.",
            })
          ),
          language: Type.Optional(
            Type.String({
              description: "Language code for results, for example en, ja, or de.",
            })
          ),
        },
        { additionalProperties: false }
      ),
      async execute(_id: string, params: Record<string, unknown>) {
        const runtimeConfig = getRuntimeConfig(ctx);
        const result = await routeSearch(runtimeConfig, {
          query: params.query as string,
          count: params.count as number | undefined,
          categories: params.categories as string | undefined,
          language: params.language as string | undefined,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          details: {
            query: result.query,
            provider: result.provider,
            count: result.count,
            tookMs: result.tookMs,
            escalated: result.escalated,
            escalationChain: result.escalationChain,
            results: result.results,
          },
        };
      },
    }), { name: "web_search" });

    // Register web_intel_fetch for page reading with escalation.
    api.registerTool((ctx) => ({
      name: "web_intel_fetch",
      label: "Web Fetch (Smart Escalation)",
      description:
        "Fetch and read a web page with smart escalation: Scrapling -> FlareSolverr -> Browser. Handles Cloudflare, anti-bot, and JS-heavy sites automatically.",
      parameters: Type.Object(
        {
          url: Type.String({ description: "URL to fetch and read." }),
        },
        { additionalProperties: false }
      ),
      async execute(_id: string, params: { url: string }) {
        const runtimeConfig = getRuntimeConfig(ctx);
        const result = await routeFetch(runtimeConfig, params.url);

        return {
          content: [
            {
              type: "text" as const,
              text: result.content,
            },
          ],
          details: {
            provider: result.provider,
            tookMs: result.tookMs,
            escalated: result.escalated,
            escalationChain: result.escalationChain,
          },
        };
      },
    }), { names: ["web_intel_fetch", "web_fetch"] });

    // Register screenshot tool (OpenClaw Browser)
    api.registerTool((ctx) => ({
      name: "web_intel_screenshot",
      label: "Web Screenshot (OpenClaw Browser)",
      description:
        "Take a screenshot of a web page using OpenClaw native browser automation. Returns a PNG image buffer.",
      parameters: Type.Object(
        {
          url: Type.String({ description: "URL to capture." }),
          width: Type.Optional(
            Type.Number({
              description: "Screenshot width in pixels (default 1280).",
              minimum: 320,
              maximum: 4096,
            })
          ),
          height: Type.Optional(
            Type.Number({
              description: "Screenshot height in pixels (default 720).",
              minimum: 240,
              maximum: 4096,
            })
          ),
        },
        { additionalProperties: false }
      ),
      async execute(
        _id: string,
        params: { url: string; width?: number; height?: number }
      ) {
        const runtimeConfig = getRuntimeConfig(ctx);
        const result = await takeScreenshot(
          {
            sandboxBridgeUrl: ctx.browser?.sandboxBridgeUrl,
            allowHostControl: ctx.browser?.allowHostControl,
            sessionKey: ctx.sessionKey,
          },
          params.url,
          params.width ?? 1280,
          params.height ?? 720,
          runtimeConfig.browser?.profile ?? "openclaw"
        );

        if (!result.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Screenshot failed: ${result.error}`,
              },
            ],
            details: {
              provider: "openclaw-browser",
              width: params.width ?? 1280,
              height: params.height ?? 720,
              url: params.url,
              error: result.error,
            },
          };
        }

        return {
          content: [
            {
              type: "image" as const,
              data: result.data!.toString("base64"),
              mimeType: "image/png",
            },
          ],
          details: {
            provider: "openclaw-browser",
            width: params.width ?? 1280,
            height: params.height ?? 720,
            url: params.url,
          },
        };
      },
    }), { name: "web_intel_screenshot" });

    api.logger.info("web-intel: registered web search/fetch providers + web_search + web_fetch + web_intel_fetch + web_intel_screenshot tools");
  },
});
