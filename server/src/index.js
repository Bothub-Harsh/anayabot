const path = require('path');
const dotenv = require('dotenv');

// Load .env from server directory first, fallback to root directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // fallback to current working directory

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { initializeDatabase, closeDatabase, getDatabaseStatus } = require('./database/db');
const { initializeBot, getBot } = require('./bot/bot');
const { initializeSocketHandlers } = require('./socket/socketManager');

// Routes
const authRoutes = require('./routes/auth');
const matchRoutes = require('./routes/matches');
const userRoutes = require('./routes/users');
const leaderboardRoutes = require('./routes/leaderboard');
const adminRoutes = require('./routes/admin');
const chatRoutes = require('./routes/chat');

const app = express();
const server = http.createServer(app);

// Enable trust proxy for Render reverse proxy & rate limiting
app.set('trust proxy', 1);

const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.WEB_APP_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174'
].filter(Boolean).map(url => url.replace(/\/$/, ''));

const corsOriginCheck = (origin, callback) => {
  // Allow requests with no origin (like mobile webviews, curl, or server-to-server)
  if (!origin) return callback(null, true);
  
  const normalized = origin.replace(/\/$/, '');
  if (
    allowedOrigins.includes(normalized) ||
    allowedOrigins.includes('*') ||
    normalized.endsWith('.onrender.com') ||
    normalized.includes('telegram.org') ||
    normalized.includes('web.telegram.org') ||
    process.env.NODE_ENV !== 'production'
  ) {
    return callback(null, true);
  }
  return callback(null, true); // Allow permissive for Telegram WebApp wrappers
};

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: corsOriginCheck,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(cors({
  origin: corsOriginCheck,
  credentials: true
}));

app.use(express.json({ limit: '10kb' }));
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Health check (reports status and DB connectivity without leaking credentials)
app.get('/health', async (req, res) => {
  const dbStatus = getDatabaseStatus();
  const isHealthy = dbStatus.status === 'connected' || !process.env.MONGODB_URI;
  res.status(isHealthy ? 200 : 503).json({ 
    status: isHealthy ? 'ok' : 'degraded',
    database: dbStatus.status,
    databaseType: dbStatus.type,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/users', userRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chat', chatRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal server error' 
  });
});

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    console.log('✅ Database connected and initialized');

    // Initialize Socket.IO handlers
    initializeSocketHandlers(io);
    console.log('✅ Socket.IO handlers initialized');

    // Initialize Telegram bot (only if token provided)
    if (process.env.TELEGRAM_BOT_TOKEN) {
      initializeBot();
      console.log('✅ Telegram bot initialized');
    } else {
      console.log('⚠️  TELEGRAM_BOT_TOKEN not set, bot disabled');
    }

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${PORT} is already in use by another process.`);
        console.error(`👉 Run this command to free port ${PORT}:`);
        console.error(`   for /f "tokens=5" %a in ('netstat -aon ^| findstr :${PORT} ^| findstr LISTENING') do taskkill /f /pid %a\n`);
        process.exit(1);
      }
      console.error('Server error:', err);
    });

    const HOST = '0.0.0.0';
    server.listen(PORT, HOST, () => {
      console.log(`🚀 Ludo Arena server running on http://${HOST}:${PORT}`);
      console.log(`🌐 Health check: http://${HOST}:${PORT}/health`);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      try {
        await closeDatabase();
      } catch (e) {
        console.warn('Error during DB close:', e.message);
      }
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });
      // Force exit after 10s if hanging
      setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000).unref();
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = { app, io };
