import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Checks an HTTP Basic `Authorization` header against the site password. Any
 * username is accepted. The comparison runs on SHA-256 digests with
 * timingSafeEqual, so its timing doesn't reveal how much of a guess matched.
 */
export function isSitePasswordValid(authorization: string | null, password: string): boolean {
  const match = authorization?.match(/^Basic\s+(\S+)$/i);
  if (!match) return false;
  const credentials = Buffer.from(match[1], "base64").toString("utf8");
  const colon = credentials.indexOf(":");
  if (colon === -1) return false;
  // Everything after the first colon is the password, so passwords may contain colons.
  return sameSecret(credentials.slice(colon + 1), password);
}

function sameSecret(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}
