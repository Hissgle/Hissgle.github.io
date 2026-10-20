import { neon } from '@neondatabase/serverless';
import { env } from './env';
import { SCHEMA_STATEMENTS } from './schema';

type NeonClient = ReturnType<typeof neon>;

let client: NeonClient | null = null;
let schemaReady: Promise<void> | null = null;

export function sql(): NeonClient {
  if (!client) client = neon(env.databaseUrl);
  return client;
}

export async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const statement of SCHEMA_STATEMENTS) {
        await sql().query(statement);
      }
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await ensureSchema();
  return (await sql().query(text, params)) as T[];
}

export async function one<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}