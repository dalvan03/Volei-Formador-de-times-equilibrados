import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL || 'postgres://postgres:postgrespassword@localhost:5432/voleidb';

// Client for queries
export const client = postgres(connectionString, { max: 10 });
export const db = drizzle(client, { schema });
