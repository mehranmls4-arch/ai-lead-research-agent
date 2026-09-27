import { describe, expect, it } from "vitest";
import { TavilySearchProvider } from "@/lib/providers/search/tavily";

/**
 * Mocked-only: verifies request shape and response normalisation against a fake fetch.
 * The real Tavily API is never called in this suite — implemented and mocked-tested, not live-tested.
 */
describe("TavilySearchProvider", () => {
  it("requires an API key", () => {
    expect(() => new TavilySearchProvider("")).toThrow(/TAVILY_API_KEY/);
  });

  it("posts the query, API key and a capped max_results to Tavily's search endpoint", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(url), init: init! };
      return new Response(JSON.stringify({ results: [{ title: "Acme Freight", url: "https://acme.com", content: "A freight company" }] }), { status: 200 });
    }) as typeof fetch;
    const p = new TavilySearchProvider("tv-key", fetchImpl);
    const r = await p.search('"Acme Freight" company', 25);
    expect(captured!.url).toBe("https://api.tavily.com/search");
    const body = JSON.parse(captured!.init.body as string);
    expect(body).toMatchObject({ query: '"Acme Freight" company', max_results: 10, search_depth: "basic" });
    expect(new Headers(captured!.init.headers).get("authorization")).toBe("Bearer tv-key");
    expect(r).toEqual([{ title: "Acme Freight", url: "https://acme.com", snippet: "A freight company" }]);
  });

  it("normalises missing fields and drops results without a title or URL", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ results: [{ title: "Has title", url: "https://a.com" }, { url: "https://no-title.com" }, { title: "No URL" }] })) ) as typeof fetch;
    const p = new TavilySearchProvider("tv-key", fetchImpl);
    const r = await p.search("q");
    expect(r).toEqual([{ title: "Has title", url: "https://a.com", snippet: "" }]);
  });

  it("throws on a non-2xx response", async () => {
    const fetchImpl = (async () => new Response("bad", { status: 500 })) as typeof fetch;
    await expect(new TavilySearchProvider("tv-key", fetchImpl).search("q")).rejects.toThrow(/HTTP 500/);
  });

  it("throws on a malformed JSON response", async () => {
    const fetchImpl = (async () => new Response("not json", { status: 200 })) as typeof fetch;
    await expect(new TavilySearchProvider("tv-key", fetchImpl).search("q")).rejects.toThrow();
  });

  it("propagates a timeout", async () => {
    const fetchImpl = (async (_u, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as typeof fetch;
    await expect(new TavilySearchProvider("tv-key", fetchImpl, 30).search("q")).rejects.toThrow();
  });

  it("treats an empty results array as no matches, not an error", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ results: [] }))) as typeof fetch;
    expect(await new TavilySearchProvider("tv-key", fetchImpl).search("q")).toEqual([]);
  });
});
