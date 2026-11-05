const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const { initializeDatabase, closeDatabase, models } = require('./db');

async function setup() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.log('⚠️ MONGODB_URI is not set in your .env file.');
    console.log('👉 Please set MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/ludo_arena?retryWrites=true&w=majority');
    console.log('ℹ️ Running in memoryStore dev mode for now.');
  }

  console.log('🔄 Checking MongoDB connection & ensuring schemas/indexes...');

  try {
    await initializeDatabase();
    
    // Ensure all model indexes are created if connected to MongoDB
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      for (const [modelName, model] of Object.entries(models)) {
        if (model && typeof model.createIndexes === 'function') {
          await model.createIndexes();
          console.log(`✅ Collection and indexes verified: ${modelName}`);
        }
      }
      console.log('🎉 MongoDB Atlas setup & schema initialization completed successfully!');
    } else {
      console.log('ℹ️ Running in memory dev mode. Add MONGODB_URI when ready to connect to Atlas.');
    }

    await closeDatabase();
    process.exit(0);
  } catch (err) {
    console.error('❌ MongoDB setup failed:', err.message);
    process.exit(1);
  }
}

setup();
