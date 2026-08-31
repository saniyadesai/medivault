import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set in environment / .env');
}

export const pool = new Pool({
  connectionString,
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
