import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword } from '@/lib/auth/password';
import { signToken } from '@/lib/auth/jwt';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Validation', message: 'Email и пароль обязательны' },
        { status: 400 }
      );
    }

    // Find user by email
    const user = db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .get();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Неверный email или пароль' },
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Неверный email или пароль' },
        { status: 401 }
      );
    }

    // Generate JWT
    const token = await signToken({
      userId: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
    });

    // Build response with user data (without password hash)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _hash, ...userWithoutPassword } = user;

    const response = NextResponse.json({
      user: userWithoutPassword,
    });

    // Set HttpOnly cookie
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Внутренняя ошибка сервера' },
      { status: 500 }
    );
  }
}
