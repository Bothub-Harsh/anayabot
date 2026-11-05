const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const { Client } = require('pg');
const { initializeDatabase } = require('./db');

async function setup() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.log('❌ DATABASE_URL is not set in your .env file.');
    console.log('👉 Please set DATABASE_URL=postgresql://USERNAME:PASSWORD@localhost:5432/ludo_arena');
    process.exit(1);
  }

  console.log('🔄 Checking PostgreSQL connection...');
  
  // Parse target database
  const url = new URL(connectionString);
  const targetDb = url.pathname.replace(/^\//, '') || 'ludo_arena';
  
  // Connect to postgres default database first to ensure server is reachable and create targetDb if needed
  url.pathname = '/postgres';
  const rootClient = new Client({ connectionString: url.toString() });

  try {
    await rootClient.connect();
    console.log('✅ Connected to PostgreSQL server.');

    // Check if target database exists
    const checkDb = await rootClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [targetDb]
    );

    if (checkDb.rows.length === 0) {
      console.log(`📦 Database "${targetDb}" does not exist. Creating it now...`);
      await rootClient.query(`CREATE DATABASE "${targetDb}"`);
      console.log(`✅ Database "${targetDb}" created successfully!`);
    } else {
      console.log(`✅ Database "${targetDb}" exists.`);
    }

    await rootClient.end();
  } catch (err) {
    console.warn(`⚠️ Could not auto-check postgres root database (${err.message}). Attempting direct connection to ${targetDb}...`);
    try { await rootClient.end(); } catch (e) {}
  }

  // Now run migrations on target database
  console.log('🔄 Running database migrations on', targetDb, '...');
  try {
    await initializeDatabase();
    console.log('🎉 PostgreSQL setup and migrations completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

setup();

