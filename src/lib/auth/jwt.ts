import { SignJWT, jwtVerify } from 'jose';

export interface JWTPayload {
  userId: number;
  email: string;
  isAdmin: boolean;
}

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'default-dev-secret-change-in-production'
);

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
