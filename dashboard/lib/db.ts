import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql:///health_sync",
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  // Serverless: many lambda instances share the NUC, keep each one's pool small
  max: 5,
  keepAlive: true,
});

export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export default pool;
