import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getSessionSecret, signSession, verifySession, type SessionUser } from "@/lib/auth/session";

const SECRET = "unit-test-secret-unit-test-secret-32c";
const user: Omit<SessionUser, "exp"> = { uid: "u1", email: "admin@novaflow.demo", name: "Admin", role: "admin" };

describe("password hashing", () => {
  it("hashes and verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });
  it("rejects a wrong password and never stores it in plain text", async () => {
    const hash = await hashPassword("real-password");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
    expect(hash).not.toContain("real-password");
  });
  it("produces a different hash each time (random salt)", async () => {
    const [a, b] = await Promise.all([hashPassword("same"), hashPassword("same")]);
    expect(a).not.toBe(b);
    expect(await verifyPassword("same", a)).toBe(true);
    expect(await verifyPassword("same", b)).toBe(true);
  });
  it("safely rejects malformed stored hashes instead of throwing", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "scrypt$bad$format")).toBe(false);
  });
});

describe("session tokens", () => {
  it("requires a session secret of at least 32 characters", () => {
    const old = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "short";
    expect(() => getSessionSecret()).toThrow(/32 characters/);
    process.env.SESSION_SECRET = old;
  });
  it("signs and verifies a valid session", async () => {
    const token = await signSession(user, SECRET);
    const verified = await verifySession(token, SECRET);
    expect(verified).toMatchObject(user);
  });
  it("rejects a token signed with a different secret (tampering)", async () => {
    const token = await signSession(user, SECRET);
    expect(await verifySession(token, "a-completely-different-secret-32c")).toBeNull();
  });
  it("rejects a token with a modified payload (signature no longer matches)", async () => {
    const token = await signSession(user, SECRET);
    const [, sig] = token.split(".");
    const tamperedPayload = JSON.stringify({ ...user, role: "admin", uid: "someone-else" });
    const tamperedBody = Buffer.from(tamperedPayload).toString("base64url");
    expect(await verifySession(`${tamperedBody}.${sig}`, SECRET)).toBeNull();
  });
  it("rejects an expired session", async () => {
    const token = await signSession(user, SECRET, 60, Date.parse("2026-01-01T00:00:00Z"));
    expect(await verifySession(token, SECRET, Date.parse("2026-01-01T00:02:00Z"))).toBeNull();
    expect(await verifySession(token, SECRET, Date.parse("2026-01-01T00:00:30Z"))).toMatchObject(user);
  });
  it("rejects malformed, empty and oversized tokens without throwing", async () => {
    expect(await verifySession(undefined, SECRET)).toBeNull();
    expect(await verifySession("", SECRET)).toBeNull();
    expect(await verifySession("not-a-token", SECRET)).toBeNull();
    expect(await verifySession("a".repeat(5000), SECRET)).toBeNull();
  });
  it("rejects a token with an invalid role", async () => {
    const token = await signSession({ ...user, role: "superadmin" as never }, SECRET);
    expect(await verifySession(token, SECRET)).toBeNull();
  });
});
