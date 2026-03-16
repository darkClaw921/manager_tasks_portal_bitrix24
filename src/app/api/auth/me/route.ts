import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';

export async function GET(request: NextRequest) {
  try {
    const result = await requireAuth(request);
    if (isAuthError(result)) return result;

    const { user: authUser } = result;

    // Get full user data from DB
    const user = db
      .select()
      .from(users)
      .where(eq(users.id, authUser.userId))
      .get();

    if (!user) {
      return NextResponse.json(
        { error: 'NotFound', message: 'Пользователь не найден' },
        { status: 404 }
      );
    }

    // Return user without password hash
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _hash, ...userWithoutPassword } = user;

    return NextResponse.json({ user: userWithoutPassword });
  } catch (error) {
    console.error('Me endpoint error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Внутренняя ошибка сервера' },
      { status: 500 }
    );
  }
}
