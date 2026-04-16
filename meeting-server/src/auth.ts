/**
 * JWT verification for the meeting worker.
 *
 * The worker accepts two kinds of tokens on its internal API (e.g. the
 * /recordings/start|stop endpoints introduced in later phases):
 *
 *   1. A TaskHub session JWT signed by the Next.js app — same secret,
 *      same issuer/audience as `src/lib/auth/jwt.ts`. This is the
 *      canonical "who is this user" check.
 *   2. (Later phases) LiveKit webhook JWTs signed with the LiveKit
 *      API secret. Those are handled separately by the webhook route.
 *
 * We verify only #1 here — #2 uses the LiveKit SDK's WebhookReceiver.
 */
import { jwtVerify } from 'jose';
import type { JWTPayload as JoseJWTPayload } from 'jose';
import { config } from './config.js';

/** Mirrors the shape emitted by `src/lib/auth/jwt.ts` in the Next.js app. */
export interface VerifiedSessionPayload {
  userId: number;
  email: string;
  isAdmin: boolean;
}

const JWT_ISSUER = 'taskhub';
const JWT_AUDIENCE = 'taskhub-users';

const secretKey = new TextEncoder().encode(config.auth.jwtSecret);

/**
 * Verify a TaskHub session JWT. Returns the typed payload on success or
 * throws a descriptive Error (signature invalid, expired, issuer/audience
 * mismatch, etc.).
 */
export async function verifyToken(token: string): Promise<VerifiedSessionPayload> {
  const { payload } = await jwtVerify(token, secretKey, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

  return assertPayloadShape(payload);
}

/** Soft variant: returns null instead of throwing — handy for optional auth. */
export async function tryVerifyToken(
  token: string,
): Promise<VerifiedSessionPayload | null> {
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

function assertPayloadShape(p: JoseJWTPayload): VerifiedSessionPayload {
  if (typeof p.userId !== 'number') {
    throw new Error('JWT payload missing numeric userId');
  }
  if (typeof p.email !== 'string') {
    throw new Error('JWT payload missing string email');
  }
  if (typeof p.isAdmin !== 'boolean') {
    throw new Error('JWT payload missing boolean isAdmin');
  }
  return {
    userId: p.userId,
    email: p.email,
    isAdmin: p.isAdmin,
  };
}

/**
 * Extract the bearer token from an "Authorization: Bearer <token>" header.
 * Returns null if the header is absent or malformed.
 */
export function extractBearer(authHeader: string | undefined | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1]!.trim() : null;
}
