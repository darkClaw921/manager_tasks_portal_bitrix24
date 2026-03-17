import { SignJWT, jwtVerify } from 'jose';

export interface JWTPayload {
  userId: number;
  email: string;
  isAdmin: boolean;
}

const DEV_FALLBACK_SECRET = 'default-dev-secret-change-in-production';

/**
 * Get JWT secret with environment-aware enforcement.
 * - Production: throws if JWT_SECRET is not set
 * - Development: warns and uses fallback
 */
export function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'JWT_SECRET environment variable is required in production. ' +
        'Set a strong random secret (at least 32 characters) in your environment.'
      );
    }

    console.warn(
      '[auth] WARNING: JWT_SECRET is not set. Using insecure default secret. ' +
      'This is acceptable for development but MUST be set in production.'
    );
    return new TextEncoder().encode(DEV_FALLBACK_SECRET);
  }

  return new TextEncoder().encode(secret);
}

const JWT_SECRET = getJwtSecret();

const JWT_EXPIRY = '7d'; // 7 days
const JWT_ISSUER = 'taskhub';
const JWT_AUDIENCE = 'taskhub-users';

/**
 * Sign a JWT token with user payload
 */
export async function signToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(JWT_EXPIRY)
    .sign(JWT_SECRET);
}

/**
 * Verify and decode a JWT token
 * Returns the payload or null if invalid/expired
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    return {
      userId: payload.userId as number,
      email: payload.email as string,
      isAdmin: payload.isAdmin as boolean,
    };
  } catch {
    return null;
  }
}
