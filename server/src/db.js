import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set in environment / .env');
}

// TLS: hosted Postgres (Neon, Supabase, RDS) requires it; local Homebrew/Docker Postgres does not.
// Override with DATABASE_SSL=true/false. Certificates are verified against Node's CA bundle.
const isLocalDb = /@(localhost|127\.0\.0\.1|\[::1\])(:|\/)/.test(connectionString) || /^postgres(ql)?:\/\/(localhost|127\.0\.0\.1)/.test(connectionString);
const sslEnabled = process.env.DATABASE_SSL ? process.env.DATABASE_SSL === 'true' : !isLocalDb;

export const pool = new Pool({
  connectionString,
  ssl: sslEnabled ? { rejectUnauthorized: true } : false,
  max: 5,
  idleTimeoutMillis: 30_000,
});

// Log pool-level errors so they don't crash silently
pool.on('error', (err) => {
  console.error('Unexpected PG pool error:', err.message);
});

/** Quick connectivity test — returns true/false */
export async function testConnection() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    console.error('DB testConnection failed:', err.message);
    return false;
  }
}

export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
