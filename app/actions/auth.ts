'use server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { users, type NewUser } from '@/lib/db/schema';
import { comparePasswords, hashPassword, setSession, getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { validatedAction } from '@/lib/auth/middleware';
import { cookies } from 'next/headers';

function toAuthDbErrorMessage(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error);

  if (/relation\s+"?users"?\s+does not exist/i.test(rawMessage)) {
    return 'Authentication database is not initialized (missing users table). Run the SQL migration for users and try again.';
  }

  if (/password authentication failed|does not exist|ENOTFOUND|ECONNREFUSED|timeout/i.test(rawMessage)) {
    return 'Unable to connect to the authentication database right now. Please check POSTGRES_URL and try again.';
  }

  return 'Authentication service is temporarily unavailable. Please try again.';
}

// ---------------------------------------------------------------------------
// Sign In
// ---------------------------------------------------------------------------
const signInSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(100),
});

export const signIn = validatedAction(signInSchema, async (data) => {
  const { email, password } = data;

  let result: Array<typeof users.$inferSelect> = [];
  try {
    result = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
  } catch (error) {
    return { error: toAuthDbErrorMessage(error), email };
  }

  if (result.length === 0) {
    return { error: 'Invalid email or password. Please try again.', email };
  }

  const foundUser = result[0];
  const isPasswordValid = await comparePasswords(password, foundUser.passwordHash);

  if (!isPasswordValid) {
    return { error: 'Invalid email or password. Please try again.', email };
  }

  await setSession(foundUser);
  redirect('/');
});

// ---------------------------------------------------------------------------
// Sign Up
// ---------------------------------------------------------------------------
const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100).optional(),
});

export const signUp = validatedAction(signUpSchema, async (data) => {
  const { email, password, name } = data;

  let existing: Array<typeof users.$inferSelect> = [];
  try {
    existing = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
  } catch (error) {
    return { error: toAuthDbErrorMessage(error), email };
  }

  if (existing.length > 0) {
    return { error: 'An account with this email already exists.', email };
  }

  const passwordHash = await hashPassword(password);

  const newUser: NewUser = {
    email,
    passwordHash,
    name: name || null,
    role: 'member',
  };

  let createdUser: typeof users.$inferSelect | undefined;
  try {
    const inserted = await db.insert(users).values(newUser).returning();
    createdUser = inserted[0];
  } catch (error) {
    return { error: toAuthDbErrorMessage(error), email };
  }

  if (!createdUser) {
    return { error: 'Failed to create account. Please try again.', email };
  }

  await setSession(createdUser);
  redirect('/');
});

// ---------------------------------------------------------------------------
// Sign Out
// ---------------------------------------------------------------------------
export async function signOut() {
  (await cookies()).delete('session');
  redirect('/');
}

// ---------------------------------------------------------------------------
// Get Current User
// ---------------------------------------------------------------------------
export async function getUser(): Promise<typeof users.$inferSelect | null> {
  const session = await getSession();
  if (!session) return null;

  try {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    return result[0] ?? null;
  } catch {
    return null;
  }
}