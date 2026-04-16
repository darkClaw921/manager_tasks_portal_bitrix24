import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, portals } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { requireAdmin, isAuthError } from '@/lib/auth/guards';
import { hashPassword } from '@/lib/auth/password';
import { validatePassword } from '@/lib/auth/password-policy';
import { getLocalPortalId } from '@/lib/portals/local';
import { grantPortalAccess } from '@/lib/portals/access';
import { createMapping } from '@/lib/portals/mappings';

/**
 * GET /api/users
 *
 * List all users with portal counts. Admin only.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (isAuthError(auth)) return auth;

    const userRows = db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        isAdmin: users.isAdmin,
        language: users.language,
        timezone: users.timezone,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        portalCount: sql<number>`(SELECT COUNT(*) FROM portals WHERE portals.user_id = ${users.id} AND portals.is_active = 1)`,
      })
      .from(users)
      .orderBy(users.createdAt)
      .all();

    return NextResponse.json({ data: userRows });
  } catch (error) {
    console.error('[users] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/users
 *
 * Create a new user. Admin only.
 * Body: { email, password, firstName, lastName, isAdmin? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (isAuthError(auth)) return auth;

    const body = await request.json();
    const { email, password, firstName, lastName, isAdmin } = body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json(
        { error: 'Validation', message: 'Email, password, first name, and last name are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate password policy
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      return NextResponse.json(
        { error: 'Validation', message: passwordCheck.message },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existing = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .get();

    if (existing) {
      return NextResponse.json(
        { error: 'Conflict', message: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Insert user
    const result = db
      .insert(users)
      .values({
        email: email.toLowerCase().trim(),
        passwordHash,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        isAdmin: isAdmin === true,
      })
      .run();

    const userId = Number(result.lastInsertRowid);

    // Auto-grant local portal access + create bitrix mapping for the new user.
    // Failures here must NOT block user creation (user is already committed).
    try {
      const localPortalId = await getLocalPortalId();
      if (localPortalId !== null) {
        try {
          grantPortalAccess(userId, localPortalId, {
            role: 'viewer',
            permissions: {
              canSeeAll: false,
              canSeeResponsible: true,
              canSeeCreator: true,
              canSeeAccomplice: true,
              canSeeAuditor: true,
            },
          });
        } catch (accessError) {
          console.error(
            `[users] Failed to grant local portal access to user ${userId}:`,
            accessError
          );
        }

        try {
          createMapping(userId, localPortalId, String(userId));
        } catch (mappingError) {
          // Ignore UNIQUE constraint (mapping might already exist on retry);
          // log everything else.
          if (
            mappingError instanceof Error &&
            mappingError.message.includes('UNIQUE constraint')
          ) {
            console.log(
              `[users] Local portal mapping already exists for user ${userId}.`
            );
          } else {
            console.error(
              `[users] Failed to create local portal mapping for user ${userId}:`,
              mappingError
            );
          }
        }
      } else {
        console.warn(
          `[users] Local portal not seeded — skipping auto-grant for user ${userId}.`
        );
      }
    } catch (provisionError) {
      console.error(
        `[users] Local portal provisioning failed for user ${userId}:`,
        provisionError
      );
    }

    // Return created user (without password hash)
    const newUser = db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        isAdmin: users.isAdmin,
        language: users.language,
        timezone: users.timezone,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .get();

    return NextResponse.json({ data: newUser }, { status: 201 });
  } catch (error) {
    console.error('[users] POST error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to create user' },
      { status: 500 }
    );
  }
}
