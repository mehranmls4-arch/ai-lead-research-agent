import { assertPublicUrl, dnsResolver, type Resolver } from "./url";

export interface SafeFetchOptions {
  timeoutMs: number;
  maxBytes: number;
  userAgent: string;
  maxRedirects?: number;
  accept?: RegExp; // allowed content types
  fetchImpl?: typeof fetch;
  resolver?: Resolver;
}

export interface SafeFetchResult {
  url: string; // final URL after redirects
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
}

export class SafeFetchError extends Error {}

/**
 * Fetch with SSRF protection on every hop, manual redirect handling, a hard timeout,
 * a byte cap on the body and a content-type allow-list.
 */
export async function safeFetch(input: string, opts: SafeFetchOptions): Promise<SafeFetchResult> {
  const f = opts.fetchImpl ?? fetch;
  const resolver = opts.resolver ?? dnsResolver;
  const maxRedirects = opts.maxRedirects ?? 3;
  let current = input;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = await assertPublicUrl(current, resolver);
    if (!check.ok) throw new SafeFetchError(`Blocked URL: ${check.error}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    let res: Response;
    try {
      res = await f(check.url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": opts.userAgent, accept: "text/html,text/plain;q=0.9,*/*;q=0.1" },
      });
    } catch (e) {
      clearTimeout(timer);
      throw new SafeFetchError(controller.signal.aborted ? `Timed out after ${opts.timeoutMs} ms` : `Fetch failed: ${(e as Error).message}`);
    }
    if (res.status >= 300 && res.status < 400) {
      clearTimeout(timer);
      const loc = res.headers.get("location");
      if (!loc) throw new SafeFetchError(`Redirect without location (${res.status})`);
      current = new URL(loc, check.url).toString();
      continue;
    }
    const contentType = res.headers.get("content-type") ?? "";
    const accept = opts.accept ?? /^(text\/html|text\/plain|application\/xhtml\+xml)/i;
    if (!accept.test(contentType)) {
      clearTimeout(timer);
      await res.body?.cancel().catch(() => undefined);
      throw new SafeFetchError(`Unsupported content type "${contentType || "unknown"}"`);
    }
    const declared = Number(res.headers.get("content-length") ?? "0");
    let body = "";
    let truncated = declared > opts.maxBytes;
    try {
      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let received = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > opts.maxBytes) {
            truncated = true;
            body += decoder.decode(value.slice(0, Math.max(0, value.byteLength - (received - opts.maxBytes))));
            await reader.cancel().catch(() => undefined);
            break;
          }
          body += decoder.decode(value, { stream: true });
        }
      }
    } finally {
      clearTimeout(timer);
    }
    return { url: check.url, status: res.status, contentType, body, truncated };
  }
  throw new SafeFetchError(`Too many redirects (>${maxRedirects})`);
}
