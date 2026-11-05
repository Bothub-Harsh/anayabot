const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const models = require('../models');

let isConnected = false;
let useMemoryStore = false;

// In-memory data store for local dev/testing when MONGODB_URI is not configured
const memoryStore = {
  users: new Map(),
  groups: new Map(),
  matches: new Map(),
  game_states: new Map(),
  game_moves: [],
  spectators: new Map(), // key: matchId:userId
  comments: [],
  reports: [],
  group_announcements: []
};

/**
 * Connect to MongoDB Atlas
 */
async function initializeDatabase() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️ WARNING: MONGODB_URI is not set in production! Configure MONGODB_URI in Render dashboard.');
    } else {
      console.log('ℹ️ MONGODB_URI not set — activating high-speed in-memory database store for local dev');
    }
    useMemoryStore = true;
    return;
  }

  // Mask password for secure logging
  const sanitizedUri = uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
  console.log(`🔄 Connecting to MongoDB: ${sanitizedUri}`);

  try {
    await mongoose.connect(uri, {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      autoIndex: process.env.NODE_ENV !== 'production'
    });

    isConnected = true;
    useMemoryStore = false;
    console.log('✅ Connected to MongoDB Atlas successfully');
  } catch (err) {
    console.error(`❌ MongoDB connection failed: ${err.message}`);
    if (process.env.NODE_ENV === 'production') {
      throw err;
    }
    console.warn('⚠️ Falling back to in-memory store for local dev.');
    useMemoryStore = true;
  }
}

mongoose.connection.on('connected', () => {
  isConnected = true;
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB error:', err.message);
  isConnected = false;
});

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  console.warn('⚠️ MongoDB disconnected.');
});

async function closeDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    console.log('🛑 MongoDB connection closed cleanly');
  }
}

function isDBConnected() {
  return isConnected || useMemoryStore;
}

function getDatabaseStatus() {
  const state = mongoose.connection.readyState;
  if (state === 1) return { status: 'connected', type: 'mongodb-atlas' };
  if (useMemoryStore) return { status: 'connected', type: 'in-memory-dev' };
  return { status: 'disconnected', type: 'none' };
}

// =============================================================================
// UNIFIED DATA ACCESS LAYER (MongoDB Atlas with In-Memory Dev Fallback)
// =============================================================================

// --- USERS ---
async function findUserByTelegramId(telegramId) {
  if (isConnected) {
    const user = await models.User.findOne({ telegram_id: Number(telegramId) });
    return user ? user.toObject() : null;
  }
  const u = Array.from(memoryStore.users.values()).find(x => String(x.telegram_id) === String(telegramId));
  return u ? { ...u } : null;
}

async function findUserById(userId) {
  if (isConnected) {
    const user = await models.User.findById(userId);
    return user ? user.toObject() : null;
  }
  const u = memoryStore.users.get(userId);
  return u ? { ...u } : null;
}

