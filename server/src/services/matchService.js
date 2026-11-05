const { v4: uuidv4 } = require('uuid');
const { query, getClient } = require('../database/db');
const { initializeGameState, getPublicGameState } = require('../game/ludoEngine');

// In-memory game states (would use Redis in production)
const activeGameStates = new Map();
const matchCompletedHooks = [];
const matchStartedHooks = [];

function onMatchCompleted(callback) {
  if (typeof callback === 'function') {
    matchCompletedHooks.push(callback);
  }
}

function onMatchStarted(callback) {
  if (typeof callback === 'function') {
    matchStartedHooks.push(callback);
  }
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function createMatch(userId, options = {}) {
  const { 
    name, 
    maxPlayers = 4, 
    visibility = 'public', 
    settings = {}, 
    telegramGroupId = null, 
    telegramMessageId = null 
  } = options;
  
  let roomCode;
  let attempts = 0;
  do {
    roomCode = generateRoomCode();
    attempts++;
    if (attempts > 10) throw new Error('Failed to generate unique room code');
  } while (await roomCodeExists(roomCode));

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const matchResult = await client.query(
      `INSERT INTO matches (room_code, name, max_players, visibility, creator_id, settings, telegram_group_id, telegram_message_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        roomCode, 
        name || `Match ${roomCode}`, 
        maxPlayers, 
        visibility, 
        userId, 
        typeof settings === 'string' ? settings : JSON.stringify(settings),
        telegramGroupId ? String(telegramGroupId) : null,
        telegramMessageId ? String(telegramMessageId) : null
      ]
    );
    const match = matchResult.rows[0];

    // Add creator as first player
    const colors = ['red', 'blue', 'green', 'yellow'];
    await client.query(
      `INSERT INTO match_players (match_id, user_id, color, position, status)
       VALUES ($1, $2, $3, $4, 'waiting')`,
      [match.id, userId, colors[0], 0]
    );

    await client.query(
      'UPDATE matches SET current_players = 1 WHERE id = $1',
      [match.id]
    );

    await client.query('COMMIT');
    return { ...match, current_players: 1 };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function joinMatch(matchId, userId) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Lock the match row
    const matchResult = await client.query(
      'SELECT * FROM matches WHERE id = $1 FOR UPDATE',
      [matchId]
    );
    
    if (matchResult.rows.length === 0) {
      throw new Error('Match not found');
    }

    const match = matchResult.rows[0];

    if (match.status !== 'waiting') {
      throw new Error('Match is not accepting players');
    }

    if (match.current_players >= match.max_players) {
      throw new Error('Match is full');
    }

    // Check if already in match
    const existingPlayer = await client.query(
      'SELECT id FROM match_players WHERE match_id = $1 AND user_id = $2',
      [matchId, userId]
    );

    if (existingPlayer.rows.length > 0) {
      throw new Error('Already in this match');
    }

    // Find next available color and position
    const takenSlots = await client.query(
      'SELECT color, position FROM match_players WHERE match_id = $1',
      [matchId]
    );
    
    const takenColors = new Set(takenSlots.rows.map(r => r.color));
    const takenPositions = new Set(takenSlots.rows.map(r => r.position));
    const colors = ['red', 'blue', 'green', 'yellow'];
    
    const availableColor = colors.find(c => !takenColors.has(c));
    const availablePosition = [0, 1, 2, 3].find(p => !takenPositions.has(p));

    if (!availableColor) throw new Error('No available colors');

    await client.query(
      `INSERT INTO match_players (match_id, user_id, color, position, status)
       VALUES ($1, $2, $3, $4, 'waiting')`,
      [matchId, userId, availableColor, availablePosition]
    );

    const newPlayerCount = match.current_players + 1;
    await client.query(
      'UPDATE matches SET current_players = $1 WHERE id = $2',
      [newPlayerCount, matchId]
    );

    await client.query('COMMIT');
    
    return {
      match: { ...match, current_players: newPlayerCount },
      playerColor: availableColor,
      playerPosition: availablePosition
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function startMatch(matchId, userId) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const matchResult = await client.query(
      'SELECT * FROM matches WHERE id = $1 FOR UPDATE',
      [matchId]
    );

    if (matchResult.rows.length === 0) throw new Error('Match not found');
    const match = matchResult.rows[0];

    if (match.creator_id !== userId) throw new Error('Only the creator can start the match');
    if (match.status !== 'waiting') throw new Error('Match cannot be started');
    if (match.current_players < 2) throw new Error('Need at least 2 players to start');

    // Get all players
    const playersResult = await client.query(
      `SELECT mp.*, u.username, u.first_name, u.telegram_id
       FROM match_players mp
       JOIN users u ON mp.user_id = u.id
       WHERE mp.match_id = $1
       ORDER BY mp.position`,
      [matchId]
    );

    const players = playersResult.rows.map(p => ({
      userId: p.user_id,
      username: p.username || p.first_name,
      color: p.color,
      position: p.position
    }));

    // Initialize game state
    const gameState = initializeGameState(players);
    
    // Save game state to DB
    await client.query(
      `INSERT INTO game_states (match_id, current_player_index, turn_number, phase, board_state)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (match_id) DO UPDATE SET
         current_player_index = $2, turn_number = $3, phase = $4, board_state = $5, updated_at = NOW()`,
      [matchId, 0, 1, 'playing', JSON.stringify(gameState.boardState)]
    );

    await client.query(
      `UPDATE matches SET status = 'playing', started_at = NOW() WHERE id = $1`,
      [matchId]
    );

    await client.query('COMMIT');

    // Store in memory
    activeGameStates.set(matchId, gameState);

    // Trigger match start hooks (e.g. for Telegram group announcement)
    try {
      const startedMatch = await query('SELECT * FROM matches WHERE id = $1', [matchId]);
      if (startedMatch.rows.length > 0) {
        for (const hook of matchStartedHooks) {
          try {
            hook(startedMatch.rows[0], players);
          } catch (hookErr) {
            console.warn('Match start hook error:', hookErr.message);
          }
        }
      }
    } catch (e) {
      console.warn('Trigger start hooks error:', e.message);
    }

    return { match: { ...match, status: 'playing' }, gameState };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getGameState(matchId) {
  // Check in-memory first
  if (activeGameStates.has(matchId)) {
    return activeGameStates.get(matchId);
  }

  // Load from database
  const result = await query(
    `SELECT gs.*, m.status as match_status,
     json_agg(json_build_object(
       'userId', mp.user_id,
       'username', COALESCE(u.username, u.first_name),
       'color', mp.color,
       'position', mp.position
     ) ORDER BY mp.position) as players
     FROM game_states gs
     JOIN matches m ON gs.match_id = m.id
     JOIN match_players mp ON m.id = mp.match_id
     JOIN users u ON mp.user_id = u.id
     WHERE gs.match_id = $1
     GROUP BY gs.id, m.status`,
    [matchId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const gameState = {
    phase: row.phase,
    players: row.players,
    currentPlayerIndex: row.current_player_index,
    turnNumber: row.turn_number,
    boardState: row.board_state,
    diceValue: row.dice_value,
    diceRolled: row.dice_rolled,
    consecutiveSixes: row.consecutive_sixes || 0,
    winners: [],
    lastAction: null
  };

  activeGameStates.set(matchId, gameState);
  return gameState;
}

async function saveGameState(matchId, gameState) {
  activeGameStates.set(matchId, gameState);
  
  // Persist to DB asynchronously
  query(
    `UPDATE game_states SET 
     current_player_index = $2, turn_number = $3, phase = $4,
     board_state = $5, dice_value = $6, dice_rolled = $7,
     consecutive_sixes = $8, updated_at = NOW()
     WHERE match_id = $1`,
    [
      matchId,
      gameState.currentPlayerIndex,
      gameState.turnNumber,
      gameState.phase,
      JSON.stringify(gameState.boardState),
      gameState.diceValue,
      gameState.diceRolled,
      gameState.consecutiveSixes || 0
    ]
  ).catch(err => console.error('Failed to save game state:', err));
}

async function getPublicMatches() {
  const result = await query(
    `SELECT m.*, u.username as creator_username, u.first_name as creator_name
     FROM matches m
     JOIN users u ON m.creator_id = u.id
     WHERE m.status IN ('waiting', 'playing') AND m.visibility = 'public'
     ORDER BY m.created_at DESC
     LIMIT 20`
  );
  return result.rows;
}

async function getMatchById(matchId) {
  const result = await query(
    `SELECT m.*, u.username as creator_username, u.first_name as creator_name,
     json_agg(json_build_object(
       'userId', mp.user_id,
       'username', COALESCE(u2.username, u2.first_name),
       'color', mp.color,
       'position', mp.position,
       'status', mp.status,
       'isReady', mp.is_ready
     ) ORDER BY mp.position) FILTER (WHERE mp.id IS NOT NULL) as players
     FROM matches m
     JOIN users u ON m.creator_id = u.id
     LEFT JOIN match_players mp ON m.id = mp.match_id
     LEFT JOIN users u2 ON mp.user_id = u2.id
     WHERE m.id = $1
     GROUP BY m.id, u.username, u.first_name`,
    [matchId]
  );
  return result.rows[0] || null;
}

async function getMatchByRoomCode(roomCode) {
  const result = await query(
    'SELECT * FROM matches WHERE room_code = $1',
    [roomCode.toUpperCase()]
  );
  return result.rows[0] || null;
}

async function roomCodeExists(roomCode) {
  const result = await query(
    'SELECT id FROM matches WHERE room_code = $1',
    [roomCode]
  );
  return result.rows.length > 0;
}

async function saveMove(matchId, userId, moveData) {
  await query(
    `INSERT INTO game_moves (match_id, user_id, turn_number, move_type, dice_value, token_id, from_position, to_position, captured_token, move_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      matchId, userId, moveData.turnNumber, moveData.type,
      moveData.diceValue, moveData.tokenId, moveData.from,
      moveData.to, JSON.stringify(moveData.captured || null),
      JSON.stringify(moveData)
    ]
  );
}

async function completeMatch(matchId, winners) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const winnerId = winners[0]?.userId || null;
    
    await client.query(
      `UPDATE matches SET status = 'completed', winner_id = $2, completed_at = NOW() WHERE id = $1`,
      [matchId, winnerId]
    );

    // Update player profiles
    for (let i = 0; i < winners.length; i++) {
      const winner = winners[i];
      const isWin = i === 0;
      
      await client.query(
        `INSERT INTO player_profiles (user_id, total_matches, wins, losses, win_streak, best_win_streak, total_xp)
         VALUES ($1, 1, $2, $3, $4, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET
           total_matches = player_profiles.total_matches + 1,
           wins = player_profiles.wins + $2,
           losses = player_profiles.losses + $3,
           win_streak = CASE WHEN $2 = 1 THEN player_profiles.win_streak + 1 ELSE 0 END,
           best_win_streak = GREATEST(player_profiles.best_win_streak, 
             CASE WHEN $2 = 1 THEN player_profiles.win_streak + 1 ELSE player_profiles.best_win_streak END),
           total_xp = player_profiles.total_xp + $5,
           level = GREATEST(1, (player_profiles.total_xp + $5) / 1000 + 1),
           updated_at = NOW()`,
        [winner.userId, isWin ? 1 : 0, isWin ? 0 : 1, isWin ? 1 : 0, isWin ? 100 : 25]
      );
    }

    await client.query('COMMIT');
    activeGameStates.delete(matchId);

    // Trigger match completion hooks (e.g. for Telegram group announcement)
    try {
      const finishedMatch = await query('SELECT * FROM matches WHERE id = $1', [matchId]);
      if (finishedMatch.rows.length > 0) {
        for (const hook of matchCompletedHooks) {
          try {
            hook(finishedMatch.rows[0], winners);
          } catch (hookErr) {
            console.warn('Match completion hook error:', hookErr.message);
          }
        }
      }
    } catch (annErr) {
      console.warn('Announcement trigger error:', annErr.message);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function leaveMatch(matchId, userId) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE match_players SET status = 'left', left_at = NOW()
       WHERE match_id = $1 AND user_id = $2`,
      [matchId, userId]
    );

    await client.query(
      `UPDATE matches SET current_players = GREATEST(0, current_players - 1)
       WHERE id = $1`,
      [matchId]
    );

    // Check if match should be cancelled
    const remaining = await client.query(
      `SELECT COUNT(*) FROM match_players WHERE match_id = $1 AND status NOT IN ('left', 'disconnected')`,
      [matchId]
    );

    const matchResult = await client.query(
      'SELECT status FROM matches WHERE id = $1',
      [matchId]
    );

    const remainingCount = parseInt(remaining?.rows?.[0]?.count ?? 0, 10);
    const matchStatus = matchResult?.rows?.[0]?.status;

    if (remainingCount < 2 && matchStatus === 'waiting') {
      await client.query(
        `UPDATE matches SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`,
        [matchId]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateMatchTelegramMessage(matchId, messageId) {
  return await query(
    'UPDATE matches SET telegram_message_id = $1 WHERE id = $2',
    [messageId ? String(messageId) : null, matchId]
  );
}

async function getWaitingMatchByGroup(telegramGroupId) {
  const result = await query(
    `SELECT * FROM matches 
     WHERE telegram_group_id = $1 AND status = 'waiting' 
     ORDER BY created_at DESC LIMIT 1`,
    [String(telegramGroupId)]
  );
  return result.rows[0] || null;
}

async function getActiveGroupMatches(telegramGroupId) {
  const result = await query(
    `SELECT * FROM matches 
     WHERE telegram_group_id = $1 AND status IN ('waiting', 'playing') 
     ORDER BY created_at DESC`,
    [String(telegramGroupId)]
  );
  return result.rows;
}

async function cancelMatch(matchId, userId, isAdmin = false) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const matchResult = await client.query(
      'SELECT * FROM matches WHERE id = $1 FOR UPDATE',
      [matchId]
    );
    if (matchResult.rows.length === 0) throw new Error('Match not found');
    const match = matchResult.rows[0];

    if (!isAdmin && match.creator_id !== userId) {
      throw new Error('Only the host or an administrator can cancel this match');
    }

    if (match.status === 'completed' || match.status === 'cancelled') {
      throw new Error(`Match is already ${match.status}`);
    }

    await client.query(
      `UPDATE matches SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`,
      [matchId]
    );

    await client.query('COMMIT');
    activeGameStates.delete(matchId);
    return { ...match, status: 'cancelled' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  createMatch,
  joinMatch,
  startMatch,
  cancelMatch,
  getGameState,
  saveGameState,
  getPublicMatches,
  getMatchById,
  getMatchByRoomCode,
  saveMove,
  completeMatch,
  leaveMatch,
  updateMatchTelegramMessage,
  getWaitingMatchByGroup,
  getActiveGroupMatches,
  onMatchCompleted,
  onMatchStarted,
  activeGameStates
};
