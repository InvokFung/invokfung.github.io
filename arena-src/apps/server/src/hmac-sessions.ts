import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SessionAuthority } from "@arena/core";

/**
 * Stateless resume tokens: `<playerId>.<base64url HMAC-SHA256(secret, playerId)>`.
 * Any replica holding the secret can verify one without a shared session store,
 * and a server restart does not log anyone out.
 */
export class HmacSessions implements SessionAuthority {
  private readonly key: Buffer;

  constructor(secret: string | null) {
    this.key = secret ? Buffer.from(secret, "utf8") : randomBytes(32);
  }

  issue(playerId: string): string {
    return `${playerId}.${this.sign(playerId)}`;
  }

  verify(token: string): string | null {
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return null;
    const playerId = token.slice(0, dot);
    if (!/^p_[a-z0-9]{6,32}$/.test(playerId)) return null;
    const given = Buffer.from(token.slice(dot + 1), "base64url");
    const expected = Buffer.from(this.sign(playerId), "base64url");
    return given.length === expected.length && timingSafeEqual(given, expected) ? playerId : null;
  }

  private sign(playerId: string): string {
    return createHmac("sha256", this.key).update(playerId).digest("base64url");
  }
}
