const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const { initializeDatabase } = require('./db');

async function run() {
  console.log('🔄 Running database migrations...');
  try {
    await initializeDatabase();
    console.log('✅ Migrations completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

run();

