import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { isPrivateIp } from "./ip";

export type UrlCheck = { ok: true; url: string } | { ok: false; error: string };

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home", ".corp", ".localdomain"];
const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata"]);

/** Syntactic normalisation and validation. No network access. */
export function normalizeWebsite(input: string): UrlCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "URL is empty" };
  if (raw.length > 500) return { ok: false, error: "URL is too long" };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return { ok: false, error: "Not a valid URL" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, error: `Protocol ${u.protocol} is not allowed` };
  if (u.username || u.password) return { ok: false, error: "URLs with credentials are not allowed" };
  if (u.port && !["80", "443"].includes(u.port)) return { ok: false, error: `Port ${u.port} is not allowed` };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, error: "Missing hostname" };
  if (BLOCKED_HOSTS.has(host) || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return { ok: false, error: "Internal hostnames are not allowed" };
  const bare = host.replace(/^\[|\]$/g, "");
  if (isIP(bare)) {
    if (isPrivateIp(bare)) return { ok: false, error: "Private or reserved IP addresses are not allowed" };
  } else {
    if (!host.includes(".")) return { ok: false, error: "Hostname must be a public domain" };
    if (/^\d+$/.test(host.replace(/\./g, ""))) return { ok: false, error: "Numeric hostnames are not allowed" };
    // Decimal/hex/octal encoded IPv4 like 0x7f.1 or 2130706433 are rejected by the URL parser normalising them into dotted IPs above.
  }
  u.hash = "";
  u.hostname = host;
  return { ok: true, url: u.toString() };
}

export type Resolver = (host: string) => Promise<string[]>;

export const dnsResolver: Resolver = async (host) => {
  const res = await lookup(host, { all: true, verbatim: true });
  return res.map((r) => r.address);
};

/**
 * Full SSRF check: syntactic validation plus DNS resolution, rejecting any hostname
 * that resolves to a private, loopback, link-local or reserved address.
 */
export async function assertPublicUrl(input: string, resolve: Resolver = dnsResolver): Promise<UrlCheck> {
  const n = normalizeWebsite(input);
  if (!n.ok) return n;
  const host = new URL(n.url).hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return n;
  let addrs: string[];
  try {
    addrs = await resolve(host);
  } catch {
    return { ok: false, error: `Could not resolve ${host}` };
  }
  if (!addrs.length) return { ok: false, error: `Could not resolve ${host}` };
  const bad = addrs.find((a) => isPrivateIp(a));
  if (bad) return { ok: false, error: `${host} resolves to a non-public address` };
  return n;
}

export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}
