import { describe, expect, it } from "vitest";
import { safeFetch, SafeFetchError } from "@/lib/security/safe-fetch";
import { WebResearchProvider } from "@/lib/providers/research/web";
import type { Resolver } from "@/lib/security/url";
import { NOW } from "./helpers";

const resolver: Resolver = async (h) => (h.startsWith("internal") ? ["10.0.0.5"] : ["93.184.216.34"]);
const base = { timeoutMs: 200, maxBytes: 1000, userAgent: "NovaFlowBot/1.0 (+test)", resolver };

type Route = { status?: number; headers?: Record<string, string>; body?: string; delayMs?: number };
function mockFetch(routes: Record<string, Route>, calls: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    const r = routes[url];
    if (!r) return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
    if (r.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, r.delayMs);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    }
    return new Response(r.body ?? "", { status: r.status ?? 200, headers: { "content-type": "text/html; charset=utf-8", ...r.headers } });
  }) as typeof fetch;
}

describe("safeFetch", () => {
  it("fetches valid HTML and sends the user agent", async () => {
    let ua = "";
    const f = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      ua = new Headers(init?.headers).get("user-agent") ?? "";
      return new Response("<h1>Hi</h1>", { headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const r = await safeFetch("https://acme.com/", { ...base, fetchImpl: f });
    expect(r.body).toBe("<h1>Hi</h1>");
    expect(r.truncated).toBe(false);
    expect(ua).toBe(base.userAgent);
  });
  it("times out slow servers", async () => {
    const f = mockFetch({ "https://slow.com/": { body: "x", delayMs: 2000 } });
    await expect(safeFetch("https://slow.com/", { ...base, fetchImpl: f })).rejects.toThrow(/Timed out after 200 ms/);
  });
  it("rejects unsupported content types", async () => {
    const f = mockFetch({ "https://acme.com/file.pdf": { body: "%PDF", headers: { "content-type": "application/pdf" } } });
    await expect(safeFetch("https://acme.com/file.pdf", { ...base, fetchImpl: f })).rejects.toThrow(/Unsupported content type/);
  });
  it("truncates oversized bodies at the byte cap", async () => {
    const f = mockFetch({ "https://big.com/": { body: "a".repeat(5000) } });
    const r = await safeFetch("https://big.com/", { ...base, fetchImpl: f });
    expect(r.truncated).toBe(true);
    expect(r.body.length).toBeLessThanOrEqual(base.maxBytes);
  });
  it("rejects malformed and non-http URLs before any request", async () => {
    const calls: string[] = [];
    const f = mockFetch({}, calls);
    await expect(safeFetch("ht!tp://bad", { ...base, fetchImpl: f })).rejects.toBeInstanceOf(SafeFetchError);
    await expect(safeFetch("ftp://acme.com", { ...base, fetchImpl: f })).rejects.toThrow(/Blocked URL/);
    expect(calls).toEqual([]);
  });
  it("follows safe redirects and re-checks every hop", async () => {
    const f = mockFetch({
      "http://acme.com/": { status: 301, headers: { location: "https://www.acme.com/" } },
      "https://www.acme.com/": { body: "<p>ok</p>" },
    });
    const r = await safeFetch("http://acme.com", { ...base, fetchImpl: f });
    expect(r.url).toBe("https://www.acme.com/");
    const evil = mockFetch({ "https://acme.com/": { status: 302, headers: { location: "http://169.254.169.254/latest" } } });
    await expect(safeFetch("https://acme.com", { ...base, fetchImpl: evil })).rejects.toThrow(/Blocked URL/);
    const internal = mockFetch({ "https://acme.com/": { status: 302, headers: { location: "https://internal-app.acme.com/" } } });
    await expect(safeFetch("https://acme.com", { ...base, fetchImpl: internal })).rejects.toThrow(/non-public/);
  });
  it("limits redirect chains", async () => {
    const f = mockFetch({
      "https://a.com/": { status: 302, headers: { location: "https://a.com/1" } },
      "https://a.com/1": { status: 302, headers: { location: "https://a.com/2" } },
      "https://a.com/2": { status: 302, headers: { location: "https://a.com/3" } },
      "https://a.com/3": { status: 302, headers: { location: "https://a.com/4" } },
    });
    await expect(safeFetch("https://a.com/", { ...base, fetchImpl: f })).rejects.toThrow(/Too many redirects/);
  });
  it("returns non-200 statuses to the caller instead of treating them as content", async () => {
    const r = await safeFetch("https://acme.com/missing", { ...base, fetchImpl: mockFetch({}) });
    expect(r.status).toBe(404);
  });
});

describe("WebResearchProvider (mocked HTTP)", () => {
  const html = `<html><head><title>Acme Freight</title><meta name="description" content="Freight and trucking"></head><body>
    <h1>Freight you can track</h1><a href="/contact">Contact us</a><a href="/careers">Careers</a>
    <form><input name="email"><textarea name="msg"></textarea></form></body></html>`;
  const make = (routes: Record<string, Route>, calls: string[] = []) =>
    new WebResearchProvider({ fetch: { ...base, maxBytes: 100_000, fetchImpl: mockFetch(routes, calls) }, maxPages: 3, now: () => NOW });

  it("analyses the homepage and a few same-origin pages with verified provenance", async () => {
    const calls: string[] = [];
    const p = make(
      {
        "https://acme.com/robots.txt": { body: "User-agent: *\nDisallow: /admin", headers: { "content-type": "text/plain" } },
        "https://acme.com/": { body: html },
        "https://acme.com/contact": { body: "<h1>Contact</h1><p>ops@acme.com</p>" },
        "https://acme.com/careers": { body: "<p>We're hiring a Dispatch Coordinator</p>" },
      },
      calls,
    );
    const r = await p.analyzeWebsite("https://acme.com/");
    expect(r.analysis).not.toBeNull();
    expect(r.analysis!.source_type).toBe("website");
    expect(r.analysis!.fetched_at).toBe(NOW.toISOString());
    expect(r.analysis!.title).toBe("Acme Freight");
    expect(r.analysis!.pages.length).toBe(3);
    expect(calls[0]).toBe("https://acme.com/robots.txt");
  });
  it("fetches nothing when robots.txt disallows the site", async () => {
    const calls: string[] = [];
    const p = make({ "https://acme.com/robots.txt": { body: "User-agent: *\nDisallow: /", headers: { "content-type": "text/plain" } }, "https://acme.com/": { body: html } }, calls);
    const r = await p.analyzeWebsite("https://acme.com/");
    expect(r.analysis).toBeNull();
    expect(r.notes.join()).toMatch(/robots\.txt disallows/);
    expect(calls).toEqual(["https://acme.com/robots.txt"]);
  });
  it("skips individual pages disallowed by robots.txt", async () => {
    const calls: string[] = [];
    const p = make({ "https://acme.com/robots.txt": { body: "User-agent: *\nDisallow: /careers", headers: { "content-type": "text/plain" } }, "https://acme.com/": { body: html } }, calls);
    const r = await p.analyzeWebsite("https://acme.com/");
    expect(calls).not.toContain("https://acme.com/careers");
    expect(r.notes.join()).toMatch(/Skipped https:\/\/acme\.com\/careers/);
  });
  it("reports HTTP errors without fabricating an analysis", async () => {
    const r = await make({ "https://acme.com/": { status: 503, body: "down" } }).analyzeWebsite("https://acme.com/");
    expect(r.analysis).toBeNull();
    expect(r.notes.join()).toMatch(/HTTP 503/);
  });
  it("returns an empty analysis (no invented facts) for an empty page", async () => {
    const r = await make({ "https://acme.com/": { body: "" } }).analyzeWebsite("https://acme.com/");
    expect(r.analysis!.title).toBeNull();
    expect(r.analysis!.services).toEqual([]);
    expect(r.analysis!.technologies).toEqual([]);
  });
  it("records search results as source-backed evidence with URLs", async () => {
    const p = new WebResearchProvider({
      fetch: { ...base, fetchImpl: mockFetch({}) },
      maxPages: 1,
      now: () => NOW,
      search: { name: "fake", search: async () => [{ title: "Acme Freight expands", url: "https://news.com/acme", snippet: "Acme Freight opened a new Atlanta terminal." }, { title: "Unrelated", url: "https://x.com", snippet: "Other" }] },
    });
    const r = await p.researchCompany({ company_name: "Acme Freight", website: "https://acme.com" });
    expect(r.evidence).toHaveLength(1);
    expect(r.evidence[0].provenance).toMatchObject({ source_type: "web_search", label: "source_backed", source_url: "https://news.com/acme", retrieved_at: NOW.toISOString() });
    expect(r.is_demo).toBe(false);
  });
});
