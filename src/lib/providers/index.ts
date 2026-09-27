import { getConfig, type AppConfig } from "../config";
import type { AIProvider } from "./ai/types";
import { MockAIProvider } from "./ai/mock";
import { OpenAICompatibleProvider } from "./ai/openai";
import type { ResearchProvider } from "./research/types";
import { MockResearchProvider } from "./research/mock";
import { WebResearchProvider } from "./research/web";
import { NoWebSearchProvider, type WebSearchProvider } from "./search/types";
import { TavilySearchProvider } from "./search/tavily";

export function createAIProvider(cfg: AppConfig = getConfig()): AIProvider {
  if (cfg.AI_PROVIDER === "openai") {
    return new OpenAICompatibleProvider({ apiKey: cfg.OPENAI_API_KEY ?? "", baseUrl: cfg.OPENAI_BASE_URL, model: cfg.OPENAI_MODEL });
  }
  return new MockAIProvider();
}

export function createSearchProvider(cfg: AppConfig = getConfig()): WebSearchProvider {
  if (cfg.WEB_SEARCH_PROVIDER === "tavily") return new TavilySearchProvider(cfg.TAVILY_API_KEY ?? "");
  return new NoWebSearchProvider();
}

export function createResearchProvider(cfg: AppConfig = getConfig()): ResearchProvider {
  if (cfg.RESEARCH_PROVIDER === "web") {
    return new WebResearchProvider({
      fetch: { timeoutMs: cfg.FETCH_TIMEOUT_MS, maxBytes: cfg.FETCH_MAX_BYTES, userAgent: cfg.FETCH_USER_AGENT },
      maxPages: cfg.FETCH_MAX_PAGES,
      search: createSearchProvider(cfg),
    });
  }
  return new MockResearchProvider();
}
