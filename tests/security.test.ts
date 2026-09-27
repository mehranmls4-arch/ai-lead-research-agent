import { describe, expect, it } from "vitest";
import { isPrivateIp } from "@/lib/security/ip";
import { assertPublicUrl, normalizeWebsite, type Resolver } from "@/lib/security/url";
import { isAllowedByRobots } from "@/lib/security/robots";
import { rateLimit, resetRateLimits } from "@/lib/security/rate-limit";

const publicResolver: Resolver = async () => ["93.184.216.34"];

describe("SSRF protection: URL validation", () => {
  it.each([
    "http://localhost",
    "http://localhost:3000",
    "http://127.0.0.1",
    "http://127.1.2.3",
    "http://0.0.0.0",
    "http://10.0.0.1",
    "http://172.16.5.4",
    "http://192.168.1.1",
    "http://169.254.169.254/latest/meta-data",
    "http://100.64.0.1",
    "http://[::1]/",
    "http://[fe80::1]/",
    "http://[fc00::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://metadata.google.internal",
    "http://printer.local",
    "http://2130706433",
    "http://0x7f000001",
    "file:///etc/passwd",
    "ftp://example.com",
    "gopher://example.com",
    "https://user:pass@example.com",
    "https://example.com:8080",
    "not a url at all",
    "",
  ])("rejects %s", (u) => {
    expect(normalizeWebsite(u).ok).toBe(false);
  });

  it("accepts and normalises public http(s) URLs", () => {
    expect(normalizeWebsite("example.com")).toEqual({ ok: true, url: "https://example.com/" });
    expect(normalizeWebsite("https://Example.COM/about#team")).toEqual({ ok: true, url: "https://example.com/about" });
    expect(normalizeWebsite("http://example.com").ok).toBe(true);
    expect(normalizeWebsite("https://8.8.8.8").ok).toBe(true);
  });

  it("classifies private and public IPs", () => {
    for (const ip of ["127.0.0.1", "10.1.1.1", "172.31.255.255", "192.168.0.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::abcd", "::ffff:10.0.0.1"]) expect(isPrivateIp(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "172.32.0.1", "93.184.216.34", "2606:4700::1111"]) expect(isPrivateIp(ip), ip).toBe(false);
  });

  it("rejects public hostnames that resolve to private addresses (DNS rebinding style)", async () => {
    expect((await assertPublicUrl("https://evil.example.com", async () => ["127.0.0.1"])).ok).toBe(false);
    expect((await assertPublicUrl("https://evil.example.com", async () => ["93.184.216.34", "10.0.0.2"])).ok).toBe(false);
    expect((await assertPublicUrl("https://nx.example.com", async () => { throw new Error("ENOTFOUND"); })).ok).toBe(false);
    expect((await assertPublicUrl("https://nx.example.com", async () => [])).ok).toBe(false);
    expect((await assertPublicUrl("https://good.example.com", publicResolver)).ok).toBe(true);
  });
});

describe("robots.txt", () => {
  const robots = "User-agent: *\nDisallow: /private\nAllow: /private/public\n\nUser-agent: NovaFlowBot\nDisallow: /\n";
  it("honours rules for the wildcard agent", () => {
    expect(isAllowedByRobots(robots, "SomeBot/1.0", "/about")).toBe(true);
    expect(isAllowedByRobots(robots, "SomeBot/1.0", "/private/data")).toBe(false);
    expect(isAllowedByRobots(robots, "SomeBot/1.0", "/private/public/page")).toBe(true);
  });
  it("prefers the specific agent group", () => {
    expect(isAllowedByRobots(robots, "NovaFlowBot/1.0", "/about")).toBe(false);
  });
  it("allows everything when robots.txt is empty", () => {
    expect(isAllowedByRobots("", "Any", "/x")).toBe(true);
  });
});

describe("rate limiting", () => {
  it("blocks after the limit within the window", () => {
    resetRateLimits();
    const results = Array.from({ length: 4 }, () => rateLimit("k", 3, 60_000).ok);
    expect(results).toEqual([true, true, true, false]);
    expect(rateLimit("other", 3, 60_000).ok).toBe(true);
  });
});
