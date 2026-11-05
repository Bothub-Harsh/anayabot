const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

let pool = null;
let useMemoryStore = false;

// In-memory data store for local dev when PostgreSQL is not configured
const memoryStore = {
  users: new Map(),
  player_profiles: new Map(),
  matches: new Map(),
  match_players: new Map(),
  game_states: new Map(),
  game_moves: [],
  spectators: new Map(),
  comments: [],
  reactions: [],
  reports: [],
  achievements: [
    { id: uuidv4(), name: 'First Blood', description: 'Win your first match', icon: '🏆', xp_reward: 100, condition_type: 'wins', condition_value: 1 },
    { id: uuidv4(), name: 'Hat Trick', description: 'Win 3 matches in a row', icon: '🎯', xp_reward: 250, condition_type: 'win_streak', condition_value: 3 },
    { id: uuidv4(), name: 'Veteran', description: 'Play 50 matches', icon: '⭐', xp_reward: 500, condition_type: 'total_matches', condition_value: 50 },
    { id: uuidv4(), name: 'Champion', description: 'Win 25 matches', icon: '👑', xp_reward: 1000, condition_type: 'wins', condition_value: 25 },
    { id: uuidv4(), name: 'Legend', description: 'Win 100 matches', icon: '🌟', xp_reward: 5000, condition_type: 'wins', condition_value: 100 },
    { id: uuidv4(), name: 'Social Butterfly', description: 'Watch 10 live matches', icon: '👁️', xp_reward: 50, condition_type: 'spectated', condition_value: 10 }
  ],
  user_achievements: [],
  telegram_groups: new Map(),
  group_announcements: []
};

function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    const isLocalhost = /localhost|127\.0\.0\.1/i.test(process.env.DATABASE_URL);
    const requiresSsl = !isLocalhost && (
      process.env.NODE_ENV === 'production' || 
      /render\.com|sslmode=require/i.test(process.env.DATABASE_URL)
    );

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: requiresSsl ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on idle database client', err);
    });
  }
  return pool;
}

