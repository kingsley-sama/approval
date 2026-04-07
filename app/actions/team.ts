'use server'

import { db } from '@/lib/db/drizzle'
import { users } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth/require-user'
import { asc } from 'drizzle-orm'

export async function getTeamMembers() {
  await requireAdmin()

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.createdAt))

  return rows
}
