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

    CREATE TABLE IF NOT EXISTS blocked_devices (
      id SERIAL PRIMARY KEY,
      device_id VARCHAR(64),
      ip VARCHAR(64),
      reason VARCHAR(256),
      blocked_by VARCHAR(32),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS profiles (
      neon_auth_user_id VARCHAR(128) PRIMARY KEY,
      username VARCHAR(32) UNIQUE NOT NULL,
      character VARCHAR(16) DEFAULT 'pig',
      pig_color VARCHAR(16) DEFAULT 'pink',
      is_admin BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS profile_scores (
      id SERIAL PRIMARY KEY,
      profile_id VARCHAR(128) REFERENCES profiles(neon_auth_user_id) ON DELETE CASCADE,
      score INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  // Safe migrations — columns added only if missing
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(256);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS character VARCHAR(16) DEFAULT 'pig';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pig_color VARCHAR(16) DEFAULT 'pink';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_device_id VARCHAR(64);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_ip VARCHAR(64);
  `);
}
