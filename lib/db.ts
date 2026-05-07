import { Pool } from "pg";

// Neon requires SSL in production. pg will pick it up automatically
// if DATABASE_URL contains `?sslmode=require` (Neon connection strings do).
// For connection pooling on Vercel/serverless, use Neon's pooler URL:
//   DATABASE_URL=postgresql://user:pass@host-pooler.neon.tech/db?sslmode=require

const globalForPg = global as unknown as { pool: Pool };

export const pool =
  globalForPg.pool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // Limit connections in serverless environments to avoid exhausting the pool
    max: process.env.NODE_ENV === "production" ? 1 : 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

if (process.env.NODE_ENV !== "production") globalForPg.pool = pool;

export async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(32) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scores (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      score INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}