// Memory query handler covering the platform queries
function queryMemoryStore(text, params = []) {
  const sql = text.trim();
  const normalized = sql.replace(/\s+/g, ' ');

  // 1. users queries
  if (/SELECT \* FROM users WHERE telegram_id = \$1/i.test(normalized)) {
    const telegramId = params[0];
    const user = Array.from(memoryStore.users.values()).find(u => String(u.telegram_id) === String(telegramId));
    return { rows: user ? [{ ...user }] : [] };
  }

  if (/SELECT u\.\*, pp\..* FROM users u/i.test(normalized)) {
    const id = params[0];
    const user = Array.from(memoryStore.users.values()).find(u => String(u.id) === String(id) || String(u.telegram_id) === String(id));
    if (!user) return { rows: [] };
    const pp = memoryStore.player_profiles.get(user.id) || {
      total_matches: 0, wins: 0, losses: 0, draws: 0, win_streak: 0, best_win_streak: 0, total_xp: 0, level: 1
    };
    return { rows: [{ ...user, ...pp }] };
  }

  if (/INSERT INTO users/i.test(normalized)) {
    const id = uuidv4();
    const newUser = {
      id,
      telegram_id: params[0],
      username: params[1],
      first_name: params[2],
      last_name: params[3],
      photo_url: params[4],
      language_code: params[5] || 'en',
      is_admin: Boolean(params[6]),
      is_banned: false,
      ban_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    };
    memoryStore.users.set(id, newUser);
    return { rows: [{ ...newUser }] };
  }

  if (/UPDATE users SET/i.test(normalized)) {
    if (params.length >= 5) {
      const telegramId = params[0];
      const user = Array.from(memoryStore.users.values()).find(u => String(u.telegram_id) === String(telegramId));
      if (user) {
        user.username = params[1];
        user.first_name = params[2];
        user.last_name = params[3];
        user.photo_url = params[4];
        if (params.length >= 6) {
          user.is_admin = Boolean(params[5]);
        }
        user.last_seen_at = new Date().toISOString();
        return { rows: [{ ...user }] };
      }
    }
    return { rows: [] };
  }

  // 2. player_profiles queries
  if (/INSERT INTO player_profiles \(user_id\)/i.test(normalized)) {
    const userId = params[0];
    if (!memoryStore.player_profiles.has(userId)) {
      const newProf = {
        id: uuidv4(),
        user_id: userId,
        total_matches: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        win_streak: 0,
        best_win_streak: 0,
        total_xp: 0,
        level: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      memoryStore.player_profiles.set(userId, newProf);
    }
    return { rows: [] };
  }

  if (/INSERT INTO player_profiles \(user_id, total_matches, wins, losses/i.test(normalized)) {
    const userId = params[0];
    let prof = memoryStore.player_profiles.get(userId);
    if (!prof) {
      prof = {
        id: uuidv4(),
        user_id: userId,
        total_matches: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        win_streak: 0,
        best_win_streak: 0,
        total_xp: 0,
        level: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      memoryStore.player_profiles.set(userId, prof);
    }
    const winsDelta = params[1] || 0;
    const lossesDelta = params[2] || 0;
    const streakDelta = params[3] || 0;
    const xpDelta = params[4] || 0;

    prof.total_matches += 1;
    prof.wins += winsDelta;
    prof.losses += lossesDelta;
    prof.win_streak = winsDelta === 1 ? prof.win_streak + 1 : 0;
    prof.best_win_streak = Math.max(prof.best_win_streak, prof.win_streak);
    prof.total_xp += xpDelta;
    prof.level = Math.max(1, Math.floor(prof.total_xp / 1000) + 1);
    prof.updated_at = new Date().toISOString();
    return { rows: [{ ...prof }] };
  }

  // 3. matches queries
  if (/INSERT INTO matches/i.test(normalized)) {
    const id = uuidv4();
    const newMatch = {
      id,
      room_code: params[0],
      name: params[1],
      max_players: params[2],
      visibility: params[3],
      creator_id: params[4],
      settings: typeof params[5] === 'string' ? JSON.parse(params[5]) : params[5] || {},
      telegram_group_id: params[6] ? String(params[6]) : null,
      telegram_message_id: params[7] ? String(params[7]) : null,
      status: 'waiting',
      current_players: 0,
      winner_id: null,
      started_at: null,
      completed_at: null,
      cancelled_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    memoryStore.matches.set(id, newMatch);
    return { rows: [{ ...newMatch }] };
  }

  if (/UPDATE matches SET telegram_message_id =/i.test(normalized)) {
    const messageId = params[0];
    const matchId = params[1];
    const match = memoryStore.matches.get(matchId);
    if (match) {
      match.telegram_message_id = messageId ? String(messageId) : null;
      match.updated_at = new Date().toISOString();
    }
    return { rows: [] };
  }

  if (/WHERE.*telegram_group_id = \$1/i.test(normalized)) {
    const groupId = String(params[0]);
    let matches = Array.from(memoryStore.matches.values()).filter(m => String(m.telegram_group_id) === groupId);
    if (/status = 'waiting'/i.test(normalized)) {
      matches = matches.filter(m => m.status === 'waiting');
    } else if (/status IN/i.test(normalized)) {
      matches = matches.filter(m => m.status === 'waiting' || m.status === 'playing');
    }
    matches.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (/LIMIT 1/i.test(normalized)) {
      matches = matches.slice(0, 1);
    }
    return { rows: matches.map(m => ({ ...m })) };
  }

  if (/SELECT \* FROM telegram_groups WHERE telegram_id = \$1/i.test(normalized)) {
    const group = memoryStore.telegram_groups.get(String(params[0]));
    return { rows: group ? [{ ...group }] : [] };
  }

  if (/INSERT INTO telegram_groups/i.test(normalized)) {
    const telegramId = String(params[0]);
    const group = {
      id: uuidv4(),
      telegram_id: params[0],
      title: params[1] || '',
      type: params[2] || 'group',
      settings: params[3] || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    memoryStore.telegram_groups.set(telegramId, group);
    return { rows: [{ ...group }] };
  }

  if (/INSERT INTO group_announcements/i.test(normalized)) {
    const ann = {
      id: uuidv4(),
      telegram_group_id: params[0],
      match_id: params[1],
      announcement_type: params[2],
      telegram_message_id: params[3] || null,
      created_at: new Date().toISOString()
    };
    memoryStore.group_announcements.push(ann);
    return { rows: [{ ...ann }] };
  }

  if (/SELECT id FROM matches WHERE room_code = \$1/i.test(normalized)) {
    const code = params[0];
    const match = Array.from(memoryStore.matches.values()).find(m => m.room_code === code);
    return { rows: match ? [{ id: match.id }] : [] };
  }

  if (/SELECT \* FROM matches WHERE room_code = \$1/i.test(normalized)) {
    const code = params[0];
    const match = Array.from(memoryStore.matches.values()).find(m => m.room_code === code);
    return { rows: match ? [{ ...match }] : [] };
  }

  if (/SELECT \* FROM matches WHERE id = \$1/i.test(normalized)) {
    const match = memoryStore.matches.get(params[0]);
    return { rows: match ? [{ ...match }] : [] };
  }

  if (/SELECT m\.\*, u\.username as creator_username/i.test(normalized) && /WHERE m\.id = \$1/i.test(normalized)) {
    const match = memoryStore.matches.get(params[0]);
    if (!match) return { rows: [] };
    const creator = memoryStore.users.get(match.creator_id);
    const players = Array.from(memoryStore.match_players.values())
      .filter(mp => mp.match_id === match.id)
      .map(mp => {
        const u = memoryStore.users.get(mp.user_id);
        return {
          userId: mp.user_id,
          username: u?.username || u?.first_name || 'Player',
          color: mp.color,
          position: mp.position,
          status: mp.status,
          isReady: mp.is_ready
        };
      })
      .sort((a, b) => a.position - b.position);

    return {
      rows: [{
        ...match,
        creator_username: creator?.username,
        creator_name: creator?.first_name,
        players
      }]
    };
  }

  if (/SELECT m\.\*, u\.username as creator_username/i.test(normalized) && /WHERE m\.status IN/i.test(normalized)) {
    const matches = Array.from(memoryStore.matches.values())
      .filter(m => (m.status === 'waiting' || m.status === 'playing') && m.visibility === 'public')
      .map(m => {
        const creator = memoryStore.users.get(m.creator_id);
        return {
          ...m,
          creator_username: creator?.username,
          creator_name: creator?.first_name
        };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { rows: matches };
  }

  if (/UPDATE matches SET current_players/i.test(normalized)) {
    const matchId = params[params.length - 1];
    const match = memoryStore.matches.get(matchId);
    if (match) {
      const matchNum = normalized.match(/current_players\s*=\s*(\d+)/i);
      if (matchNum) {
        match.current_players = parseInt(matchNum[1], 10);
      } else if (typeof params[0] === 'number') {
        match.current_players = params[0];
      } else {
        match.current_players = Math.max(0, (match.current_players || 1) - 1);
      }
    }
    return { rows: [] };
  }

  if (/UPDATE matches SET status = 'cancelled'/i.test(normalized)) {
    const match = memoryStore.matches.get(params[0]);
    if (match) {
      match.status = 'cancelled';
      match.cancelled_at = new Date().toISOString();
    }
    return { rows: [] };
  }

  if (/UPDATE match_players SET status = 'left'/i.test(normalized)) {
    const matchId = params[0];
    const userId = params[1];
    for (const mp of memoryStore.match_players.values()) {
      if (mp.match_id === matchId && mp.user_id === userId) {
        mp.status = 'left';
        mp.left_at = new Date().toISOString();
      }
    }
    return { rows: [] };
  }

  if (/SELECT COUNT\(\*\) FROM match_players WHERE match_id = \$1 AND status NOT IN/i.test(normalized)) {
    const matchId = params[0];
    const activeCount = Array.from(memoryStore.match_players.values())
      .filter(mp => mp.match_id === matchId && mp.status !== 'left' && mp.status !== 'disconnected')
      .length;
    return { rows: [{ count: String(activeCount) }] };
  }

  if (/UPDATE matches SET status = 'playing', started_at = NOW\(\) WHERE id = \$1/i.test(normalized)) {
    const match = memoryStore.matches.get(params[0]);
    if (match) {
      match.status = 'playing';
      match.started_at = new Date().toISOString();
    }
    return { rows: [] };
  }

  if (/UPDATE matches SET status = 'completed'/i.test(normalized)) {
    const match = memoryStore.matches.get(params[0]);
    if (match) {
      match.status = 'completed';
      match.winner_id = params[1];
      match.completed_at = new Date().toISOString();
    }
    return { rows: [] };
  }

  // 4. match_players queries
  if (/INSERT INTO match_players/i.test(normalized)) {
    const id = uuidv4();
    const mp = {
      id,
      match_id: params[0],
      user_id: params[1],
      color: params[2],
      position: params[3],
      status: params[4] || 'waiting',
      is_ready: false,
      joined_at: new Date().toISOString()
    };
    memoryStore.match_players.set(id, mp);
    return { rows: [{ ...mp }] };
  }

  if (/SELECT color, position FROM match_players WHERE match_id = \$1/i.test(normalized)) {
    const slots = Array.from(memoryStore.match_players.values())
      .filter(mp => mp.match_id === params[0])
      .map(mp => ({ color: mp.color, position: mp.position }));
    return { rows: slots };
  }

  if (/SELECT id FROM match_players WHERE match_id = \$1 AND user_id = \$2/i.test(normalized)) {
    const found = Array.from(memoryStore.match_players.values())
      .find(mp => mp.match_id === params[0] && mp.user_id === params[1]);
    return { rows: found ? [{ id: found.id }] : [] };
  }

  if (/SELECT mp\.\*, u\.username/i.test(normalized)) {
    const matchId = params[0];
    const players = Array.from(memoryStore.match_players.values())
      .filter(mp => mp.match_id === matchId)
      .map(mp => {
        const u = memoryStore.users.get(mp.user_id);
        return {
          ...mp,
          username: u?.username,
          first_name: u?.first_name,
          telegram_id: u?.telegram_id
        };
      })
      .sort((a, b) => a.position - b.position);
    return { rows: players };
  }

  // 5. game_states queries
  if (/INSERT INTO game_states/i.test(normalized)) {
    const matchId = params[0];
    const gs = {
      id: uuidv4(),
      match_id: matchId,
      current_player_index: params[1],
      turn_number: params[2],
      phase: params[3],
      board_state: typeof params[4] === 'string' ? JSON.parse(params[4]) : params[4],
      dice_value: null,
      dice_rolled: false,
      consecutive_sixes: 0
    };
    memoryStore.game_states.set(matchId, gs);
    return { rows: [{ ...gs }] };
  }

  if (/UPDATE game_states SET/i.test(normalized)) {
    const matchId = params[0];
    const gs = memoryStore.game_states.get(matchId) || { match_id: matchId };
    gs.current_player_index = params[1];
    gs.turn_number = params[2];
    gs.phase = params[3];
    gs.board_state = typeof params[4] === 'string' ? JSON.parse(params[4]) : params[4];
    gs.dice_value = params[5];
    gs.dice_rolled = params[6];
    gs.consecutive_sixes = params[7] || 0;
    gs.updated_at = new Date().toISOString();
    memoryStore.game_states.set(matchId, gs);
    return { rows: [{ ...gs }] };
  }

  if (/SELECT gs\.\*, m\.status as match_status/i.test(normalized)) {
    const matchId = params[0];
    const gs = memoryStore.game_states.get(matchId);
    const match = memoryStore.matches.get(matchId);
    if (!gs || !match) return { rows: [] };

    const players = Array.from(memoryStore.match_players.values())
      .filter(mp => mp.match_id === matchId)
      .map(mp => {
        const u = memoryStore.users.get(mp.user_id);
        return {
          userId: mp.user_id,
          username: u?.username || u?.first_name || 'Player',
          color: mp.color,
          position: mp.position
        };
      })
      .sort((a, b) => a.position - b.position);

    return {
      rows: [{
        ...gs,
        match_status: match.status,
        players
      }]
    };
  }

  // 6. Comments queries
  if (/INSERT INTO comments/i.test(normalized)) {
    const comment = {
      id: uuidv4(),
      match_id: params[0],
      user_id: params[1],
      message: params[2],
      is_deleted: false,
      created_at: new Date().toISOString()
    };
    memoryStore.comments.push(comment);
    return { rows: [{ ...comment }] };
  }

  if (/SELECT c\.\*, u\.username/i.test(normalized)) {
    const matchId = params[0];
    const coms = memoryStore.comments
      .filter(c => c.match_id === matchId && !c.is_deleted)
      .map(c => {
        const u = memoryStore.users.get(c.user_id);
        const reactList = memoryStore.reactions.filter(r => r.comment_id === c.id);
        return {
          ...c,
          username: u?.username,
          first_name: u?.first_name,
          reactions: reactList.map(r => ({ emoji: r.emoji, userId: r.user_id }))
        };
      });
    return { rows: coms };
  }

  // 7. Reactions queries
  if (/INSERT INTO reactions/i.test(normalized)) {
    const r = {
      id: uuidv4(),
      comment_id: params[0],
      user_id: params[1],
      emoji: params[2],
      created_at: new Date().toISOString()
    };
    memoryStore.reactions.push(r);
    return { rows: [{ ...r }] };
  }

  // 8. Leaderboard
  if (/SELECT u\.id, u\.username.*FROM users u JOIN player_profiles pp/i.test(normalized)) {
    const list = Array.from(memoryStore.users.values()).map(u => {
      const pp = memoryStore.player_profiles.get(u.id) || {
        total_matches: 0, wins: 0, losses: 0, win_streak: 0, best_win_streak: 0, total_xp: 0, level: 1
      };
      const winRate = pp.total_matches > 0 ? ((pp.wins / pp.total_matches) * 100).toFixed(1) : 0;
      return {
        id: u.id,
        username: u.username,
        first_name: u.first_name,
        photo_url: u.photo_url,
        ...pp,
        win_percentage: winRate
      };
    }).sort((a, b) => b.wins - a.wins);

    list.forEach((item, idx) => { item.rank = idx + 1; });
    return { rows: list };
  }

  // 9. Admin Stats
  if (/SELECT COUNT\(\*\) as total, SUM\(CASE WHEN is_banned/i.test(normalized)) {
    const total = memoryStore.users.size;
    const banned = Array.from(memoryStore.users.values()).filter(u => u.is_banned).length;
    return { rows: [{ total, banned }] };
  }

  if (/SELECT COUNT\(\*\) as total, SUM\(CASE WHEN status = 'playing'/i.test(normalized)) {
    const total = memoryStore.matches.size;
    const active = Array.from(memoryStore.matches.values()).filter(m => m.status === 'playing').length;
    const completed = Array.from(memoryStore.matches.values()).filter(m => m.status === 'completed').length;
    return { rows: [{ total, active, completed }] };
  }

  if (/SELECT COUNT\(\*\) as total FROM comments/i.test(normalized)) {
    return { rows: [{ total: memoryStore.comments.filter(c => !c.is_deleted).length }] };
  }

  // Fallback default
  return { rows: [] };
}

async function query(text, params) {
  if (useMemoryStore) {
    return queryMemoryStore(text, params);
  }

  const p = getPool();
  if (!p) {
    return queryMemoryStore(text, params);
  }

  const start = Date.now();
  try {
    const result = await p.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn('Slow query detected:', { text, duration });
    }
    return result;
  } catch (error) {
    console.error('Database query error:', { text, error: error.message });
    throw error;
  }
}

async function getClient() {
  if (useMemoryStore) {
    return {
      query: (t, p) => Promise.resolve(queryMemoryStore(t, p)),
      release: () => {}
    };
  }

  const p = getPool();
  if (!p) {
    return {
      query: (t, p) => Promise.resolve(queryMemoryStore(t, p)),
      release: () => {}
    };
  }

  const client = await p.connect();
  const originalQuery = client.query.bind(client);
  const release = client.release.bind(client);

  client.query = (...args) => {
    client.lastQuery = args;
    return originalQuery(...args);
  };

  client.release = () => {
    client.query = originalQuery;
    client.release = release;
    return release();
  };

  return client;
}

async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️ WARNING: DATABASE_URL not set in production. Using in-memory store. Configure DATABASE_URL in Render for persistent game data.');
    } else {
      console.log('ℹ️ DATABASE_URL not set — activating high-speed in-memory database store for local dev');
    }
    useMemoryStore = true;
    return;
  }

  try {
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query('SELECT NOW()');
      console.log('✅ PostgreSQL connection test successful');
    } finally {
      client.release();
    }
    await runMigrations();
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      console.error(`❌ PostgreSQL connection failed in production: ${err.message}`);
      throw err;
    }
    console.warn(`⚠️ PostgreSQL connection failed (${err.message}). Activating in-memory database store for local dev.`);
    useMemoryStore = true;
  }
}

async function runMigrations() {
  if (useMemoryStore) return;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    const migration001 = await client.query(
      "SELECT id FROM migrations WHERE name = '001_core_tables'"
    );

    if (migration001.rows.length === 0) {
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          telegram_id BIGINT UNIQUE NOT NULL,
          username VARCHAR(255),
          first_name VARCHAR(255) NOT NULL,
          last_name VARCHAR(255),
          photo_url TEXT,
          language_code VARCHAR(10) DEFAULT 'en',
          is_admin BOOLEAN DEFAULT FALSE,
          is_banned BOOLEAN DEFAULT FALSE,
          ban_reason TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS player_profiles (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          total_matches INTEGER DEFAULT 0,
          wins INTEGER DEFAULT 0,
          losses INTEGER DEFAULT 0,
          draws INTEGER DEFAULT 0,
          win_streak INTEGER DEFAULT 0,
          best_win_streak INTEGER DEFAULT 0,
          total_xp INTEGER DEFAULT 0,
          level INTEGER DEFAULT 1,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS matches (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          room_code VARCHAR(10) UNIQUE NOT NULL,
          name VARCHAR(255),
          status VARCHAR(50) DEFAULT 'waiting',
          visibility VARCHAR(20) DEFAULT 'public',
          max_players INTEGER DEFAULT 4,
          current_players INTEGER DEFAULT 0,
          creator_id UUID REFERENCES users(id),
          winner_id UUID REFERENCES users(id),
          started_at TIMESTAMP WITH TIME ZONE,
          completed_at TIMESTAMP WITH TIME ZONE,
          cancelled_at TIMESTAMP WITH TIME ZONE,
          settings JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS match_players (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          color VARCHAR(20) NOT NULL,
          position INTEGER NOT NULL,
          status VARCHAR(50) DEFAULT 'waiting',
          is_ready BOOLEAN DEFAULT FALSE,
          joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          left_at TIMESTAMP WITH TIME ZONE,
          finished_position INTEGER,
          UNIQUE(match_id, user_id),
          UNIQUE(match_id, color),
          UNIQUE(match_id, position)
        );

        CREATE TABLE IF NOT EXISTS game_states (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          match_id UUID UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
          current_player_index INTEGER DEFAULT 0,
          turn_number INTEGER DEFAULT 0,
          phase VARCHAR(50) DEFAULT 'waiting',
          board_state JSONB NOT NULL DEFAULT '{}',
          dice_value INTEGER,
          dice_rolled BOOLEAN DEFAULT FALSE,
          consecutive_sixes INTEGER DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS game_moves (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
          user_id UUID REFERENCES users(id),
          turn_number INTEGER NOT NULL,
          move_type VARCHAR(50) NOT NULL,
          dice_value INTEGER,
          token_id INTEGER,
          from_position INTEGER,
          to_position INTEGER,
          captured_token JSONB,
          move_data JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS spectators (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          left_at TIMESTAMP WITH TIME ZONE,
          UNIQUE(match_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS comments (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          message TEXT NOT NULL,
          message_type VARCHAR(20) DEFAULT 'text',
          is_deleted BOOLEAN DEFAULT FALSE,
          deleted_by UUID REFERENCES users(id),
          is_system BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS reactions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          emoji VARCHAR(10) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(comment_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS notifications (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          type VARCHAR(50) NOT NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT,
          data JSONB DEFAULT '{}',
          is_read BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS reports (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          reporter_id UUID REFERENCES users(id),
          reported_user_id UUID REFERENCES users(id),
          comment_id UUID REFERENCES comments(id),
          match_id UUID REFERENCES matches(id),
          reason VARCHAR(255) NOT NULL,
          description TEXT,
          status VARCHAR(50) DEFAULT 'pending',
          resolved_by UUID REFERENCES users(id),
          resolved_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS achievements (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(255) UNIQUE NOT NULL,
          description TEXT,
          icon VARCHAR(255),
          xp_reward INTEGER DEFAULT 0,
          condition_type VARCHAR(50),
          condition_value INTEGER,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS user_achievements (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          achievement_id UUID REFERENCES achievements(id),
          earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(user_id, achievement_id)
        );

        CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
        CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
        CREATE INDEX IF NOT EXISTS idx_matches_visibility ON matches(visibility);
        CREATE INDEX IF NOT EXISTS idx_match_players_match_id ON match_players(match_id);
        CREATE INDEX IF NOT EXISTS idx_match_players_user_id ON match_players(user_id);
        CREATE INDEX IF NOT EXISTS idx_game_moves_match_id ON game_moves(match_id);
        CREATE INDEX IF NOT EXISTS idx_comments_match_id ON comments(match_id);
        CREATE INDEX IF NOT EXISTS idx_spectators_match_id ON spectators(match_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
      `);

      await client.query("INSERT INTO migrations (name) VALUES ('001_core_tables')");
      console.log('✅ PostgreSQL Migration 001_core_tables executed');
    }

    const mig002 = await client.query("SELECT id FROM migrations WHERE name = '002_group_gaming'");
    if (mig002.rows.length === 0) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS telegram_groups (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          telegram_id BIGINT UNIQUE NOT NULL,
          title VARCHAR(255),
          type VARCHAR(50) DEFAULT 'group',
          settings JSONB DEFAULT '{"allowGameCreation": true, "maxPlayers": 4, "announcements": true, "allowSpectators": true}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        ALTER TABLE matches ADD COLUMN IF NOT EXISTS telegram_group_id BIGINT;
        ALTER TABLE matches ADD COLUMN IF NOT EXISTS telegram_message_id BIGINT;

        CREATE INDEX IF NOT EXISTS idx_matches_telegram_group_id ON matches(telegram_group_id);
        CREATE INDEX IF NOT EXISTS idx_telegram_groups_telegram_id ON telegram_groups(telegram_id);

        CREATE TABLE IF NOT EXISTS group_announcements (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          telegram_group_id BIGINT NOT NULL,
          match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
          announcement_type VARCHAR(50) NOT NULL,
          telegram_message_id BIGINT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_group_announcements_group_id ON group_announcements(telegram_group_id);
      `);

      await client.query("INSERT INTO migrations (name) VALUES ('002_group_gaming')");
      console.log('✅ PostgreSQL Migration 002_group_gaming executed');
    }

    await client.query('COMMIT');
    console.log('✅ PostgreSQL migrations completed');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('PostgreSQL migration error:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { query, getClient, initializeDatabase, getPool, memoryStore };
