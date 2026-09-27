import type { Evidence } from "../../domain/provenance";
import { domainOf } from "../../security/url";
import { isAllowedByRobots } from "../../security/robots";
import { safeFetch, type SafeFetchOptions } from "../../security/safe-fetch";
import type { WebSearchProvider } from "../search/types";
import { analyzeHtml, type FetchedPage } from "./html-analyzer";
import type { CompanyResearch, ResearchInput, ResearchProvider, WebsiteResearch } from "./types";

export interface WebResearchOptions {
  fetch: Omit<SafeFetchOptions, "accept">;
  maxPages: number;
  search?: WebSearchProvider;
  now?: () => Date;
}

const INTERESTING_PATH = /(about|services|solutions|contact|careers|jobs|locations|pricing|products)/i;

/**
 * Live research: polite, capped website analysis (robots.txt respected, SSRF-guarded)
 * plus optional third-party web search. Returns only what was actually observed.
 */
export class WebResearchProvider implements ResearchProvider {
  readonly name = "web";
  readonly isDemo = false;
  constructor(private readonly opts: WebResearchOptions) {}

  async researchCompany(input: ResearchInput): Promise<CompanyResearch> {
    const notes: string[] = [];
    const evidence: Evidence[] = [];
    const search = this.opts.search;
    const now = (this.opts.now ?? (() => new Date()))().toISOString();
    if (search && search.name !== "none") {
      try {
        const results = await search.search(`"${input.company_name}" company`, 5);
        const domain = domainOf(input.website);
        const relevant = results.filter((r) => (domain && domainOf(r.url) === domain) || r.snippet.toLowerCase().includes(input.company_name.toLowerCase()));
        relevant.slice(0, 5).forEach((r, i) =>
          evidence.push({
            id: `search-${i + 1}`,
            kind: "search_result",
            statement: `${r.title}: ${r.snippet}`.slice(0, 600),
            excerpt: r.snippet.slice(0, 300),
            provenance: {
              source_type: "web_search",
              source: `${search.name}: ${domainOf(r.url) ?? r.url}`,
              source_url: r.url,
              confidence: domain && domainOf(r.url) === domain ? 0.7 : 0.5,
              retrieved_at: now,
              label: "source_backed",
            },
          }),
        );
        notes.push(`Web search (${search.name}) returned ${results.length} results; ${relevant.length} matched the company.`);
      } catch (e) {
        notes.push(`Web search failed: ${(e as Error).message}`);
      }
    } else {
      notes.push("No web search provider configured; company research relies on the website only.");
    }
    return { provider: this.name, is_demo: false, fields: {}, operational_signals: [], technology_signals: [], evidence, buying_signal_candidates: [], notes };
  }

  async analyzeWebsite(url: string): Promise<WebsiteResearch> {
    const notes: string[] = [];
    const errors: string[] = [];
    const now = (this.opts.now ?? (() => new Date()))().toISOString();
    const root = new URL(url);
    let robots = "";
    try {
      const r = await safeFetch(new URL("/robots.txt", root).toString(), { ...this.opts.fetch, maxBytes: 200_000, accept: /^text\/plain|^text\/html|^$/i });
      if (r.status === 200) robots = r.body;
    } catch (e) {
      notes.push(`robots.txt not readable (${(e as Error).message}); proceeding with homepage only.`);
    }
    const allowed = (p: string) => !robots || isAllowedByRobots(robots, this.opts.fetch.userAgent, p);
    if (!allowed(root.pathname || "/")) {
      notes.push("robots.txt disallows fetching this site for our user agent. No pages were fetched.");
      return { analysis: null, notes };
    }
    const pages: FetchedPage[] = [];
    try {
      const home = await safeFetch(root.toString(), this.opts.fetch);
      if (home.status >= 400) throw new Error(`Homepage returned HTTP ${home.status}`);
      pages.push({ url: home.url, status: home.status, html: home.body });
      if (home.truncated) notes.push("Homepage exceeded the size limit and was truncated.");
    } catch (e) {
      notes.push(`Website fetch failed: ${(e as Error).message}`);
      return { analysis: null, notes };
    }
    // Discover a few same-origin pages of interest (no recursive crawling).
    const links = [...pages[0].html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)].map((m) => m[1]);
    const origin = new URL(pages[0].url).origin;
    const rootPath = new URL(pages[0].url).pathname;
    const candidates = [
      ...new Set(
        links
          .map((l) => {
            try {
              return new URL(l, origin);
            } catch {
              return null;
            }
          })
          .filter((u): u is URL => !!u && u.origin === origin && u.pathname !== rootPath && INTERESTING_PATH.test(u.pathname))
          .map((u) => `${u.origin}${u.pathname}`),
      ),
    ];
    for (const c of candidates.slice(0, Math.max(0, this.opts.maxPages - 1))) {
      if (!allowed(new URL(c).pathname)) {
        notes.push(`Skipped ${c} (disallowed by robots.txt).`);
        continue;
      }
      try {
        const p = await safeFetch(c, this.opts.fetch);
        if (p.status < 400) pages.push({ url: p.url, status: p.status, html: p.body });
      } catch (e) {
        errors.push(`${c}: ${(e as Error).message}`);
      }
    }
    notes.push(`Fetched ${pages.length} page(s) from ${root.hostname} (limit ${this.opts.maxPages}).`);
    return { analysis: analyzeHtml(pages, pages[0].url, now, true, errors), notes };
  }
}
