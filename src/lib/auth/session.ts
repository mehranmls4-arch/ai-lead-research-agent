/**
 * Stateless HMAC-signed session tokens. Uses Web Crypto only, so the same code
 * verifies sessions in Edge middleware and in Node route handlers.
 */
export const SESSION_COOKIE = "nf_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type Role = "admin" | "member";
export interface SessionUser {
  uid: string;
  email: string;
  name: string;
  role: Role;
  exp: number; // unix seconds
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function key(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export function getSessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return s;
}

export async function signSession(user: Omit<SessionUser, "exp">, secret: string, ttlSeconds = SESSION_TTL_SECONDS, nowMs = Date.now()): Promise<string> {
  const payload: SessionUser = { ...user, exp: Math.floor(nowMs / 1000) + ttlSeconds };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined | null, secret: string, nowMs = Date.now()): Promise<SessionUser | null> {
  if (!token || token.length > 4096) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(secret), fromB64url(sig) as BufferSource, enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionUser;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < nowMs) return null;
    if (payload.role !== "admin" && payload.role !== "member") return null;
    return payload;
  } catch {
    return null;
  }
}
