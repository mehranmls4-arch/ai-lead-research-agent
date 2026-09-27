import type { SearchResult, WebSearchProvider } from "./types";

/**
 * Tavily search adapter. Implemented against Tavily's documented /search endpoint.
 * NOT live-tested in this repository (covered by mocked-fetch unit tests only).
 */
export class TavilySearchProvider implements WebSearchProvider {
  readonly name = "tavily";
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {
    if (!apiKey) throw new Error("TAVILY_API_KEY is required for WEB_SEARCH_PROVIDER=tavily");
  }

  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ query, max_results: Math.min(10, maxResults), search_depth: "basic" }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Tavily search failed with HTTP ${res.status}`);
      const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
      return (data.results ?? [])
        .filter((r) => r.url && r.title)
        .map((r) => ({ title: String(r.title), url: String(r.url), snippet: String(r.content ?? "").slice(0, 500) }));
    } finally {
      clearTimeout(timer);
    }
  }
}
