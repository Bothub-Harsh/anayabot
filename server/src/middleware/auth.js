const crypto = require('crypto');
const { createOrUpdateUser } = require('../database/db');

/**
 * Verify Telegram WebApp initData
 * This is the ONLY trusted way to authenticate Telegram users
 */
function verifyTelegramInitData(initData) {
  if (!initData) return null;

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return null;

    urlParams.delete('hash');
    
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(process.env.TELEGRAM_BOT_TOKEN || '')
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (expectedHash !== hash) return null;

    // Check expiry (1 hour)
    const authDate = parseInt(urlParams.get('auth_date') || '0');
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 3600) return null;

    const userParam = urlParams.get('user');
    if (!userParam) return null;

    return JSON.parse(userParam);
  } catch (error) {
    console.error('InitData verification error:', error);
    return null;
  }
}

function isConfiguredAdmin(telegramId) {
  const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
  return adminIds.includes(String(telegramId));
}

async function findOrCreateUser(telegramUser) {
  try {
    const isAdmin = isConfiguredAdmin(telegramUser.id);
    const user = await createOrUpdateUser(telegramUser, isAdmin);
    return user;
  } catch (error) {
    console.error('Find or create user error:', error);
    throw error;
  }
}

async function requireAuth(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development' || !process.env.TELEGRAM_BOT_TOKEN;

  // Handle browser guest access or dev bypass (allows web browser preview / testing outside Telegram)
  const isGuest = !initData || initData === 'dev_bypass' || initData.startsWith('browser_guest') || !process.env.TELEGRAM_BOT_TOKEN;

  if (isGuest) {
    const guestSuffix = (initData && initData.startsWith('browser_guest:'))
      ? initData.split(':')[1]
      : 'guest';

    // Hash suffix into a stable numeric ID
    const numericGuestId = Math.abs(
      guestSuffix.split('').reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0), 0)
    ) % 900000000 + 100000000;

    req.telegramUser = {
      id: numericGuestId,
      first_name: 'Guest Player',
      username: `guest_${guestSuffix.slice(-4)}`,
      language_code: 'en',
      is_guest: true
    };

    try {
      const user = await findOrCreateUser(req.telegramUser);
      req.user = user;
      return next();
    } catch (err) {
      console.error('Guest auth fallback error:', err);
      return res.status(500).json({ error: 'Auth failed' });
    }
  }

  // Authoritative Telegram Mini App verification
  const telegramUser = verifyTelegramInitData(initData);
  if (!telegramUser) {
    return res.status(401).json({ error: 'Invalid Telegram authentication' });
  }

  if (telegramUser.is_bot) {
    return res.status(403).json({ error: 'Bots are not allowed' });
  }

  try {
    const user = await findOrCreateUser(telegramUser);
    
    if (user.is_banned) {
      return res.status(403).json({ 
        error: 'Your account has been banned',
        reason: user.ban_reason 
      });
    }

    req.telegramUser = telegramUser;
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

async function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

async function optionalAuth(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development' || !process.env.TELEGRAM_BOT_TOKEN;

  if (isDev && (!initData || initData === 'dev_bypass' || !process.env.TELEGRAM_BOT_TOKEN)) {
    try {
      req.telegramUser = { id: 123456789, first_name: 'Player', username: 'ludoplayer' };
      req.user = await findOrCreateUser(req.telegramUser);
    } catch (err) {
      req.user = null;
    }
    return next();
  }

  if (!initData) {
    req.user = null;
    return next();
  }

  try {
    const telegramUser = verifyTelegramInitData(initData);
    if (telegramUser) {
      req.user = await findOrCreateUser(telegramUser);
    }
  } catch (error) {
    // Silently continue without auth
    req.user = null;
  }
  next();
}

module.exports = { requireAuth, requireAdmin, optionalAuth, verifyTelegramInitData, findOrCreateUser };
