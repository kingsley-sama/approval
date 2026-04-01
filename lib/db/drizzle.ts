import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is not set');
}

// Singleton to prevent exhausting the Supabase session-mode connection pool
// on hot-reloads in development.
const globalForDb = global as unknown as {
  client: ReturnType<typeof postgres>;
  db: ReturnType<typeof drizzle>;
};

if (!globalForDb.client) {
  globalForDb.client = postgres(process.env.POSTGRES_URL, { max: 3 });
  globalForDb.db = drizzle(globalForDb.client, { schema });
}

export const client = globalForDb.client;
export const db = globalForDb.db;
