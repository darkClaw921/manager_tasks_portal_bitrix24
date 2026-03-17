import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { requireAuth, requireAdmin, isAuthError } from '@/lib/auth/guards';
import { hashPassword } from '@/lib/auth/password';
import { validatePassword } from '@/lib/auth/password-policy';

/**
 * GET /api/users/[id]
 *
 * Get a single user. Admin can view any user, regular user can only view self.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid user ID' },
        { status: 400 }
      );
    }

    // Non-admin can only view self
    if (!auth.user.isAdmin && auth.user.userId !== userId) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Access denied' },
        { status: 403 }
      );
    }

    const user = db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        isAdmin: users.isAdmin,
        language: users.language,
        timezone: users.timezone,
        digestTime: users.digestTime,
        notifyTaskAdd: users.notifyTaskAdd,
        notifyTaskUpdate: users.notifyTaskUpdate,
        notifyTaskDelete: users.notifyTaskDelete,
        notifyCommentAdd: users.notifyCommentAdd,
        notifyMention: users.notifyMention,
        notifyOverdue: users.notifyOverdue,
        notifyDigest: users.notifyDigest,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        portalCount: sql<number>`(SELECT COUNT(*) FROM portals WHERE portals.user_id = ${users.id} AND portals.is_active = 1)`,
      })
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!user) {
      return NextResponse.json(
        { error: 'NotFound', message: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: user });
  } catch (error) {
    console.error('[users/[id]] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/users/[id]
 *
 * Update a user. Admin can update any user. Regular user can update own profile fields only.
 * Body: { firstName?, lastName?, email?, language?, timezone?, digestTime?, isAdmin?,
 *         notifyTaskAdd?, notifyTaskUpdate?, notifyTaskDelete?, notifyCommentAdd?,
 *         notifyMention?, notifyOverdue?, notifyDigest?, password? }
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid user ID' },
        { status: 400 }
      );
    }

    // Non-admin can only update self
    if (!auth.user.isAdmin && auth.user.userId !== userId) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Access denied' },
        { status: 403 }
      );
    }

    // Check user exists
    const existing = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!existing) {
      return NextResponse.json(
        { error: 'NotFound', message: 'User not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    // Profile fields (any authenticated user can update own)
    if (body.firstName !== undefined) updates.firstName = body.firstName.trim();
    if (body.lastName !== undefined) updates.lastName = body.lastName.trim();
    if (body.language !== undefined) updates.language = body.language;
    if (body.timezone !== undefined) updates.timezone = body.timezone;
    if (body.digestTime !== undefined) updates.digestTime = body.digestTime;

    // Notification preferences
    if (body.notifyTaskAdd !== undefined) updates.notifyTaskAdd = body.notifyTaskAdd;
    if (body.notifyTaskUpdate !== undefined) updates.notifyTaskUpdate = body.notifyTaskUpdate;
    if (body.notifyTaskDelete !== undefined) updates.notifyTaskDelete = body.notifyTaskDelete;
    if (body.notifyCommentAdd !== undefined) updates.notifyCommentAdd = body.notifyCommentAdd;
    if (body.notifyMention !== undefined) updates.notifyMention = body.notifyMention;
    if (body.notifyOverdue !== undefined) updates.notifyOverdue = body.notifyOverdue;
    if (body.notifyDigest !== undefined) updates.notifyDigest = body.notifyDigest;

    // Admin-only fields
    if (auth.user.isAdmin) {
      if (body.email !== undefined) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(body.email)) {
          return NextResponse.json(
            { error: 'Validation', message: 'Invalid email format' },
            { status: 400 }
          );
        }
        // Check uniqueness
        const emailExists = db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, body.email.toLowerCase().trim()))
          .get();
        if (emailExists && emailExists.id !== userId) {
          return NextResponse.json(
            { error: 'Conflict', message: 'Email already in use' },
            { status: 409 }
          );
        }
        updates.email = body.email.toLowerCase().trim();
      }
      if (body.isAdmin !== undefined) updates.isAdmin = body.isAdmin;
      if (body.password) {
        const passwordCheck = validatePassword(body.password);
        if (!passwordCheck.valid) {
          return NextResponse.json(
            { error: 'Validation', message: passwordCheck.message },
            { status: 400 }
          );
        }
        updates.passwordHash = await hashPassword(body.password);
      }
    }

    // Also allow regular user to update own email
    if (!auth.user.isAdmin && body.email !== undefined && auth.user.userId === userId) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(body.email)) {
        return NextResponse.json(
          { error: 'Validation', message: 'Invalid email format' },
          { status: 400 }
        );
      }
      const emailExists = db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, body.email.toLowerCase().trim()))
        .get();
      if (emailExists && emailExists.id !== userId) {
        return NextResponse.json(
          { error: 'Conflict', message: 'Email already in use' },
          { status: 409 }
        );
      }
      updates.email = body.email.toLowerCase().trim();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'Validation', message: 'No fields to update' },
        { status: 400 }
      );
    }

    // Update timestamp
    updates.updatedAt = new Date().toISOString();

    db.update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .run();

    // Return updated user
    const updated = db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        isAdmin: users.isAdmin,
        language: users.language,
        timezone: users.timezone,
        digestTime: users.digestTime,
        notifyTaskAdd: users.notifyTaskAdd,
        notifyTaskUpdate: users.notifyTaskUpdate,
        notifyTaskDelete: users.notifyTaskDelete,
        notifyCommentAdd: users.notifyCommentAdd,
        notifyMention: users.notifyMention,
        notifyOverdue: users.notifyOverdue,
        notifyDigest: users.notifyDigest,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .get();

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[users/[id]] PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to update user' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/users/[id]
 *
 * Delete a user. Admin only. Cannot delete self.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid user ID' },
        { status: 400 }
      );
    }

    // Cannot delete yourself
    if (auth.user.userId === userId) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Cannot delete your own account' },
        { status: 403 }
      );
    }

    // Check user exists
    const existing = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!existing) {
      return NextResponse.json(
        { error: 'NotFound', message: 'User not found' },
        { status: 404 }
      );
    }

    // Delete user (cascades to portals, tasks, notifications, etc.)
    db.delete(users).where(eq(users.id, userId)).run();

    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('[users/[id]] DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