async function createOrUpdateUser(telegramUser, isAdmin = false) {
  if (isConnected) {
    let user = await models.User.findOne({ telegram_id: Number(telegramUser.id) });
    if (user) {
      if (telegramUser.username !== undefined) user.username = telegramUser.username || null;
      if (telegramUser.first_name) user.first_name = telegramUser.first_name;
      if (telegramUser.last_name !== undefined) user.last_name = telegramUser.last_name || null;
      if (telegramUser.photo_url !== undefined) user.photo_url = telegramUser.photo_url || null;
      user.is_admin = isAdmin;
      user.last_seen_at = new Date();
      await user.save();
      return user.toObject();
    }

    user = await models.User.create({
      telegram_id: Number(telegramUser.id),
      username: telegramUser.username || null,
      first_name: telegramUser.first_name || 'Player',
      last_name: telegramUser.last_name || null,
      photo_url: telegramUser.photo_url || null,
      language_code: telegramUser.language_code || 'en',
      is_admin: isAdmin,
      last_seen_at: new Date()
    });
    return user.toObject();
  }

  // Memory fallback
  let existing = Array.from(memoryStore.users.values()).find(x => String(x.telegram_id) === String(telegramUser.id));
  if (existing) {
    existing.username = telegramUser.username || existing.username;
    existing.first_name = telegramUser.first_name || existing.first_name;
    existing.last_name = telegramUser.last_name || existing.last_name;
    existing.photo_url = telegramUser.photo_url || existing.photo_url;
    existing.is_admin = isAdmin;
    existing.last_seen_at = new Date().toISOString();
    return { ...existing };
  }

  const id = uuidv4();
  const newUser = {
    _id: id,
    id,
    telegram_id: Number(telegramUser.id),
    username: telegramUser.username || null,
    first_name: telegramUser.first_name || 'Player',
    last_name: telegramUser.last_name || null,
    photo_url: telegramUser.photo_url || null,
    language_code: telegramUser.language_code || 'en',
    is_admin: isAdmin,
    is_banned: false,
    ban_reason: null,
    total_matches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    win_streak: 0,
    best_win_streak: 0,
    total_xp: 0,
    level: 1,
    last_seen_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  memoryStore.users.set(id, newUser);
  return { ...newUser };
}

async function updateUserStats(userId, { winsDelta = 0, lossesDelta = 0, xpDelta = 0 }) {
  if (isConnected) {
    const user = await models.User.findById(userId);
    if (!user) return null;

    user.total_matches += 1;
    user.wins += winsDelta;
    user.losses += lossesDelta;
    user.win_streak = winsDelta === 1 ? user.win_streak + 1 : 0;
    user.best_win_streak = Math.max(user.best_win_streak, user.win_streak);
    user.total_xp += xpDelta;
    user.level = Math.max(1, Math.floor(user.total_xp / 1000) + 1);
    await user.save();
    return user.toObject();
  }

  const u = memoryStore.users.get(userId);
  if (u) {
    u.total_matches += 1;
    u.wins += winsDelta;
    u.losses += lossesDelta;
    u.win_streak = winsDelta === 1 ? u.win_streak + 1 : 0;
    u.best_win_streak = Math.max(u.best_win_streak, u.win_streak);
    u.total_xp += xpDelta;
    u.level = Math.max(1, Math.floor(u.total_xp / 1000) + 1);
    u.updated_at = new Date().toISOString();
    return { ...u };
  }
  return null;
}

async function getLeaderboardUsers({ limit = 50, offset = 0, period = 'all' } = {}) {
  if (isConnected) {
    const filter = { is_banned: false, total_matches: { $gt: 0 } };
    if (period === 'weekly') {
      filter.updated_at = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
    } else if (period === 'monthly') {
      filter.updated_at = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    }

    const [users, total] = await Promise.all([
      models.User.find(filter)
        .sort({ wins: -1, total_xp: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      models.User.countDocuments(filter)
    ]);

    const leaderboard = users.map((u, idx) => ({
      rank: offset + idx + 1,
      id: u._id,
      username: u.username,
      first_name: u.first_name,
      last_name: u.last_name,
      photo_url: u.photo_url,
      total_matches: u.total_matches,
      wins: u.wins,
      losses: u.losses,
      win_streak: u.win_streak,
      best_win_streak: u.best_win_streak,
      total_xp: u.total_xp,
      level: u.level,
      win_rate: u.total_matches > 0 ? Number(((u.wins / u.total_matches) * 100).toFixed(1)) : 0
    }));

    return { leaderboard, total };
  }

  // Memory fallback
  let arr = Array.from(memoryStore.users.values()).filter(u => !u.is_banned && u.total_matches > 0);
  arr.sort((a, b) => (b.wins - a.wins) || (b.total_xp - a.total_xp));
  const total = arr.length;
  const paged = arr.slice(offset, offset + limit);
  const leaderboard = paged.map((u, idx) => ({
    rank: offset + idx + 1,
    id: u.id,
    username: u.username,
    first_name: u.first_name,
    last_name: u.last_name,
    photo_url: u.photo_url,
    total_matches: u.total_matches,
    wins: u.wins,
    losses: u.losses,
    win_streak: u.win_streak,
    best_win_streak: u.best_win_streak,
    total_xp: u.total_xp,
    level: u.level,
    win_rate: u.total_matches > 0 ? Number(((u.wins / u.total_matches) * 100).toFixed(1)) : 0
  }));
  return { leaderboard, total };
}

// --- MATCHES ---
async function findMatchById(matchId) {
  if (isConnected) {
    const match = await models.Match.findById(matchId).lean();
    if (!match) return null;
    return { ...match, id: match._id };
  }
  const m = memoryStore.matches.get(matchId);
  return m ? JSON.parse(JSON.stringify(m)) : null;
}

async function findMatchByRoomCode(roomCode) {
  if (!roomCode) return null;
  const code = roomCode.toUpperCase().trim();
  if (isConnected) {
    const match = await models.Match.findOne({ room_code: code }).lean();
    if (!match) return null;
    return { ...match, id: match._id };
  }
  const m = Array.from(memoryStore.matches.values()).find(x => x.room_code === code);
  return m ? JSON.parse(JSON.stringify(m)) : null;
}

async function createMatchDoc(matchData) {
  const id = uuidv4();
  if (isConnected) {
    const match = await models.Match.create({
      _id: id,
      ...matchData
    });
    return { ...match.toObject(), id };
  }

  const newMatch = {
    _id: id,
    id,
    status: 'waiting',
    current_players: matchData.players?.length || 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...matchData
  };
  memoryStore.matches.set(id, newMatch);
  return JSON.parse(JSON.stringify(newMatch));
}

async function updateMatchDoc(matchId, updateData) {
  if (isConnected) {
    const match = await models.Match.findByIdAndUpdate(matchId, updateData, { new: true }).lean();
    if (!match) return null;
    return { ...match, id: match._id };
  }

  const m = memoryStore.matches.get(matchId);
  if (!m) return null;
  Object.assign(m, updateData, { updated_at: new Date().toISOString() });
  return JSON.parse(JSON.stringify(m));
}

async function findPublicMatches() {
  if (isConnected) {
    const matches = await models.Match.find({
      status: { $in: ['waiting', 'playing'] },
      visibility: 'public'
    })
    .sort({ created_at: -1 })
    .limit(20)
    .lean();
    return matches.map(m => ({ ...m, id: m._id }));
  }

  return Array.from(memoryStore.matches.values())
    .filter(m => (m.status === 'waiting' || m.status === 'playing') && m.visibility === 'public')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 20)
    .map(m => JSON.parse(JSON.stringify(m)));
}

async function findWaitingMatchByGroup(groupId) {
  if (!groupId) return null;
  const gId = String(groupId);
  if (isConnected) {
    const match = await models.Match.findOne({
      telegram_group_id: gId,
      status: 'waiting'
    })
    .sort({ created_at: -1 })
    .lean();
    return match ? { ...match, id: match._id } : null;
  }

  const matches = Array.from(memoryStore.matches.values())
    .filter(m => String(m.telegram_group_id) === gId && m.status === 'waiting')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return matches[0] ? JSON.parse(JSON.stringify(matches[0])) : null;
}

async function findActiveMatchesByGroup(groupId) {
  if (!groupId) return [];
  const gId = String(groupId);
  if (isConnected) {
    const matches = await models.Match.find({
      telegram_group_id: gId,
      status: { $in: ['waiting', 'playing'] }
    })
    .sort({ created_at: -1 })
    .lean();
    return matches.map(m => ({ ...m, id: m._id }));
  }

  return Array.from(memoryStore.matches.values())
    .filter(m => String(m.telegram_group_id) === gId && (m.status === 'waiting' || m.status === 'playing'))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map(m => JSON.parse(JSON.stringify(m)));
}

// --- GAME STATE ---
async function findGameState(matchId) {
  if (isConnected) {
    const gs = await models.GameState.findById(matchId).lean();
    if (!gs) return null;
    return {
      phase: gs.phase,
      currentPlayerIndex: gs.current_player_index,
      turnNumber: gs.turn_number,
      boardState: gs.board_state,
      diceValue: gs.dice_value,
      diceRolled: gs.dice_rolled,
      consecutiveSixes: gs.consecutive_sixes,
      lastAction: gs.last_action,
      winners: gs.winners || []
    };
  }

  const gs = memoryStore.game_states.get(matchId);
  return gs ? JSON.parse(JSON.stringify(gs)) : null;
}

async function saveGameStateDoc(matchId, gameState) {
  if (isConnected) {
    await models.GameState.findByIdAndUpdate(
      matchId,
      {
        _id: matchId,
        match_id: matchId,
        current_player_index: gameState.currentPlayerIndex,
        turn_number: gameState.turnNumber,
        phase: gameState.phase,
        board_state: gameState.boardState,
        dice_value: gameState.diceValue,
        dice_rolled: gameState.diceRolled,
        consecutive_sixes: gameState.consecutiveSixes || 0,
        last_action: gameState.lastAction,
        winners: gameState.winners || []
      },
      { upsert: true, new: true }
    );
    return;
  }

  memoryStore.game_states.set(matchId, {
    match_id: matchId,
    current_player_index: gameState.currentPlayerIndex,
    turn_number: gameState.turnNumber,
    phase: gameState.phase,
    board_state: gameState.boardState,
    dice_value: gameState.diceValue,
    dice_rolled: gameState.diceRolled,
    consecutive_sixes: gameState.consecutiveSixes || 0,
    last_action: gameState.lastAction,
    winners: gameState.winners || []
  });
}

// --- GAME MOVES ---
async function createGameMove(moveData) {
  const id = uuidv4();
  if (isConnected) {
    await models.GameMove.create({
      _id: id,
      ...moveData
    });
    return;
  }
  memoryStore.game_moves.push({ id, ...moveData, created_at: new Date().toISOString() });
}

async function findGameMoves(matchId) {
  if (isConnected) {
    return await models.GameMove.find({ match_id: matchId }).sort({ created_at: 1 }).lean();
  }
  return memoryStore.game_moves.filter(m => m.match_id === matchId);
}

// --- SPECTATORS ---
async function addSpectator(matchId, userId) {
  const id = `${matchId}:${userId}`;
  if (isConnected) {
    await models.Spectator.findOneAndUpdate(
      { match_id: matchId, user_id: userId },
      { _id: uuidv4(), match_id: matchId, user_id: userId, joined_at: new Date() },
      { upsert: true }
    );
    return;
  }
  memoryStore.spectators.set(id, { matchId, userId, joined_at: new Date().toISOString() });
}

async function removeSpectator(matchId, userId) {
  const id = `${matchId}:${userId}`;
  if (isConnected) {
    await models.Spectator.deleteOne({ match_id: matchId, user_id: userId });
    return;
  }
  memoryStore.spectators.delete(id);
}

async function countSpectators(matchId) {
  if (isConnected) {
    return await models.Spectator.countDocuments({ match_id: matchId });
  }
  return Array.from(memoryStore.spectators.values()).filter(s => s.matchId === matchId).length;
}

// --- COMMENTS & REACTIONS ---
async function addComment(commentData) {
  const id = uuidv4();
  if (isConnected) {
    const doc = await models.Comment.create({
      _id: id,
      ...commentData
    });
    return { ...doc.toObject(), id };
  }

  const comment = {
    _id: id,
    id,
    reactions: [],
    created_at: new Date().toISOString(),
    ...commentData
  };
  memoryStore.comments.push(comment);
  return { ...comment };
}

async function findComments(matchId, { limit = 50, before = null } = {}) {
  if (isConnected) {
    const filter = { match_id: matchId, is_deleted: false };
    if (before) {
      filter.created_at = { $lt: new Date(before) };
    }
    const list = await models.Comment.find(filter)
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();
    return list.reverse().map(c => ({ ...c, id: c._id }));
  }

  let list = memoryStore.comments.filter(c => c.match_id === matchId && !c.is_deleted);
  if (before) {
    list = list.filter(c => new Date(c.created_at) < new Date(before));
  }
  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return list.slice(0, limit).reverse();
}

async function addReaction(commentId, userId, emoji) {
  if (isConnected) {
    const comment = await models.Comment.findById(commentId);
    if (!comment) return null;
    comment.reactions = comment.reactions.filter(r => !(r.userId === userId && r.emoji === emoji));
    comment.reactions.push({ userId, emoji });
    await comment.save();
    return comment.toObject();
  }

  const c = memoryStore.comments.find(x => x.id === commentId || x._id === commentId);
  if (c) {
    c.reactions = (c.reactions || []).filter(r => !(r.userId === userId && r.emoji === emoji));
    c.reactions.push({ userId, emoji });
    return { ...c };
  }
  return null;
}

// --- GROUPS ---
async function findGroup(telegramId) {
  if (isConnected) {
    const g = await models.Group.findOne({ telegram_id: Number(telegramId) }).lean();
    return g ? { ...g, id: g._id } : null;
  }
  const g = Array.from(memoryStore.groups.values()).find(x => String(x.telegram_id) === String(telegramId));
  return g ? { ...g } : null;
}

async function upsertGroup(telegramId, { title, type, settings } = {}) {
  if (isConnected) {
    const g = await models.Group.findOneAndUpdate(
      { telegram_id: Number(telegramId) },
      {
        telegram_id: Number(telegramId),
        title: title || '',
        type: type || 'group',
        ...(settings ? { settings } : {})
      },
      { upsert: true, new: true }
    ).lean();
    return { ...g, id: g._id };
  }

  let g = Array.from(memoryStore.groups.values()).find(x => String(x.telegram_id) === String(telegramId));
  if (g) {
    if (title) g.title = title;
    if (type) g.type = type;
    if (settings) g.settings = settings;
    return { ...g };
  }

  const id = uuidv4();
  g = {
    _id: id,
    id,
    telegram_id: Number(telegramId),
    title: title || '',
    type: type || 'group',
    settings: settings || { allowGameCreation: true, maxPlayers: 4 },
    created_at: new Date().toISOString()
  };
  memoryStore.groups.set(id, g);
  return { ...g };
}

// --- ADMIN STATS ---
async function getAdminStats() {
  if (isConnected) {
    const [totalUsers, totalMatches, activeMatches, pendingReports] = await Promise.all([
      models.User.countDocuments({ is_banned: false }),
      models.Match.countDocuments(),
      models.Match.countDocuments({ status: { $in: ['waiting', 'playing'] } }),
      models.Report.countDocuments({ status: 'pending' })
    ]);
    return { totalUsers, totalMatches, activeMatches, pendingReports };
  }

  return {
    totalUsers: Array.from(memoryStore.users.values()).filter(u => !u.is_banned).length,
    totalMatches: memoryStore.matches.size,
    activeMatches: Array.from(memoryStore.matches.values()).filter(m => m.status === 'waiting' || m.status === 'playing').length,
    pendingReports: memoryStore.reports.filter(r => r.status === 'pending').length
  };
}

module.exports = {
  // Connection management
  initializeDatabase,
  closeDatabase,
  isDBConnected,
  getDatabaseStatus,
  models,

  // User operations
  findUserByTelegramId,
  findUserById,
  createOrUpdateUser,
  updateUserStats,
  getLeaderboardUsers,

  // Match operations
  findMatchById,
  findMatchByRoomCode,
  createMatchDoc,
  updateMatchDoc,
  findPublicMatches,
  findWaitingMatchByGroup,
  findActiveMatchesByGroup,

  // Game state & moves
  findGameState,
  saveGameStateDoc,
  createGameMove,
  findGameMoves,

  // Spectators
  addSpectator,
  removeSpectator,
  countSpectators,

  // Comments
  addComment,
  findComments,
  addReaction,

  // Groups
  findGroup,
  upsertGroup,

  // Admin
  getAdminStats,

  // Direct access for testing
  memoryStore
};
