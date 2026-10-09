import 'dotenv/config';
import pg from 'pg';
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL});
await pool.query(`
CREATE TABLE IF NOT EXISTS users (
 id SERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 subscription_status TEXT NOT NULL DEFAULT 'free', stripe_customer_id TEXT UNIQUE,
 stripe_subscription_id TEXT UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS proposals (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 client TEXT NOT NULL, service TEXT NOT NULL, price NUMERIC NOT NULL,
 current_cost NUMERIC NOT NULL, expected_savings NUMERIC NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposals_user_id_idx ON proposals(user_id);
`);
await pool.end();
console.log('Database initialized');
